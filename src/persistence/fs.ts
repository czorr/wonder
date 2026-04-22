import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  rename,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { componentFilePath, hydrateComponents, serializeMeta } from "./projectFile";
import { migrateProjectFile, ProjectFileError } from "./migrate";
import type { LoadedProject, ProjectFile } from "./types";
import type { WonderComponent } from "@/store/project";

const PROJECT_META_FILE = "wonder.json";
const COMPONENTS_DIR = "components";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Join path segments with forward slashes (works cross-platform in Tauri fs). */
function join(...parts: string[]): string {
  return parts
    .map((p, i) => {
      // Strip leading slash on non-first parts, trailing slash on non-last.
      if (i > 0) p = p.replace(/^[\\/]+/, "");
      if (i < parts.length - 1) p = p.replace(/[\\/]+$/, "");
      return p;
    })
    .join("/");
}

function basename(p: string): string {
  const m = p.match(/([^\\/]+)[\\/]*$/);
  return m ? m[1] : p;
}

// ---------------------------------------------------------------------------
// Atomic write — never corrupt the target if the write is interrupted.
// ---------------------------------------------------------------------------

/**
 * Write text content atomically: write to `path.tmp`, then rename over `path`.
 *
 * POSIX rename is atomic; on Windows, rename onto an existing file fails, so
 * we remove the target first. The tiny gap between remove+rename on Windows
 * is still safer than a partial overwrite because there's no half-written
 * target visible to readers that observe the moment in between.
 */
async function writeAtomic(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeTextFile(tmp, contents);
  try {
    await rename(tmp, path);
  } catch {
    // Windows fallback.
    try {
      if (await exists(path)) await remove(path);
    } catch {
      // fall through — rename will surface the real error
    }
    await rename(tmp, path);
  }
}

async function ensureDir(path: string): Promise<void> {
  if (await exists(path)) return;
  await mkdir(path, { recursive: true });
}

// ---------------------------------------------------------------------------
// Read a project folder
// ---------------------------------------------------------------------------

/**
 * Load a Wonder project from a folder on disk.
 *
 * Expects: `<path>/wonder.json` plus one .tsx file per component under
 * `<path>/components/<folder>/<filename>`. Component entries whose source
 * file is missing are dropped with a console warning rather than failing
 * the whole open — lets users recover partially when a file was deleted
 * outside Wonder.
 */
