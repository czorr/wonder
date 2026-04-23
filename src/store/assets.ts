// ---------------------------------------------------------------------------
// Assets store.
//
// Tracks image/font/etc. files the user has imported into the current
// project. Each asset lives on disk under `<project>/design/assets/<kind>/`
// and is loaded into memory as a data URL so components can render it
// without the iframe having to fetch across origins.
//
// Why data URLs (not blob URLs)?
//   - The sandbox iframe is same-origin-ish but has its own URL.createObjectURL
//     realm — a blob URL minted in the parent won't resolve in the iframe.
//   - Rewriting `"./design/assets/…"` paths in component source at bundle
//     time with a data URL lets the bundled JS inline the image. No
//     postMessage dance, no iframe-side registry, no async resolution.
//   - Data URLs are ~33% larger than raw bytes. For PNG icons and modest
//     product shots that's fine; for 4K hero renders we'd move to a Tauri
//     custom asset: protocol. That's a later optimization.
//
// The store is ephemeral (no persist middleware) — the disk is the source
// of truth. On project open, persistence fills us from `design/assets/`.
// On project close, we clear everything.
// ---------------------------------------------------------------------------

import { create } from "zustand";

/** All asset categories Wonder knows how to ingest. Kept as a string union
 *  so switch exhaustiveness checks work — add a new category here and the
 *  compiler will walk you through every site that needs an update. */
export type AssetKind = "images";

export type WonderAsset = {
  /** Stable id — generated at import time. Used by React keys and by the
   *  rare deletion flow. Distinct from `filename` so that renames on disk
   *  don't orphan references. */
  id: string;
  /** Asset category — determines which subfolder it lives in. */
  kind: AssetKind;
  /** File name on disk, including extension. Unique within `kind`. */
  filename: string;
  /** Relative-to-project path. The CANONICAL form components reference,
   *  e.g. `./design/assets/images/hero.png`. Stored once so every consumer
   *  agrees on a single spelling. */
  path: string;
  /** MIME type inferred from the extension. Used to build the data URL. */
  mime: string;
  /** Base64-encoded file contents wrapped as a data URL. The renderer-
   *  facing representation — components resolve asset paths to this. */
  dataUrl: string;
  /** Byte size, purely for the UI (e.g. "12 KB" badge in the asset grid). */
  size: number;
};

type AssetsState = {
  /** Flat map keyed by id for fast lookup. Iteration order is not
   *  stable — use `order` when you need a predictable list. */
  assets: Record<string, WonderAsset>;
  /** Display order for the panel grid (newest first, set by the import
   *  flow). */
  order: string[];

  /** Register a just-imported asset. Replaces any existing asset with the
   *  same path (i.e. re-uploading overwrites), so there's never a
   *  duplicate entry for the same on-disk file. */
  addAsset: (asset: WonderAsset) => void;
  /** Remove an asset from the in-memory index. The persistence layer is
   *  responsible for also unlinking the file on disk — this just updates
   *  the store. */
  removeAsset: (id: string) => void;
  /** Replace the entire asset catalogue. Used at project open — the
   *  persistence layer has just finished scanning `design/assets/` and
   *  hands us the full list. */
  replaceAll: (assets: WonderAsset[]) => void;
  /** Drop everything. Called by `newProject` / project close. */
  clear: () => void;

  /** Path-based lookup. Used by the bundler's asset resolver to map
   *  `./design/assets/images/foo.png` → that asset's data URL. Handles both
   *  the canonical `./design/…` prefix and the bare `design/…` form so
   *  hand-written sources don't have to care about the leading dot. */
  findByPath: (path: string) => WonderAsset | null;
};

/** Drop a leading `./` so consumers can look up with either form. */
function normalizePath(p: string): string {
  return p.replace(/^\.\//, "");
}

export const useAssets = create<AssetsState>((set, get) => ({
  assets: {},
  order: [],

  addAsset: (asset) =>
    set((s) => {
      // Replace by path (not id) so re-uploading the same filename updates
      // in place instead of stacking duplicate entries.
      const existingId = Object.values(s.assets).find(
        (a) => a.path === asset.path,
      )?.id;
      const nextAssets = { ...s.assets };
      let nextOrder = s.order;
      if (existingId && existingId !== asset.id) {
        delete nextAssets[existingId];
        nextOrder = nextOrder.filter((id) => id !== existingId);
      }
      nextAssets[asset.id] = asset;
      if (!nextOrder.includes(asset.id)) {
        nextOrder = [asset.id, ...nextOrder];
      }
      return { assets: nextAssets, order: nextOrder };
    }),

  removeAsset: (id) =>
    set((s) => {
      if (!s.assets[id]) return s;
      const { [id]: _removed, ...rest } = s.assets;
      return { assets: rest, order: s.order.filter((x) => x !== id) };
    }),

  replaceAll: (assets) =>
    set(() => {
      const map: Record<string, WonderAsset> = {};
      const order: string[] = [];
      for (const a of assets) {
        map[a.id] = a;
        order.push(a.id);
      }
      return { assets: map, order };
    }),

  clear: () => set({ assets: {}, order: [] }),

  findByPath: (path) => {
    const target = normalizePath(path);
    const list = Object.values(get().assets);
    return list.find((a) => normalizePath(a.path) === target) ?? null;
  },
}));

// ---------------------------------------------------------------------------
// Helpers for the import flow + bundler.
// ---------------------------------------------------------------------------

/** Minimal MIME sniffer keyed on extension. Keeping it lean since we only
 *  support images in the first pass — expand when fonts/audio land. */
export function guessMime(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "avif":
      return "image/avif";
    case "ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

/** Build the canonical project-relative path for an asset filename. */
export function assetPathFor(kind: AssetKind, filename: string): string {
  return `./design/assets/${kind}/${filename}`;
}

/** Convert a raw byte buffer to a data URL. Browser-safe (doesn't use
 *  Node's Buffer) — we walk bytes in 0x8000-sized chunks to avoid
 *  `btoa` choking on large inputs. */
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + CHUNK));
    binary += String.fromCharCode(...slice);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
