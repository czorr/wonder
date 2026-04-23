// ---------------------------------------------------------------------------
// Asset resolver — rewrites `./design/assets/…` paths inside component
// source to inline data URLs BEFORE the code hits the bundler.
//
// Why pre-bundle (not sandbox-runtime):
//   - The sandbox iframe has its own URL.createObjectURL realm, so blob
//     URLs minted in the parent won't resolve inside it.
//   - Sending asset bytes via postMessage for the iframe to blob-ify would
//     work but requires an async dance before each render.
//   - Rewriting the source before we hand it to the bundler inlines the
//     bytes into the compiled JS as data URLs. The iframe sees a normal
//     `<img src="data:image/png;base64,…">` — zero custom runtime code.
//
// Trade-off: data URLs inflate the bundle by ~33% of asset byte size. For
// the icons/thumbnails Wonder targets first, that's negligible. When a
// user starts dropping multi-MB hero renders we'll want to either:
//   - Move to a Tauri custom `asset:` protocol (serves the raw file), or
//   - Stream bytes into per-iframe blob URLs via postMessage.
// Flagging it here so the decision point is findable later.
//
// Match surface: we look for any string literal (single, double, or
// template-no-expr) whose contents resolve to a known asset path. This
// covers the common write styles:
//   src="./design/assets/images/foo.png"
//   src='design/assets/images/foo.png'
//   src={`./design/assets/images/${name}.png`}  ← only if the whole thing
//                                                  is a plain string
//
// Dynamic construction (`"./design/assets/images/" + name`) is intentionally
// unsupported — the user is then in "I know what I'm doing" territory and
// can import assets directly, or we can build a `useAsset(name)` hook later.
// ---------------------------------------------------------------------------

import { useAssets } from "@/store/assets";

/**
 * A single regex covering the three literal flavours. We keep the capture
 * groups separate so the replacement can preserve whichever quote style the
 * author used. Anchored on the path prefix so we never touch unrelated
 * string literals.
 */
const ASSET_LITERAL_RE =
  /(["'`])(\.?\/?design\/assets\/(?:[^"'`\n]+))\1/g;

/** Rewrite every asset-path string literal in `source` to its data URL.
 *
 *  Unknown paths are left intact so the user sees the broken image at the
 *  correct URL and can fix the typo — silently replacing with `""` would
 *  trigger a "why is my image just gone" debugging loop.
 */
export function resolveAssets(source: string): string {
  // Snapshot the store so we only pay the lookup cost once per bundle,
  // even if the source has many references.
  const find = useAssets.getState().findByPath;
  return source.replace(ASSET_LITERAL_RE, (match, quote, path) => {
    const asset = find(path);
    if (!asset) return match;
    // Use the same quote style the author picked. Data URLs never contain
    // quotes, so we don't need to escape inside the literal.
    return `${quote}${asset.dataUrl}${quote}`;
  });
}
