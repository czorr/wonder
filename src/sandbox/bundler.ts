import { initialize, transform } from "esbuild-wasm";
import wasmURL from "esbuild-wasm/esbuild.wasm?url";
import { injectWonderPaths } from "@/ast/mutate";

let initPromise: Promise<void> | null = null;

export function initBundler(): Promise<void> {
  if (!initPromise) {
    initPromise = initialize({
      wasmURL,
      worker: true,
    });
  }
  return initPromise;
}

export type BundleResult =
  | { ok: true; code: string; warnings: string[] }
  | { ok: false; error: string };

export async function bundle(source: string): Promise<BundleResult> {
  try {
    await initBundler();
    let withPaths = source;
    try {
      withPaths = injectWonderPaths(source);
    } catch {
      // mid-edit: fall back to raw source
    }
    const result = await transform(withPaths, {
      loader: "tsx",
      jsx: "automatic",
      jsxImportSource: "react",
      target: "es2022",
      format: "esm",
      sourcemap: "inline",
      sourcefile: "component.tsx",
    });
    return {
      ok: true,
      code: result.code,
      warnings: result.warnings.map((w) => w.text),
    };
  } catch (err) {
    const message =
      err && typeof err === "object" && "errors" in err
        ? JSON.stringify((err as { errors: unknown }).errors, null, 2)
        : String(err);
    return { ok: false, error: message };
  }
}
