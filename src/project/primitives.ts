// ---------------------------------------------------------------------------
// Primitives — the project's implicit pattern library.
//
// Convention (no schema field): any component whose `folder` is `primitives`
// or a subfolder of `primitives` (e.g. `primitives/forms`) is a "primitive".
// This is kept as a folder convention rather than a per-component flag so:
//
//   - Users editing the project in VS Code can promote a component just by
//     dropping its file into `components/primitives/` — no Wonder-specific
//     metadata required.
//   - The repo structure on disk IS the pattern library. Someone reading
//     the code later understands it without opening the editor.
//   - Reversibility: folders are cheap to refactor; a flag would require a
//     migration path every time we change the semantics.
//
// If this convention proves too coarse later (e.g. some non-primitive lives
// under `primitives/` accidentally), we can add a `primitive: true` field to
// `WonderComponent` without breaking folder-based detection.
// ---------------------------------------------------------------------------

import { listProps, type PropInfo } from "@/ast/props";
import type { WonderComponent } from "@/store/project";

/**
 * Top-level folder name that marks components as primitives. Everything
 * nested under this folder counts (e.g. `primitives/forms`, `primitives/ui`).
 */
export const PRIMITIVES_FOLDER = "primitives";

export function isPrimitiveFolder(folder: string): boolean {
  return folder === PRIMITIVES_FOLDER || folder.startsWith(`${PRIMITIVES_FOLDER}/`);
}

export function isPrimitive(c: Pick<WonderComponent, "folder">): boolean {
  return isPrimitiveFolder(c.folder);
}

// ---------------------------------------------------------------------------
// Descriptor for the system prompt and the agent's view of primitives.
// Calling `listProps` is expensive (parses the file), so we do it once per
// snapshot, in `buildPrimitivesIndex`.
// ---------------------------------------------------------------------------

export type PrimitiveDescriptor = {
  id: string;
  /** Component name (e.g. "Button"). Used as the import identifier. */
  name: string;
  /** Folder relative to project root, e.g. `primitives` or `primitives/forms`. */
  folder: string;
  /** On-disk filename (with `.tsx`). */
  filename: string;
  /** Parsed props. Empty when the component takes no props. */
  props: PropInfo[];
  /** Full .tsx source. */
  source: string;
};

export function buildPrimitivesIndex(
  components: Record<string, WonderComponent>,
  order: string[],
): PrimitiveDescriptor[] {
  const out: PrimitiveDescriptor[] = [];
  for (const id of order) {
    const c = components[id];
    if (!c || !isPrimitive(c)) continue;
    let props: PropInfo[] = [];
    try {
      props = listProps(c.source);
    } catch {
      // Can't parse the primitive — skip props but keep the file. The agent
      // can still read the source to infer usage.
    }
    out.push({
      id: c.id,
      name: c.name,
      folder: c.folder,
      filename: c.filename,
      props,
      source: c.source,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Import path calculation — a primitive at `components/primitives/button.tsx`
// is imported from a consumer at `components/cards/stat-tile.tsx` as
// `../primitives/button`. We render these in the system prompt so the agent
// doesn't have to guess.
// ---------------------------------------------------------------------------

/**
 * Relative import path from `consumerFolder` to the primitive's on-disk
 * location, without the `.tsx` extension (Vite/esbuild resolves that).
 * Both folders are interpreted as relative to `components/` — matching how
 * `componentFilePath` builds them.
 */
export function primitiveImportPath(
  consumerFolder: string,
  primitive: Pick<PrimitiveDescriptor, "folder" | "filename">,
): string {
  const from = splitFolder(consumerFolder);
  const to = splitFolder(primitive.folder);

  // Strip common prefix — both trees share at least the empty root.
  let i = 0;
  while (i < from.length && i < to.length && from[i] === to[i]) i++;

  const up = new Array(from.length - i).fill("..");
  const down = to.slice(i);
  const base = primitive.filename.replace(/\.tsx?$/, "");
  const segments = [...up, ...down, base];
  if (segments.length === 0 || !segments[0].startsWith("..")) {
    return `./${segments.join("/")}`;
  }
  return segments.join("/");
}

function splitFolder(f: string): string[] {
  if (!f) return [];
  return f.split("/").filter(Boolean);
}
