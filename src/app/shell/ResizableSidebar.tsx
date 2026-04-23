// ---------------------------------------------------------------------------
// Resizable sidebar shell.
//
// Wraps LeftSidebar / RightPanel so they can be:
//   • Dragged to any width within [min, max]
//   • Double-clicked on the grip to collapse
//   • Collapsed into a thin "rail" (24px) with a chevron to re-expand
//
// Width + collapsed state live in `useLayout` and persist to localStorage.
// The grip is a full-height 6px invisible hit-area with a 1px accent line
// that appears on hover (Figma/Linear convention).
//
// When chat is open the LEFT pane enforces a non-persistent minimum of
// `LAYOUT_BOUNDS.chatMin` so the chat composer has breathing room without
// overwriting the user's compact file-tree preference.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { AppIcon } from "@/app/icons";
import { LAYOUT_BOUNDS, useLayout } from "@/store/layout";
import { useChat } from "@/store/chat";

type Side = "left" | "right";

export function ResizableSidebar({
  side,
  children,
}: {
  side: Side;
  children: React.ReactNode;
}) {
  const storedWidth = useLayout((s) => (side === "left" ? s.leftWidth : s.rightWidth));
  const collapsed = useLayout((s) =>
    side === "left" ? s.leftCollapsed : s.rightCollapsed,
  );
  const setWidth = useLayout((s) =>
    side === "left" ? s.setLeftWidth : s.setRightWidth,
  );
  const toggle = useLayout((s) => (side === "left" ? s.toggleLeft : s.toggleRight));
  const chatOpen = useChat((s) => s.chatOpen);

  // Chat auto-widens the left pane for readability, without persisting.
  const displayWidth =
    side === "left" && chatOpen
      ? Math.max(storedWidth, LAYOUT_BOUNDS.chatMin)
      : storedWidth;

  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onGripMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || collapsed) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: displayWidth };
    document.body.style.cursor = "col-resize";
    document.body.classList.add("select-none");
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const delta = ev.clientX - d.startX;
      setWidth(side === "left" ? d.startW + delta : d.startW - delta);
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.classList.remove("select-none");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Cleanup global listeners if the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.classList.remove("select-none");
    };
  }, []);

  if (collapsed) {
    return (
      <CollapsedRail side={side} onExpand={toggle} />
    );
  }

  // A negative margin pulls the 6px grip to straddle the panel border so the
  // hit area lives on the border itself (half inside the panel, half into the
  // canvas). The inner 1px accent line highlights on hover.
  const gripSide = side === "left" ? "-right-1" : "-left-1";

  return (
    <div
      className="relative flex shrink-0 flex-col"
      style={{ width: displayWidth }}
    >
      {children}
      <div
        onMouseDown={onGripMouseDown}
        onDoubleClick={toggle}
        title={`Drag to resize · Double-click to collapse`}
        className={
          "group absolute top-0 z-20 h-full w-2 cursor-col-resize " + gripSide
        }
      >
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-100 group-hover:bg-accent group-active:bg-accent" />
      </div>
    </div>
  );
}

function CollapsedRail({ side, onExpand }: { side: Side; onExpand: () => void }) {
  return (
    <div
      className={
        "flex w-6 shrink-0 flex-col items-center gap-1 bg-panel py-2 " +
        (side === "left" ? "border-r border-stroke" : "border-l border-stroke")
      }
    >
      <button
        onClick={onExpand}
        title={`Expand ${side} panel`}
        className="grid size-6 place-items-center rounded-md text-ink-muted hover:bg-panel-soft hover:text-ink transition"
      >
        <AppIcon
          name={side === "left" ? "ChevronRight" : "ChevronLeft"}
          size={13}
        />
      </button>
      {/* Subtle orientation hint — vertical dotted line in panel color to
          suggest "there's a surface hidden over here". */}
      <div className="mt-1 h-12 w-px border-l border-dashed border-stroke" />
    </div>
  );
}
