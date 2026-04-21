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

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "=" || e.key === "+") { e.preventDefault(); zoomIn(); }
      if (e.key === "-") { e.preventDefault(); zoomOut(); }
      if (e.key === "0") { e.preventDefault(); zoomReset(); }
      if (e.key === "p") { e.preventDefault(); openPreview(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIn, zoomOut, zoomReset, openPreview]);

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
          <IconBtn><Undo2 size={15} strokeWidth={1.75} /></IconBtn>
          <IconBtn><Redo2 size={15} strokeWidth={1.75} /></IconBtn>
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
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={
        "grid size-7 place-items-center rounded-md transition " +
        (active
          ? "bg-panel-soft text-ink"
          : "text-ink-muted hover:bg-panel-soft hover:text-ink")
      }
    >
      {children}
    </button>
  );
}
