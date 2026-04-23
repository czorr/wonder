// ---------------------------------------------------------------------------
// Assets persistence — bridges the on-disk `<project>/design/assets/` tree
// with the in-memory `useAssets` store.
//
// Layout on disk:
//
//   <project>/design/assets/
//     images/       ← PNG / JPG / SVG / etc., user-uploaded
//
// Nothing about assets lives in `wonder.json`. The folder IS the manifest.
// That keeps the file format flat (add a new category → new subfolder, no
// migration), lets users dump files in via Finder, and means versioning
// across Wonder / Git / external tools just works — there's nothing to
// diff.
// ---------------------------------------------------------------------------

import {
  exists,
  mkdir,
  readDir,
  readFile,
  remove,
  writeFile,
} from "@tauri-apps/plugin-fs";
import {
  assetPathFor,
  bytesToDataUrl,
  guessMime,
  type AssetKind,
  type WonderAsset,
} from "@/store/assets";

/** All asset subfolders Wonder maintains. Keep this in lockstep with
 *  `AssetKind` — adding a new category here makes the loader scan it. */
const ASSET_KINDS: AssetKind[] = ["images"];

function assetsDir(projectPath: string, kind: AssetKind): string {
  return `${projectPath}/design/assets/${kind}`;
}

async function ensureDir(path: string): Promise<void> {
  if (await exists(path)) return;
  await mkdir(path, { recursive: true });
}

/**
 * Make sure every asset subfolder exists. Called on project open + write.
 * Creating the folders eagerly means the user always sees a populated
 * `design/assets/` tree — even for a freshly-scaffolded project — so
 * drag-from-Finder into the panel has a sensible target from turn one.
 */
export async function ensureAssetDirs(projectPath: string): Promise<void> {
  await ensureDir(`${projectPath}/design/assets`);
  await Promise.all(ASSET_KINDS.map((k) => ensureDir(assetsDir(projectPath, k))));
}

/**
 * Stable id generator for assets. Shape mirrors the one used for components
 * (prefix + timestamp + short random) so debugging across stores feels
 * uniform. Not cryptographic — it only needs to be unique within a project.
 */
function newAssetId(): string {
  return `asset_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * Read every asset from disk and materialize it as a `WonderAsset` with a
 * data URL ready to hand to React. Partial failures (one unreadable file)
 * are logged and skipped — losing the whole grid because of a single
 * corrupt PNG would be worse than showing an incomplete one.
 */
export async function readAllAssets(
  projectPath: string,
): Promise<WonderAsset[]> {
  const out: WonderAsset[] = [];
  for (const kind of ASSET_KINDS) {
    const dir = assetsDir(projectPath, kind);
    if (!(await exists(dir))) continue;
    let entries: Awaited<ReturnType<typeof readDir>> = [];
    try {
      entries = await readDir(dir);
    } catch (err) {
      console.warn(`[wonder] could not read asset dir ${dir}:`, err);
      continue;
    }
    await Promise.all(
      entries
        .filter((e) => e.isFile && !e.name.startsWith("."))
        .map(async (e) => {
          const absPath = `${dir}/${e.name}`;
          try {
            const bytes = await readFile(absPath);
            const mime = guessMime(e.name);
            out.push({
              id: newAssetId(),
              kind,
              filename: e.name,
              path: assetPathFor(kind, e.name),
              mime,
              dataUrl: bytesToDataUrl(bytes, mime),
              size: bytes.byteLength,
            });
          } catch (err) {
            console.warn(`[wonder] could not read asset ${absPath}:`, err);
          }
        }),
    );
  }
  // Newest first by filename fallback — mtime isn't exposed by the Tauri fs
  // plugin without a separate stat call per file, and alphabetic is a
  // predictable default the user can sort mentally.
  out.sort((a, b) => a.filename.localeCompare(b.filename));
  return out;
}

/**
 * Write a brand-new asset to disk and return the fully-populated record
 * ready to push into the store. The caller supplies the raw bytes (from a
 * Tauri dialog + `readFile`, or from an HTML5 drop's File blob); we
 * handle the rest: ensuring the target folder exists, writing, and
 * computing the data URL.
 *
 * Filename collisions silently overwrite — the store does the same
 * (`addAsset` dedupes by path). This matches how users think about
 * "uploading the same icon again to refresh it".
 */
export async function writeAsset(args: {
  projectPath: string;
  kind: AssetKind;
  filename: string;
  bytes: Uint8Array;
}): Promise<WonderAsset> {
  const { projectPath, kind, filename, bytes } = args;
  const dir = assetsDir(projectPath, kind);
  await ensureDir(dir);
  const absPath = `${dir}/${filename}`;
  await writeFile(absPath, bytes);
  const mime = guessMime(filename);
  return {
    id: newAssetId(),
    kind,
    filename,
    path: assetPathFor(kind, filename),
    mime,
    dataUrl: bytesToDataUrl(bytes, mime),
    size: bytes.byteLength,
  };
}

/** Delete an asset from disk. Store removal is the caller's job. */
export async function deleteAsset(args: {
  projectPath: string;
  kind: AssetKind;
  filename: string;
}): Promise<void> {
  const absPath = `${assetsDir(args.projectPath, args.kind)}/${args.filename}`;
  if (!(await exists(absPath))) return;
  await remove(absPath);
}
