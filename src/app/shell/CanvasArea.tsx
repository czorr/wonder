import { useCallback, useEffect, useRef, useState } from "react";
import { useProject } from "@/store/project";
import { useCanvas } from "@/store/canvas";
import { ComponentFrame } from "@/canvas/ComponentFrame";
import { PRIMITIVES, buildComponentSource } from "@/primitives/snippets";
import { removeAtPath } from "@/ast/insert";

export function CanvasArea() {
  const order = useProject((s) => s.order);
  const components = useProject((s) => s.components);
  const selectedId = useProject((s) => s.selectedComponentId);
  const selectComponent = useProject((s) => s.selectComponent);
  const deleteComponent = useProject((s) => s.deleteComponent);
  const addComponent = useProject((s) => s.addComponent);

  const zoom = useCanvas((s) => s.zoom);
  const pan = useCanvas((s) => s.pan);
  const setZoom = useCanvas((s) => s.setZoom);
  const setPan = useCanvas((s) => s.setPan);
  const tool = useCanvas((s) => s.tool);
  const setTool = useCanvas((s) => s.setTool);

  const containerRef = useRef<HTMLDivElement>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const handActive = tool === "hand" || spaceHeld;

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        setZoom((z) => {
          const factor = e.deltaY < 0 ? 1.05 : 0.95;
          const next = Math.min(4, Math.max(0.1, z * factor));
          // Zoom toward cursor
          setPan((p) => ({
            x: mx - (mx - p.x) * (next / z),
            y: my - (my - p.y) * (next / z),
          }));
          return next;
        });
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    },
    [setZoom, setPan],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const deleteSelection = useCallback(() => {
    const { selectedComponentId, selectedElementPath, components, setSource, selectElement } =
      useProject.getState();
    if (!selectedComponentId) return;
    if (!selectedElementPath || selectedElementPath === "0") {
      deleteComponent(selectedComponentId);
      return;
    }
    const comp = components[selectedComponentId];
    if (!comp) return;
    try {
      const next = removeAtPath(comp.source, selectedElementPath);
      setSource(selectedComponentId, next);
      selectElement(null);
    } catch (err) {
      console.error(err);
    }
  }, [deleteComponent]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (data && typeof data === "object" && data.type === "sandbox:deleteKey") {
        deleteSelection();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [deleteSelection]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        setSpaceHeld(true);
      }
      if (e.key === "v" || e.key === "V") {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        setTool("select");
      }
      if (e.key === "h" || e.key === "H") {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        setTool("hand");
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        if (t && typeof t.closest === "function" && t.closest(".monaco-editor")) return;
        e.preventDefault();
        deleteSelection();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [setTool, deleteComponent]);

  const startPan = (startX: number, startY: number) => {
    setPanning(true);
    const origPan = { ...pan };
    const onMove = (ev: MouseEvent) => {
      setPan({ x: origPan.x + (ev.clientX - startX), y: origPan.y + (ev.clientY - startY) });
    };
    const onUp = () => {
      setPanning(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onBgMouseDown = (e: React.MouseEvent) => {
    // Middle-mouse or hand tool → pan from anywhere
    if (e.button === 1 || handActive) {
      e.preventDefault();
      e.stopPropagation();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.target !== containerRef.current && e.target !== e.currentTarget) return;
    selectComponent(null);
  };

  const onDragOverBg = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("application/x-wonder-primitive")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDropBg = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData("application/x-wonder-primitive");
    if (!raw) return;
    e.preventDefault();
    // If the event was handled by a frame's iframe, that drop already fired inside
    // the sandbox — we only reach here for drops on empty canvas.
    let parsed: { snippet: string; componentName: string; size: { w: number; h: number } } | null = null;
    try { parsed = JSON.parse(raw); } catch { return; }
    if (!parsed) return;
    const primitive = PRIMITIVES.find((p) => p.componentName === parsed!.componentName) ?? PRIMITIVES[0];
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.round((e.clientX - rect.left - pan.x) / zoom);
    const y = Math.round((e.clientY - rect.top - pan.y) / zoom);
    addComponent({
      name: primitive.componentName,
      filename: `${primitive.componentName}.tsx`,
      folder: "components",
      source: buildComponentSource(primitive, primitive.componentName),
      x,
      y,
      width: primitive.size.w,
      height: primitive.size.h,
    });
  };

  return (
    <section
      ref={containerRef}
      onWheel={onWheel}
      onMouseDown={onBgMouseDown}
      onDragOver={onDragOverBg}
      onDrop={onDropBg}
      className="relative flex min-h-0 flex-1 overflow-hidden bg-canvas"
      style={{ cursor: panning ? "grabbing" : handActive ? "grab" : undefined }}
    >
      {/* Dot grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(24,24,27,0.12) 1px, transparent 0)",
          backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      {/* Canvas content — pan via translate, scale via transform (transform:scale avoids
          the subpixel clipping bugs CSS `zoom` causes with iframes in WebKit/Tauri). */}
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <div>
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
