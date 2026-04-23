import { useEffect, useRef, useState } from "react";
import { AppIcon } from "@/app/icons";
import { useProject } from "@/store/project";
import { useCanvas } from "@/store/canvas";
import { Sandbox, type SandboxHandle } from "@/sandbox/Sandbox";
import { bundle } from "@/sandbox/bundler";

const GRADIENTS = [
  "from-violet-950 via-indigo-900 to-sky-900",
  "from-emerald-950 via-teal-900 to-cyan-900",
  "from-rose-950 via-pink-900 to-fuchsia-900",
  "from-slate-950 via-gray-900 to-zinc-800",
  "from-amber-950 via-orange-900 to-red-900",
];

export function PreviewOverlay() {
  const previewOpen = useCanvas((s) => s.previewOpen);
  const closePreview = useCanvas((s) => s.closePreview);
  const components = useProject((s) => s.components);
  const order = useProject((s) => s.order);
  const selectedId = useProject((s) => s.selectedComponentId);

  const [index, setIndex] = useState(() => {
    const i = order.indexOf(selectedId ?? "");
    return i >= 0 ? i : 0;
  });
  const [gradientIdx, setGradientIdx] = useState(0);
  const [rendered, setRendered] = useState(false);
  const [contentSize, setContentSize] = useState<{ w: number; h: number } | null>(null);

  const sandboxRef = useRef<SandboxHandle>(null);
  const [ready, setReady] = useState(false);

  const component = components[order[index]];

  // Reset to selected component when overlay opens
  useEffect(() => {
    if (!previewOpen) return;
    setRendered(false);
    setReady(false);
    setContentSize(null);
    const i = order.indexOf(selectedId ?? "");
    setIndex(i >= 0 ? i : 0);
  }, [previewOpen, selectedId, order]);

  useEffect(() => {
    if (!previewOpen || !ready || !component) return;
    setRendered(false);
    setContentSize(null);
    let cancelled = false;
    bundle(component.source).then((res) => {
      if (cancelled) return;
      if (res.ok) sandboxRef.current?.render(res.code);
    });
    return () => { cancelled = true; };
  }, [previewOpen, ready, component]);

  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
      if (e.key === "ArrowRight" || e.key === "ArrowDown")
        setIndex((i) => (i + 1) % order.length);
      if (e.key === "ArrowLeft" || e.key === "ArrowUp")
        setIndex((i) => (i - 1 + order.length) % order.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen, order.length, closePreview]);

  if (!previewOpen) return null;

  const gradient = GRADIENTS[gradientIdx];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backdropFilter: "blur(0px)" }}
    >
      {/* Animated gradient bg */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} transition-all duration-700`}
      />

      {/* Noise texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: "256px",
        }}
      />

      {/* Top bar */}
      <div className="relative flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-white/90">
            <span className="flex size-6 items-center justify-center rounded-md bg-white/10 text-[11px] font-bold">
              W
            </span>
            Wonder
          </span>
          <span className="text-white/30">·</span>
          <span className="text-[12px] text-white/60">{component?.name}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Gradient picker */}
          <div className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1.5">
            {GRADIENTS.map((g, i) => (
              <button
                key={i}
                onClick={() => setGradientIdx(i)}
                className={`size-4 rounded-full bg-gradient-to-br ${g} transition ${
                  i === gradientIdx
                    ? "ring-2 ring-white ring-offset-1 ring-offset-transparent scale-110"
                    : "opacity-60 hover:opacity-100"
                }`}
              />
            ))}
          </div>

          <button
            onClick={closePreview}
            className="grid size-8 place-items-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition"
          >
            <AppIcon name="X" size={16} />
          </button>
        </div>
      </div>

      {/* Component showcase */}
      <div className="relative flex flex-1 items-center justify-center px-12 pb-16">
        {/* Glow */}
        <div className="pointer-events-none absolute size-[500px] rounded-full bg-white/5 blur-[120px]" />

        {/* Card frame */}
        <div
          className={`relative transition-all duration-700 ease-out ${
            rendered ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-6"
          }`}
          style={contentSize ? { transform: `scale(${Math.min(2.4, Math.min(580 / contentSize.w, 480 / contentSize.h))}) ${rendered ? '' : ''}` } : {}}
        >
          {/* Glow ring */}
          <div className="absolute -inset-[2px] rounded-[18px] bg-gradient-to-b from-white/30 via-white/10 to-transparent" />
          {/* Outer shadow rings */}
          <div className="pointer-events-none absolute -inset-8 rounded-[40px] bg-white/5 blur-2xl" />
          <div
            className="relative overflow-hidden rounded-2xl bg-white shadow-[0_48px_120px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.1)]"
            style={
              contentSize
                ? { width: contentSize.w, height: contentSize.h }
                : { width: 2000, height: 1200, maxWidth: "70vw", maxHeight: "60vh" }
            }
          >
            <Sandbox
              ref={sandboxRef}
              onReady={() => setReady(true)}
              onRendered={() => setRendered(true)}
              onSize={(evt) => setContentSize({ w: evt.width, h: evt.height })}
              className="absolute left-0 top-0 border-0"
              style={{ width: 2000, height: 1200, background: "white" }}
            />
          </div>

          {/* Component name badge */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/70 backdrop-blur-sm">
            {component?.filename}
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      {order.length > 1 && (
        <div className="relative flex items-center justify-center gap-4 pb-8">
          <button
            onClick={() => setIndex((i) => (i - 1 + order.length) % order.length)}
            className="grid size-9 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition"
          >
            <AppIcon name="ChevronLeft" size={18} />
          </button>

          <div className="flex items-center gap-1.5">
            {order.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === index
                    ? "w-5 h-2 bg-white"
                    : "size-2 bg-white/30 hover:bg-white/60"
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => setIndex((i) => (i + 1) % order.length)}
            className="grid size-9 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition"
          >
            <AppIcon name="ChevronRight" size={18} />
          </button>
        </div>
      )}

      {/* Keyboard hint */}
      <div className="absolute bottom-3 right-5 flex items-center gap-3 text-[10px] text-white/25">
        {order.length > 1 && <span>← → to navigate</span>}
        <span>esc to close</span>
      </div>
    </div>
  );
}
