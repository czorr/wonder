// ---------------------------------------------------------------------------
// StatusBar — thin strip at the bottom of the shell.
//
// Philosophy: surface *real*, live information that isn't already obvious from
// the rest of the chrome. The Topbar covers tool/zoom/breakpoint/play, the
// TitleStrip owns the project name, the LeftSidebar shows the file tree, and
// the RightPanel describes the selection in detail. What's left for a status
// bar to add value:
//
//   LEFT cluster — ambient *document* state:
//     • Save indicator   — live autosave pulse (dirty vs. saved Xs ago).
//     • Component counts — total + how many live under `primitives/`.
//     • History depth    — how far you can undo / redo right now.
//
//   RIGHT cluster — *current context* about the thing you're editing:
//     • Selection        — component name + nested path + last-measured size.
//     • Breakpoint hint  — active slot with its pixel floor (additive to
//                          the Topbar chip, which doesn't show pixels).
//
// The previous version of this file showed fake bundler timings ("esbuild
// 42ms" etc.) that were never wired to the real sandbox. Those are gone.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { AppIcon } from "@/app/icons";
import { useProject } from "@/store/project";
import { useCanvas, type Breakpoint } from "@/store/canvas";
import { useMetrics } from "@/store/metrics";
import { isPrimitive } from "@/project/primitives";

// Pixel floors for Tailwind v4's default breakpoints. Kept local to the
// StatusBar (rather than pulled into the canvas store) because this is the
// only surface that cares about the human-readable pixel hint — the store
// itself treats breakpoints as opaque string slots.
const BREAKPOINT_PX: Record<Breakpoint, string> = {
  base: "all widths",
  sm: "≥640px",
  md: "≥768px",
  lg: "≥1024px",
  xl: "≥1280px",
  "2xl": "≥1536px",
};

/**
 * Format a past timestamp as a compact relative string: "just now", "12s ago",
 * "5m ago", "2h ago". We never show seconds past one minute or minutes past
 * one hour — the status bar is for *vibe*, not stopwatch precision.
 */
function formatRelative(ms: number | null, now: number): string {
  if (ms == null) return "never saved";
  const diff = Math.max(0, now - ms);
  if (diff < 3_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  const hours = Math.floor(diff / 3_600_000);
  return `${hours}h ago`;
}

/**
 * Drive a re-render once per second so the "Saved 12s ago" label stays
 * honest without us having to subscribe to time. Cheap — one Date.now()
 * per tick, no renders elsewhere in the tree.
 */
function useTicker(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function StatusBar() {
  const dirty = useProject((s) => s.projectMeta.dirty);
  const lastSavedAt = useProject((s) => s.projectMeta.lastSavedAt);
  const components = useProject((s) => s.components);
  const order = useProject((s) => s.order);
  const pastLen = useProject((s) => s.past.length);
  const futureLen = useProject((s) => s.future.length);

  const selectedId = useProject((s) => s.selectedComponentId);
  const selectedPath = useProject((s) => s.selectedElementPath);
  const selectedRect = useMetrics((s) =>
    selectedId ? s.selectedRects[selectedId] : undefined,
  );

  const breakpoint = useCanvas((s) => s.breakpoint);

  const now = useTicker(1000);

  const total = order.length;
  const primitiveCount = order.reduce(
    (n, id) => (components[id] && isPrimitive(components[id]) ? n + 1 : n),
    0,
  );

  const selectedComponent = selectedId ? components[selectedId] : null;
  // Only show dimensions if the metrics store has seen a rect for THIS path —
  // otherwise width/height refer to stale selection from a prior click.
  const rectMatches =
    selectedRect && selectedPath && selectedRect.path === selectedPath;

  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t border-stroke bg-panel px-3 text-[10.5px] text-ink-muted">
      {/* ---- LEFT: document-level state -------------------------------- */}
      <div className="flex items-center gap-3">
        {/* Save status — the amber/green dot is the fastest read. */}
        <span
          className="flex items-center gap-1.5"
          title={
            dirty
              ? "Unsaved changes — autosave runs ~1.5s after you stop editing"
              : lastSavedAt
                ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString()}`
                : "No save on record yet"
          }
        >
          <span
            className={
              "size-1.5 rounded-full " +
              (dirty ? "bg-amber-500" : "bg-emerald-500")
            }
          />
          {dirty ? "unsaved" : `saved · ${formatRelative(lastSavedAt, now)}`}
        </span>

        <Sep />

        {/* Component inventory. Show primitives split only when there are any —
            a fresh project with no primitives stays uncluttered. */}
        <span
          className="flex items-center gap-1"
          title={
            primitiveCount
              ? `${total} component${total === 1 ? "" : "s"}, of which ${primitiveCount} live under primitives/`
              : `${total} component${total === 1 ? "" : "s"} in this project`
          }
        >
          <AppIcon name="Boxes" size={11} />
          {total}
          {primitiveCount > 0 ? (
            <span className="text-ink-faint">· {primitiveCount} primitive{primitiveCount === 1 ? "" : "s"}</span>
          ) : null}
        </span>

        {/* Undo/redo depth — the history store's `past`/`future` lengths.
            Hidden entirely until the user has made at least one edit, so
            empty projects don't flash "↶ 0". */}
        {(pastLen > 0 || futureLen > 0) && (
          <>
            <Sep />
            <span
              className="flex items-center gap-1"
              title={`${pastLen} undo step${pastLen === 1 ? "" : "s"} · ${futureLen} redo step${futureLen === 1 ? "" : "s"}`}
            >
              <AppIcon name="Undo" size={11} />
              {pastLen}
              <span className="text-ink-faint mx-0.5">/</span>
              <AppIcon name="Redo" size={11} />
              {futureLen}
            </span>
          </>
        )}
      </div>

      {/* ---- RIGHT: current-context ------------------------------------ */}
      <div className="flex items-center gap-3">
        {selectedComponent ? (
          <span
            className="flex items-center gap-1.5"
            title={
              rectMatches
                ? `${selectedComponent.name} · path ${selectedPath} · ${selectedRect.w}×${selectedRect.h}px`
                : `${selectedComponent.name} · path ${selectedPath ?? "—"}`
            }
          >
            <AppIcon name="Frame" size={11} />
            <span className="text-ink">{selectedComponent.name}</span>
            {selectedPath && selectedPath !== "0" ? (
              <span className="text-ink-faint font-mono">
                {/* Show element depth as `·n` rather than the full path — the
                    RightPanel layers view already shows the full breadcrumb. */}
                · {selectedPath.split(".").length - 1} deep
              </span>
            ) : null}
            {rectMatches ? (
              <span className="text-ink-faint">
                · {Math.round(selectedRect.w)}×{Math.round(selectedRect.h)}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-ink-faint">
            <AppIcon name="Cursor" size={11} />
            no selection
          </span>
        )}

        <Sep />

        {/* Breakpoint hint. The Topbar has the clickable chip; we add the
            pixel range here so the user learns what each slot *means*
            without reading Tailwind docs. */}
        <span
          className="flex items-center gap-1"
          title={`Inspector writes classes prefixed with \`${breakpoint === "base" ? "" : breakpoint + ":"}\` — applies at ${BREAKPOINT_PX[breakpoint]}`}
        >
          <span className="font-medium text-ink">{breakpoint}</span>
          <span className="text-ink-faint">· {BREAKPOINT_PX[breakpoint]}</span>
        </span>
      </div>
    </div>
  );
}

function Sep() {
  return <span className="text-ink-faint">·</span>;
}
