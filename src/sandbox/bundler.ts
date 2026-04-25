// ---------------------------------------------------------------------------
// Sandbox bundler — turns a Wonder component (plus the rest of its project)
// into a single ESM module the iframe runtime can `import()`.
//
// Why `build()` instead of `transform()`:
//   `transform()` is single-file. It leaves `import {Button} from "./Button"`
//   in the output, and the iframe's dynamic-import-of-a-blob has no way to
//   resolve that string — the import errors out at load time.
//   `build()` with `bundle: true` walks the import graph and emits one file
//   with every dependency inlined. We supply the graph via a virtual
//   filesystem plugin: project components live in memory keyed by a synthetic
//   path (e.g. `/components/Button.tsx`), and bare imports like `react` are
//   declared external so the iframe's importmap continues to serve them
//   from esm.sh — exactly the contract the runtime had before.
//
// Path injection:
//   `injectWonderPaths` only runs on the entry component. Children rendered
//   via `<Button />` stay opaque blocks — no `data-wonder-path` numbering
//   inside them. That's deliberate: paths are 0-indexed under the entry's
//   JSX root, and adding them inside child components would create
//   collisions ("0.1.0" — is that the parent's path or the child's?).
//   To edit `Button`, the user opens `Button.tsx` directly. Same model as
//   any IDE: each file is its own canvas.
//
// Live linking:
//   When a child component's source changes, its parent must re-bundle so
//   the change shows up. The bundler is pure — given the same modules map
//   it returns the same code — so the caller (ComponentFrame) just needs
//   to depend on the union of every project component's source and call
//   `bundle()` again. No special wiring inside this file.
// ---------------------------------------------------------------------------

import { initialize, build } from "esbuild-wasm";
import wasmURL from "esbuild-wasm/esbuild.wasm?url";
import { injectWonderPaths } from "@/ast/mutate";

let initPromise: Promise<void> | null = null;

export function initBundler(): Promise<void> {
  if (initPromise) return initPromise;
  // esbuild-wasm locks `initialize()` to a single call per page — and
  // crucially, the duplicate-call check throws SYNCHRONOUSLY before a
  // promise is constructed. So a `.catch()` on the return value never
  // runs. We have to wrap the call itself in try/catch.
  //
  // Why this fires: in production, the module loads once and we're fine.
  // In dev with Vite HMR, editing this file (or any importer) resets our
  // module-scoped `initPromise` to null while the underlying esbuild
  // worker stays alive globally. The next `initBundler()` call then
  // throws — harmlessly, because `build()` still works against the live
  // worker. We swallow only that one specific error and synthesize a
  // resolved promise so callers can `await initBundler()` as usual.
  initPromise = (async () => {
    try {
      await initialize({ wasmURL, worker: true });
    } catch (err) {
      const msg = String((err as { message?: string })?.message ?? err);
      if (msg.includes("more than once")) return;
      throw err;
    }
  })();
  return initPromise;
}

/** Virtual-path → source. Caller builds this from the project store and
 *  passes it on every `bundle()` call. Empty map = no cross-component
 *  imports possible (the historical behaviour). */
export type WonderModuleMap = Map<string, string>;

export type BundleResult =
  | { ok: true; code: string; warnings: string[] }
  | { ok: false; error: string };

const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"] as const;

/** Return everything before the last `/`. Mirrors POSIX `dirname` semantics
 *  enough for our virtual paths — we don't need to handle drive letters. */
function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

/** Resolve a relative `spec` against `dir` and normalize `.`/`..` segments.
 *  Operates entirely on strings — no filesystem access. */
function joinPath(dir: string, spec: string): string {
  const combined = (dir.endsWith("/") ? dir : dir + "/") + spec;
  const segs = combined.split("/");
  const out: string[] = [];
  for (const seg of segs) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return "/" + out.join("/");
}

/** Try `base`, then `base.ext` for each known extension, then
 *  `base/index.ext`. Returns the matching virtual path or null. The order
 *  matches Node's resolution algorithm so user expectations carry over. */
