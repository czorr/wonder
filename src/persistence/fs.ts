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
import {
  defaultTokens,
  parseTokens,
  tokensToCss,
  type Tokens,
} from "@/project/tokens";

const PROJECT_META_FILE = "wonder.json";
const COMPONENTS_DIR = "components";

// v2 additions — design system lives in its own top-level folder so users
// editing the project in VS Code can find it without archaeology. `.wonder/`
// holds runtime/derived state (chat history, caches); everything in there
// can be regenerated and should be in the user's .gitignore eventually.
const DESIGN_DIR = "design";
const TOKENS_FILE = "design/tokens.json";
const TOKENS_CSS_FILE = "design/tokens.css";
const WONDER_RUNTIME_DIR = ".wonder";

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

  const { meta, fromVersion } = migrateProjectFile(parsed);

  // Pull each component's source + the design system tokens in parallel.
  // Missing sources are dropped with a warning (partial recovery); missing
  // or invalid tokens fall back to defaults (non-fatal — projects from
  // before v2 simply won't have the file yet).
  const sources: Record<string, string> = {};
  const missing: string[] = [];
  const [_, tokens] = await Promise.all([
    Promise.all(
      meta.components.map(async (c) => {
        const filePath = join(path, componentFilePath(c));
        try {
          sources[c.id] = await readTextFile(filePath);
        } catch {
          missing.push(componentFilePath(c));
        }
      }),
    ),
    readTokensFile(path),
  ]);
  if (missing.length > 0) {
    console.warn(
      `[wonder] ${missing.length} component source file(s) missing in ${basename(
        path,
      )}:`,
      missing,
    );
  }

  return { path, meta, sources, tokens, onDiskVersion: fromVersion };
}

// ---------------------------------------------------------------------------
// Design system I/O
//
// `design/tokens.json` is the authoritative data. `design/tokens.css` is a
// mirrored derivative for Tailwind v4 `@theme` consumption — we regenerate
// it on every save so hand-edits to the CSS get blown away (the header
// comment in `tokensToCss` warns the user about this).
//
// Missing tokens.json is NOT an error. Brand-new projects, legacy v1
// projects, and anything written by a user outside Wonder can all legally
// lack the file — we seed with defaults and the user edits/extracts later.
// ---------------------------------------------------------------------------

async function readTokensFile(absProjectPath: string): Promise<Tokens> {
  const p = join(absProjectPath, TOKENS_FILE);
  if (!(await exists(p))) return defaultTokens();
  try {
    const raw = await readTextFile(p);
    return parseTokens(JSON.parse(raw));
  } catch (err) {
    console.warn(
      `[wonder] design/tokens.json invalid — falling back to defaults:`,
      err,
    );
    return defaultTokens();
  }
}

async function writeTokensFiles(
  absProjectPath: string,
  tokens: Tokens,
): Promise<void> {
  await ensureDir(join(absProjectPath, DESIGN_DIR));
  await Promise.all([
    writeAtomic(
      join(absProjectPath, TOKENS_FILE),
      JSON.stringify(tokens, null, 2) + "\n",
    ),
    writeAtomic(join(absProjectPath, TOKENS_CSS_FILE), tokensToCss(tokens)),
  ]);
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
  tokens: Tokens;
};

/**
 * Write the current in-memory project to `path`. Idempotent — safe to call
 * repeatedly (e.g. manual save). Creates the standard subtree as needed:
 *
 *   <path>/
 *     wonder.json           (written LAST — acts as the commit marker)
 *     components/<…>/*.tsx
 *     design/tokens.json
 *     design/tokens.css     (generated from tokens.json)
 *     .wonder/              (runtime/derived; ensured to exist)
 *
 * Ordering matters: components → design → wonder.json. A reader racing the
 * write always sees either (old manifest + old files) or (new manifest +
 * new files), never a half-consistent pair.
 *
 * Does NOT delete stale files from prior saves. That cleanup happens in
 * `pruneOrphans`.
 */
export async function writeProjectFolder(args: WriteProjectArgs): Promise<ProjectFile> {
  await ensureDir(args.path);
  await ensureDir(join(args.path, COMPONENTS_DIR));

  // 1) Write each component's .tsx to its subfolder. Group by folder to
  //    avoid re-mkdir'ing the same path N times.
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

  // 2) Write design/ (tokens.json + generated tokens.css) and ensure the
  //    .wonder/ runtime dir exists. The runtime dir is empty at v2 launch —
  //    chat history and caches land in it in follow-up phases.
  await Promise.all([
    writeTokensFiles(args.path, args.tokens),
    ensureDir(join(args.path, WONDER_RUNTIME_DIR)),
  ]);

  // 3) Write wonder.json last — it's the "manifest exists" signal readers
  //    use to identify a Wonder project.
  const meta = serializeMeta({
    name: args.name,
    createdAt: args.createdAt,
    components: args.components,
    order: args.order,
    propValues: args.propValues,
    canvas: args.canvas,
    selection: args.selection,
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
  return {
    path,
    meta: loaded.meta,
    components,
    order,
    tokens: loaded.tokens,
    onDiskVersion: loaded.onDiskVersion,
  };
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
