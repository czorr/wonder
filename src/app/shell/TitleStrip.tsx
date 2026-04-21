import { Share2, MessageSquare } from "lucide-react";

export function TitleStrip() {
  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center border-b border-stroke bg-panel"
    >
      {/* Traffic lights reserved area (macOS overlay) */}
      <div data-tauri-drag-region className="w-[78px] shrink-0" />

      <div
        data-tauri-drag-region
        className="flex flex-1 items-center justify-center gap-2 text-[13px] text-ink-muted"
      >
        <div className="flex size-4 items-center justify-center rounded-[4px] bg-accent">
          <div className="size-1.5 rounded-full bg-white" />
        </div>
        <span className="font-medium text-ink">Wonder</span>
        <span className="text-ink-faint">·</span>
        <span>marketing-site</span>
        <span className="text-ink-faint">·</span>
        <span className="text-ink">StatTile.tsx</span>
        <span className="ml-0.5 size-1.5 rounded-full bg-accent" />
      </div>

      <div className="flex shrink-0 items-center gap-0.5 pr-3">
        <button className="grid size-7 place-items-center rounded-md text-ink-muted hover:bg-panel-soft">
          <Share2 size={14} strokeWidth={1.75} />
        </button>
        <button className="grid size-7 place-items-center rounded-md text-ink-muted hover:bg-panel-soft">
          <MessageSquare size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