export async function readProjectFolder(path: string): Promise<LoadedProject> {
  const metaPath = join(path, PROJECT_META_FILE);
  if (!(await exists(metaPath))) {
    throw new ProjectFileError(
      `No wonder.json found in ${basename(path)}. Not a Wonder project folder.`,
      "read-failed",
    );
  }

  let rawJson: string;
  try {
    rawJson = await readTextFile(metaPath);
  } catch (err) {
    throw new ProjectFileError(
      `Could not read wonder.json: ${stringifyErr(err)}`,
      "read-failed",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    throw new ProjectFileError(
      `wonder.json is not valid JSON: ${stringifyErr(err)}`,
      "invalid-shape",
    );
  }

  const meta = migrateProjectFile(parsed);

  // Pull each component's source from disk.
  const sources: Record<string, string> = {};
  const missing: string[] = [];
  await Promise.all(
    meta.components.map(async (c) => {
      const filePath = join(path, componentFilePath(c));
      try {
        sources[c.id] = await readTextFile(filePath);
      } catch {
        missing.push(componentFilePath(c));
      }
    }),
  );
  if (missing.length > 0) {
    console.warn(
      `[wonder] ${missing.length} component source file(s) missing in ${basename(
        path,
      )}:`,
      missing,
    );
  }

  return { path, meta, sources };
}

// ---------------------------------------------------------------------------
// Write a project folder
// ---------------------------------------------------------------------------

type WriteProjectArgs = {
  path: string; // absolute folder
  components: Record<string, WonderComponent>;
  order: string[];
  propValues: Record<string, Record<string, string>>;
  canvas: { zoom: number; pan: { x: number; y: number } };
  selection: {
    componentId: string | null;
    elementPath: string | null;
    openTabs: string[];
    activeTab: string | null;
  };
  name: string;
  createdAt: string;
  tailwindConfig?: string | null;
};

/**
 * Write the current in-memory project to `path`. Idempotent — safe to call
 * repeatedly (e.g. manual save). Creates `components/` subtree as needed.
 *
 * Does NOT delete stale files from prior saves (e.g. a deleted component
 * whose .tsx file still exists). That cleanup happens in `pruneOrphans`.
 */
export async function writeProjectFolder(args: WriteProjectArgs): Promise<ProjectFile> {
  await ensureDir(args.path);
  await ensureDir(join(args.path, COMPONENTS_DIR));

  // 1) Write each component's .tsx to its subfolder.
  //    Group by folder to avoid re-mkdir'ing the same path N times.
  const dirs = new Set<string>();
  for (const id of args.order) {
    const c = args.components[id];
    if (!c) continue;
    const dir = c.folder
      ? join(args.path, COMPONENTS_DIR, c.folder)
      : join(args.path, COMPONENTS_DIR);
    dirs.add(dir);
  }
  await Promise.all(Array.from(dirs).map(ensureDir));

  await Promise.all(
    args.order.map(async (id) => {
      const c = args.components[id];
      if (!c) return;
      const filePath = join(args.path, componentFilePath(c));
      await writeAtomic(filePath, c.source);
    }),
  );

  // 2) Write wonder.json last, so readers that race the write always see
  //    either the old manifest + old files, or the new manifest + new files.
  const meta = serializeMeta({
    name: args.name,
    createdAt: args.createdAt,
    components: args.components,
    order: args.order,
    propValues: args.propValues,
    canvas: args.canvas,
    selection: args.selection,
    tailwindConfig: args.tailwindConfig ?? null,
  });
  await writeAtomic(
    join(args.path, PROJECT_META_FILE),
    JSON.stringify(meta, null, 2) + "\n",
  );
  return meta;
}

/**
 * Remove .tsx files under `components/` that are no longer referenced in the
 * manifest. Call this after a successful save to clean up after deletes and
 * renames. Best-effort — failures are logged but not thrown, because dangling
 * files are a mild mess, not a data-loss bug.
 */
export async function pruneOrphans(args: {
  path: string;
  components: Record<string, WonderComponent>;
  order: string[];
}): Promise<void> {
  const wanted = new Set<string>();
  for (const id of args.order) {
    const c = args.components[id];
    if (!c) continue;
    wanted.add(componentFilePath(c));
  }
  const componentsDir = join(args.path, COMPONENTS_DIR);
  if (!(await exists(componentsDir))) return;

  try {
    const orphans = await collectTsxFiles(componentsDir, "components");
    await Promise.all(
      orphans
        .filter((rel) => !wanted.has(rel))
        .map(async (rel) => {
          try {
            await remove(join(args.path, rel));
          } catch (err) {
            console.warn(`[wonder] Could not remove orphan ${rel}:`, err);
          }
        }),
    );
  } catch (err) {
    console.warn("[wonder] pruneOrphans failed:", err);
  }
}

/** Recursively list relative paths (from `relBase`) of .tsx files under `absDir`. */
async function collectTsxFiles(absDir: string, relBase: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readDir(absDir);
  for (const entry of entries) {
    const childAbs = join(absDir, entry.name);
    const childRel = join(relBase, entry.name);
    if (entry.isDirectory) {
      out.push(...(await collectTsxFiles(childAbs, childRel)));
    } else if (entry.isFile && /\.tsx?$/.test(entry.name)) {
      out.push(childRel);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export async function folderIsEmpty(path: string): Promise<boolean> {
  if (!(await exists(path))) return true;
  try {
    const entries = await readDir(path);
    return entries.length === 0;
  } catch {
    return false;
  }
}

export async function folderIsWonderProject(path: string): Promise<boolean> {
  return exists(join(path, PROJECT_META_FILE));
}

/** Convenience: load then hydrate into store-shaped structures. */
export async function openProject(path: string) {
  const loaded = await readProjectFolder(path);
  const { components, order } = hydrateComponents(loaded.meta, loaded.sources);
  return { path, meta: loaded.meta, components, order };
}

function stringifyErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export { join as joinPath, basename };
