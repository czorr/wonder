import {
  Undo2,
  Redo2,
  MousePointer2,
  Frame,
  Square,
  Type,
  Sun,
  ChevronDown,
  Plus,
  Minus,
  Eye,
} from "lucide-react";

const BREAKPOINTS = ["base", "sm", "md", "lg", "xl", "2xl"] as const;

export function Topbar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-stroke bg-panel px-3">
      {/* Left: history + tools */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-0.5">
          <IconBtn>
            <Undo2 size={15} strokeWidth={1.75} />
          </IconBtn>
          <IconBtn>
            <Redo2 size={15} strokeWidth={1.75} />
          </IconBtn>
        </div>
        <div className="h-5 w-px bg-stroke" />
        <div className="flex items-center gap-0.5">
          <IconBtn active>
            <MousePointer2 size={15} strokeWidth={1.75} />
          </IconBtn>
          <IconBtn>
            <Frame size={15} strokeWidth={1.75} />
          </IconBtn>
          <IconBtn>
            <Square size={15} strokeWidth={1.75} />
          </IconBtn>
          <IconBtn>
            <Type size={15} strokeWidth={1.75} />
          </IconBtn>
        </div>
      </div>

      {/* Center: breakpoints + theme */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-stroke bg-panel pl-2.5 pr-0.5 py-0.5">
          <span className="text-[11px] font-medium text-ink-muted">
            Breakpoint
          </span>
          <div className="flex items-center">
            {BREAKPOINTS.map((bp) => (
              <button
                key={bp}
                className={
                  "rounded-md px-2 py-1 text-[11px] font-medium transition " +
                  (bp === "md"
                    ? "bg-ink text-white"
                    : "text-ink-muted hover:text-ink")
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
          <button className="grid size-7 place-items-center text-ink-muted hover:text-ink">
            <Minus size={13} strokeWidth={2} />
          </button>
          <span className="min-w-[36px] text-center text-[11px] font-medium text-ink-soft">
            72%
          </span>
          <button className="grid size-7 place-items-center text-ink-muted hover:text-ink">
            <Plus size={13} strokeWidth={2} />
          </button>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg border border-stroke bg-panel px-2.5 py-1.5 text-[11px] font-medium text-ink-soft hover:border-stroke-strong">
          <Eye size={13} strokeWidth={1.75} />
          Preview
        </button>
        <button className="rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:brightness-105">
          Export .tsx
        </button>
      </div>
    </header>
  );
}

function IconBtn({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
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
