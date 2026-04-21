import { useCallback, useEffect, useRef, useState } from "react";
import { useProject } from "@/store/project";
import { ComponentFrame } from "@/canvas/ComponentFrame";

export function CanvasArea() {
  const order = useProject((s) => s.order);
  const components = useProject((s) => s.components);
  const selectedId = useProject((s) => s.selectedComponentId);
  const selectComponent = useProject((s) => s.selectComponent);

  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => Math.min(2, Math.max(0.25, z - e.deltaY * 0.0015)));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const onBgMouseDown = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current) return;
    selectComponent(null);
  };

  return (
    <section
      ref={containerRef}
      onWheel={onWheel}
      onMouseDown={onBgMouseDown}
      className="relative flex min-h-0 flex-1 overflow-hidden bg-canvas"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(24,24,27,0.12) 1px, transparent 0)",
          backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {order.map((id) => {
          const c = components[id];
          if (!c) return null;
          return (
            <ComponentFrame
              key={id}
              component={c}
              selected={selectedId === id}
              zoom={zoom}
            />
          );
        })}
      </div>

      {/* Floating status pill */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-stroke bg-panel px-3 py-1.5 text-[11px] text-ink-muted shadow-sm">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-accent" />
          sandbox ready
        </span>
        <span className="text-ink-faint">·</span>
        <span>{order.length} frames</span>
        <span className="mx-1 h-3 w-px bg-stroke" />
        <span className="font-mono text-[10px]">zoom {Math.round(zoom * 100)}%</span>
      </div>
    </section>
  );
}
