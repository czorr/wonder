import {
  Undo2,
  Redo2,
  MousePointer2,
  Hand,
  Frame,
  Square,
  Type,
  Sun,
  ChevronDown,
  Plus,
  Minus,
  Eye,
  Download,
  RefreshCcw,
} from "lucide-react";
import { useEffect } from "react";
import { useCanvas } from "@/store/canvas";
import { useProject } from "@/store/project";
import { removeClassesAtPath } from "@/ast/tailwind";

const BREAKPOINTS = ["base", "sm", "md", "lg", "xl", "2xl"] as const;

export function Topbar() {
  const zoom = useCanvas((s) => s.zoom);
  const zoomIn = useCanvas((s) => s.zoomIn);
  const zoomOut = useCanvas((s) => s.zoomOut);
  const zoomReset = useCanvas((s) => s.zoomReset);
  const openPreview = useCanvas((s) => s.openPreview);
  const tool = useCanvas((s) => s.tool);
  const setTool = useCanvas((s) => s.setTool);

  const components = useProject((s) => s.components);
  const order = useProject((s) => s.order);
  const selectedId = useProject((s) => s.selectedComponentId);
  const activeTab = useProject((s) => s.activeTab);
  const setSource = useProject((s) => s.setSource);
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);
  // Subscribe to stack lengths so the buttons re-render when enable state flips.
  // (We intentionally don't use canUndo/canRedo getters — those wouldn't trigger re-renders.)
  const pastLen = useProject((s) => s.past.length);
  const futureLen = useProject((s) => s.future.length);

  const resetSizes = () => {
    for (const id of order) {
      const c = components[id];
      if (!c) continue;
      try {
        const next = removeClassesAtPath(c.source, "0", (cls) =>
          /^w-\[.*\]$/.test(cls) || /^h-\[.*\]$/.test(cls),
        );
        if (next !== c.source) setSource(id, next);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Keyboard shortcuts.
  //
  // Undo/redo are registered in the *capture* phase so they fire BEFORE Monaco's
  // own Cmd+Z/Cmd+Shift+Z handlers — otherwise Monaco would swallow the event
  // whenever the editor has focus and the canvas-level history would feel broken.
  // Monaco's model re-syncs from `active.source` via the useEffect in CodePanel,
  // so restoring state here makes the editor buffer follow along automatically.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      // ⌘Y = redo on Windows/Linux muscle memory; harmless on macOS too.
      if (key === "y") {
        e.preventDefault();
        e.stopPropagation();
        redo();
        return;
      }
      if (key === "=" || key === "+") { e.preventDefault(); zoomIn(); return; }
      if (key === "-") { e.preventDefault(); zoomOut(); return; }
      if (key === "0") { e.preventDefault(); zoomReset(); return; }
      if (key === "p") { e.preventDefault(); openPreview(); return; }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [zoomIn, zoomOut, zoomReset, openPreview, undo, redo]);

  const handleExport = () => {
    const id = activeTab ?? selectedId;
    const component = id ? components[id] : null;
    if (!component) return;
    const blob = new Blob([component.source], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = component.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-stroke bg-panel px-3">
      {/* Left: history + tools */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-0.5">
          <IconBtn
            onClick={undo}
            disabled={pastLen === 0}
            title="Undo (⌘Z)"
          >
            <Undo2 size={15} strokeWidth={1.75} />
          </IconBtn>
          <IconBtn
            onClick={redo}
            disabled={futureLen === 0}
            title="Redo (⌘⇧Z)"
          >
            <Redo2 size={15} strokeWidth={1.75} />
          </IconBtn>
        </div>
        <div className="h-5 w-px bg-stroke" />
        <div className="flex items-center gap-0.5">
          <IconBtn active={tool === "select"} onClick={() => setTool("select")} title="Select (V)">
            <MousePointer2 size={15} strokeWidth={1.75} />
          </IconBtn>
          <IconBtn active={tool === "hand"} onClick={() => setTool("hand")} title="Hand / Pan (H, hold Space)">
            <Hand size={15} strokeWidth={1.75} />
          </IconBtn>
          <IconBtn><Frame size={15} strokeWidth={1.75} /></IconBtn>
          <IconBtn><Square size={15} strokeWidth={1.75} /></IconBtn>
          <IconBtn><Type size={15} strokeWidth={1.75} /></IconBtn>
        </div>
      </div>

      {/* Center: breakpoints + theme */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-stroke bg-panel pl-2.5 pr-0.5 py-0.5">
          <span className="text-[11px] font-medium text-ink-muted">Breakpoint</span>
          <div className="flex items-center">
            {BREAKPOINTS.map((bp) => (
              <button
                key={bp}
                className={
                  "rounded-md px-2 py-1 text-[11px] font-medium transition " +
                  (bp === "md" ? "bg-ink text-white" : "text-ink-muted hover:text-ink")
                }
              >
                {bp}
              </button>
            ))}
          </div>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg border border-stroke bg-panel px-2.5 py-1.5 text-[11px] font-medium text-ink-soft">
          <Sun size={13} strokeWidth={1.75} className="text-ink-muted" />
          Default
          <ChevronDown size={12} strokeWidth={2} className="text-ink-faint" />
        </button>
      </div>

      {/* Right: zoom + preview + export */}
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-stroke bg-panel">
          <button
            onClick={zoomOut}
            title="Zoom out (⌘-)"
            className="grid size-7 place-items-center text-ink-muted hover:text-ink transition"
          >
            <Minus size={13} strokeWidth={2} />
          </button>
          <button
            onClick={zoomReset}
            title="Reset zoom (⌘0)"
            className="min-w-[42px] text-center text-[11px] font-medium text-ink-soft hover:text-ink transition"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={zoomIn}
            title="Zoom in (⌘+)"
            className="grid size-7 place-items-center text-ink-muted hover:text-ink transition"
          >
            <Plus size={13} strokeWidth={2} />
          </button>
        </div>

        <button
          onClick={resetSizes}
          title="Reset frame sizes (remove w-[]/h-[] on roots)"
          className="grid size-7 place-items-center rounded-lg border border-stroke bg-panel text-ink-muted hover:text-ink transition"
        >
          <RefreshCcw size={13} strokeWidth={1.75} />
        </button>

        <button
          onClick={openPreview}
          title="Preview (⌘P)"
          className="flex items-center gap-1.5 rounded-lg border border-stroke bg-panel px-2.5 py-1.5 text-[11px] font-medium text-ink-soft hover:border-stroke-strong hover:text-ink transition"
        >
          <Eye size={13} strokeWidth={1.75} />
          Preview
        </button>

        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:brightness-105 transition"
        >
          <Download size={12} strokeWidth={2.5} />
          Export .tsx
        </button>
      </div>
    </header>
  );
}

function IconBtn({
  children,
  active,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={
        "grid size-7 place-items-center rounded-md transition " +
        (disabled
          ? "text-ink-faint opacity-40 cursor-not-allowed"
          : active
            ? "bg-panel-soft text-ink"
            : "text-ink-muted hover:bg-panel-soft hover:text-ink")
      }
    >
      {children}
    </button>
  );
}