function resolveCandidate(base: string, modules: WonderModuleMap): string | null {
  if (modules.has(base)) return base;
  for (const ext of EXTENSIONS) {
    const withExt = base + ext;
    if (modules.has(withExt)) return withExt;
  }
  for (const ext of EXTENSIONS) {
    const idx = (base.endsWith("/") ? base : base + "/") + "index" + ext;
    if (modules.has(idx)) return idx;
  }
  return null;
}

/** Last-segment fallback. Wonder's project surface is a flat namespace:
 *  `Button.tsx` is `Button.tsx` regardless of folder. When a relative
 *  import like `./Button` doesn't resolve in the importer's directory
 *  (e.g. Hero lives in `/components/` but Button got promoted to
 *  `/primitives/`), we walk every module and match on filename. The
 *  alternative — making the user keep folder layouts in sync — defeats the
 *  point of "drop a snippet, it just works". */
function resolveByBasename(
  spec: string,
  modules: WonderModuleMap,
): string | null {
  const last = spec.split("/").pop() ?? spec;
  const candidates = [last, ...EXTENSIONS.map((e) => last + e)];
  for (const path of modules.keys()) {
    const file = path.split("/").pop() ?? "";
    if (candidates.includes(file)) return path;
  }
  return null;
}

/** Wonder components are always written as `export default function X() {}`,
 *  but users (and AI) reach for `import { Button } from "./Button"` out of
 *  habit. Rather than make that a hard error, we promote the default-export
 *  binding to a named one too — so both styles work.
 *
 *  Patterns recognised:
 *    `export default function Name(`
 *    `export default async function Name(`
 *    `export default class Name`
 *    `export default Name;` (trailing identifier reference)
 *
 *  The bound name is already in module scope (function/class declarations
 *  hoist; the identifier-ref case has the binding above the export). We just
 *  append `export { Name };` so esbuild treats it as a named export. Already-
 *  named exports stay untouched: appending a duplicate `export { Name }` for
 *  the same identifier is rejected by esbuild, so we skip the append if the
 *  source already exports the name. */
function promoteDefaultExport(src: string): string {
  // Find the default-exported binding name, if any.
  let name: string | null = null;
  const fn = src.match(/export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
  if (fn) name = fn[1];
  if (!name) {
    const cls = src.match(/export\s+default\s+class\s+([A-Za-z_$][\w$]*)/);
    if (cls) name = cls[1];
  }
  if (!name) {
    // `export default Foo;` — bare identifier reference. Has to be on its
    // own (no JSX, no call, no member access) for the binding to be a plain
    // hoistable name.
    const ref = src.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m);
    if (ref) name = ref[1];
  }
  if (!name) return src;

  // Skip if the name is already exported separately. Covers `export function
  // Foo` / `export const Foo` / `export { Foo }` patterns.
  const alreadyExported = new RegExp(
    `export\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${name}\\b|` +
      `export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`,
  ).test(src);
  if (alreadyExported) return src;

  return src + `\nexport { ${name} };\n`;
}

/** Resolve `spec` from `importer`. Returns:
 *   - virtual path string if it maps to a known module,
 *   - "external" when `spec` is a bare import (let importmap handle it),
 *   - null when it looks internal but doesn't match any module — the caller
 *     turns that into a build error so the user sees a clear message. */
function resolveSpec(
  spec: string,
  importer: string,
  modules: WonderModuleMap,
): string | "external" | null {
  // `@/foo` is an internal alias to project root — keep it before the
  // bare-import branch since `@/` starts with `@` like `@iconify/react`.
  if (spec.startsWith("@/")) {
    return (
      resolveCandidate("/" + spec.slice(2), modules) ??
      resolveByBasename(spec, modules)
    );
  }
  if (spec.startsWith("./") || spec.startsWith("../")) {
    return (
      resolveCandidate(joinPath(dirname(importer), spec), modules) ??
      resolveByBasename(spec, modules)
    );
  }
  if (spec.startsWith("/")) {
    return resolveCandidate(spec, modules) ?? resolveByBasename(spec, modules);
  }
  // Anything else — `react`, `lucide-react`, `@iconify/react`, `motion` —
  // is a bare import. Mark external so esbuild leaves the literal in the
  // output and the iframe importmap resolves it from esm.sh.
  return "external";
}

