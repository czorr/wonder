// ---------------------------------------------------------------------------
// Project → bundler module map.
//
// The bundler walks an import graph using virtual paths. This file is the
// single place that decides what each project component's virtual path looks
// like and how its source is preprocessed before the bundler sees it.
//
// Why virtual paths instead of "just use the filename":
//   Two components could share a filename across folders (`primitives/Button.tsx`
//   vs `components/Button.tsx`), and `import "./Button"` should resolve
//   relative to the importer's folder. Mirroring the on-disk layout
//   (`/<folder>/<filename>`) gives us the same resolution semantics for free.
//
// Why we run `resolveAssets` per module (not just on the entry):
//   A child component can also reference `./design/assets/foo.png`. If we
//   only resolved on the entry, the child's image would 404 inside the
//   sandbox blob URL — so we apply the rewrite uniformly on every module.
//   `resolveAssets` is idempotent: running it on already-resolved source is
//   a no-op, so callers that pre-resolve their entry don't get burned.
// ---------------------------------------------------------------------------

import { resolveAssets } from "@/sandbox/assetResolver";
import { useProject, type WonderComponent } from "@/store/project";
import type { WonderModuleMap } from "@/sandbox/bundler";

/** Build the virtual path for a component: `/<folder>/<filename>`.
 *  Empty/whitespace folder collapses to `/<filename>` so a top-level
 *  component still gets a clean root-relative path. Leading/trailing
 *  slashes on `folder` are tolerated so callers don't have to normalize. */
export function virtualPathFor(c: {
  folder: string;
  filename: string;
}): string {
  const folder = c.folder.trim().replace(/^\/+|\/+$/g, "");
  return folder ? `/${folder}/${c.filename}` : `/${c.filename}`;
}

/** Snapshot a project's components into a `WonderModuleMap`.
 *
 *  Each component contributes one entry: virtual path → asset-resolved
 *  source. The bundler will overwrite the entry slot with a path-injected
 *  version of whatever string is passed as the entry source, so it's safe
 *  (and expected) for the entry component to also live in this map. */
export function buildProjectModules(
  components: Record<string, WonderComponent>,
): WonderModuleMap {
  const map: WonderModuleMap = new Map();
  for (const c of Object.values(components)) {
    map.set(virtualPathFor(c), resolveAssets(c.source));
  }
  return map;
}

/** Stable string fingerprint of every project module — virtual path + source.
 *
 *  Why not subscribe to `state.components` directly: that object identity
 *  changes on every drag/resize tick because `moveFrame`/`resizeFrame` clone
 *  the components map. Using it as an effect dependency would re-bundle the
 *  entire canvas on every pixel of motion. This selector strips x/y/w/h
 *  out of the picture — the returned string only changes when something
 *  the bundler actually cares about (folder, filename, source) mutates, so
 *  Zustand's referential `===` check skips re-renders for unrelated mutations.
 *
 *  Cost: the selector runs on every store mutation, but the resulting
 *  string is a couple hundred KB at the high end (medium project).
 *  Optimisable later if it becomes hot — e.g. swap to a counter mutated
 *  inside `setSource`/`setComponentFolder` only. */
export function useProjectModulesSignature(): string {
  return useProject((s) => {
    let v = "";
    for (const id of s.order) {
      const c = s.components[id];
      if (!c) continue;
      // Use control characters as separators so they can't collide with
      // anything inside a real source string.
      v += `\x01${id}\x02${c.folder}\x02${c.filename}\x02${c.source}`;
    }
    return v;
  });
}
