import { useCallback, useEffect, useRef, useState } from "react";
import { Sandbox, type SandboxHandle } from "@/sandbox/Sandbox";
import { bundle } from "@/sandbox/bundler";
import { getClassNameAtPath, setClassAtPath } from "@/ast/tailwind";
import { HOT_RELOAD_DEBOUNCE_MS } from "@/constants";

const INITIAL_SOURCE = `export default function Hello() {
  return (
    <div className="p-6 rounded-xl bg-indigo-500 text-white font-medium shadow-lg">
      <div className="text-xs uppercase tracking-wide opacity-70">Wonder</div>
      <div className="mt-1 text-lg">Hello from the sandbox</div>
      <button className="mt-3 px-3 py-1.5 rounded-md bg-white/15 hover:bg-white/25 text-sm">
        Click me
      </button>
    </div>
  );
}
`;

const PADDING_CYCLE = ["p-2", "p-4", "p-6", "p-10", "p-16"] as const;

export function SpikeView() {
  const sandboxRef = useRef<SandboxHandle>(null);
  const [source, setSource] = useState(INITIAL_SOURCE);
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const run = useCallback(async (code: string) => {
    setStatus("bundling");
    setError(null);
    const result = await bundle(code);
    if (!result.ok) {
      setStatus("error");
      setError(result.error);
      return;
    }
    setStatus("rendering");
    sandboxRef.current?.render(result.code);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => {
      void run(source);
    }, HOT_RELOAD_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [source, ready, run]);

  const cyclePadding = useCallback(() => {
    try {
      const current = getClassNameAtPath(source, "0");
      const hit = current.find((c) =>
        PADDING_CYCLE.includes(c as (typeof PADDING_CYCLE)[number]),
      );
      const idx = hit
        ? PADDING_CYCLE.indexOf(hit as (typeof PADDING_CYCLE)[number])
        : -1;
      const next = PADDING_CYCLE[(idx + 1) % PADDING_CYCLE.length];
      const updated = setClassAtPath(
        source,
        "0",
        hit ?? PADDING_CYCLE[0],
        next,
      );
      setSource(updated);
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, [source]);

  const swapAccent = useCallback(
    (cls: string) => {
      try {
        const current = getClassNameAtPath(source, "0");
        const existing =
          current.find(
            (c) => c.startsWith("bg-") && !c.startsWith("bg-white"),
          ) ?? "bg-indigo-500";
        const updated = setClassAtPath(source, "0", existing, cls);
        setSource(updated);
      } catch (err) {
        setError(String(err));
        setStatus("error");
      }
    },
    [source],
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-ink">
      <div className="flex w-1/2 min-w-0 flex-col border-r border-stroke">
        <div className="flex items-center justify-between border-b border-stroke bg-panel-soft px-3 py-1.5 text-xs text-ink-muted">
          <span>S0 spike · source</span>
          <div className="flex items-center gap-2">
            <span className="opacity-70">{status}</span>
            <button
              onClick={() => run(source)}
              className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              Run
            </button>
          </div>
        </div>
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
          className="flex-1 resize-none bg-white p-3 font-mono text-xs text-ink outline-none"
        />
      </div>
      <div className="flex w-1/2 min-w-0 flex-col">
        <div className="flex items-center justify-between border-b border-stroke bg-panel-soft px-3 py-1.5 text-xs text-ink-muted">
          <span>sandbox iframe</span>
          <div className="flex items-center gap-1">
            <button
              onClick={cyclePadding}
              className="rounded-md bg-stroke px-2 py-0.5 text-[10px] font-medium hover:bg-stroke-strong"
            >
              cycle padding
            </button>
            <button
              onClick={() => swapAccent("bg-rose-500")}
              className="rounded-md bg-rose-500 px-2 py-0.5 text-[10px] font-medium text-white"
            >
              rose
            </button>
            <button
              onClick={() => swapAccent("bg-emerald-500")}
              className="rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-medium text-white"
            >
              emerald
            </button>
            <button
              onClick={() => swapAccent("bg-indigo-500")}
              className="rounded-md bg-indigo-500 px-2 py-0.5 text-[10px] font-medium text-white"
            >
              indigo
            </button>
          </div>
        </div>
        <div className="relative flex-1 overflow-hidden bg-white">
          <Sandbox
            ref={sandboxRef}
            onReady={() => setReady(true)}
            onRendered={() => setStatus("rendered")}
            onError={(msg) => {
              setStatus("error");
              setError(msg);
            }}
            className="h-full w-full border-0"
          />
          {error ? (
            <pre className="absolute inset-2 overflow-auto rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700">
              {error}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}