export async function bundle(
  entrySource: string,
  opts?: {
    /** Virtual path the entry source lives at. Relative imports inside
     *  `entrySource` resolve against `dirname(entryPath)`, so this should
     *  match where the component would sit on disk (e.g. `/components/
     *  Hero.tsx`). Defaults to `/__entry__.tsx`, which is fine when the
     *  entry has no relative imports. */
    entryPath?: string;
    /** Other project modules the entry might import. The entry itself is
     *  added to this map under `entryPath` automatically. */
    modules?: WonderModuleMap;
  },
): Promise<BundleResult> {
  try {
    await initBundler();

    const entryPath = opts?.entryPath ?? "/__entry__.tsx";
    // Clone so we don't accidentally mutate the caller's map.
    const modules: WonderModuleMap = new Map(opts?.modules ?? []);

    // Inject `data-wonder-path` ONLY on the entry. See file header for why.
    let entry = entrySource;
    try {
      entry = injectWonderPaths(entrySource);
    } catch {
      // mid-edit: fall back to raw source
    }
    modules.set(entryPath, entry);

    const result = await build({
      entryPoints: [entryPath],
      bundle: true,
      write: false,
      format: "esm",
      jsx: "automatic",
      jsxImportSource: "react",
      target: "es2022",
      sourcemap: "inline",
      logLevel: "silent",
      plugins: [
        {
          name: "wonder-fs",
          setup(b) {
            // onResolve fires for every import including the entry. We
            // route everything through `resolveSpec` so the rules live in
            // one place.
            b.onResolve({ filter: /.*/ }, (args) => {
              const spec = args.path;
              // Entry: esbuild resolves it itself; we only see it as an
              // entryPoint pass with no importer. Hand it back claimed in
              // our namespace so onLoad picks it up.
              if (!args.importer) {
                return { path: spec, namespace: "wonder" };
              }
              const resolved = resolveSpec(spec, args.importer, modules);
              if (resolved === "external") {
                return { external: true, path: spec };
              }
              if (resolved == null) {
                // Surface what was available so the user can see whether
                // the file is missing entirely vs. the path is wrong.
                const known = Array.from(modules.keys()).join(", ") || "(none)";
                return {
                  errors: [
                    {
                      text:
                        `Cannot resolve "${spec}" from ${args.importer}. ` +
                        `Known modules: ${known}.`,
                    },
                  ],
                };
              }
              return { path: resolved, namespace: "wonder" };
            });

            b.onLoad({ filter: /.*/, namespace: "wonder" }, (args) => {
              const src = modules.get(args.path);
              if (src == null) {
                return {
                  errors: [{ text: `Module not found: ${args.path}` }],
                };
              }
              return {
                // Auto-expose the default export as a named one so
                // `import { Button } from "./Button"` works against a file
                // written `export default function Button(){}`.
                contents: promoteDefaultExport(src),
                // All Wonder modules are TSX-flavoured — we'd rather
                // tolerate a `.js` file using JSX than reject it.
                loader: "tsx",
                // `resolveDir` makes esbuild treat relative imports inside
                // this module as relative to its virtual directory. Without
                // it, child modules would resolve relative to nothing and
                // every `./Button` would fail.
                resolveDir: dirname(args.path),
              };
            });
          },
        },
      ],
    });

    const file = result.outputFiles?.[0];
    if (!file) {
      return { ok: false, error: "esbuild produced no output" };
    }
    return {
      ok: true,
      code: file.text,
      warnings: result.warnings.map((w) => w.text),
    };
  } catch (err) {
    return { ok: false, error: formatBuildError(err) };
  }
}

/** esbuild throws an object with `errors`/`warnings` arrays of
 *  `{ text, location? }`. Format them as "file:line:col: message" so the
 *  red banner in the iframe shows something useful instead of a JSON
 *  blob. Falls back to `String(err)` for unexpected shapes. */
function formatBuildError(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const errors = (err as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return String(err);
  return errors
    .map((e: unknown) => {
      if (!e || typeof e !== "object") return String(e);
      const text = (e as { text?: string }).text ?? "";
      const loc = (e as { location?: { file?: string; line?: number; column?: number } }).location;
      if (loc?.file) {
        return `${loc.file}:${loc.line ?? 0}:${loc.column ?? 0}: ${text}`;
      }
      return text;
    })
    .join("\n");
}
