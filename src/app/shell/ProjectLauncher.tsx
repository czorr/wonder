import { useEffect, useState } from "react";
import { AppIcon } from "@/app/icons";
import { WonderLogo } from "@/app/WonderLogo";
import {
  actionNewProject,
  actionOpenProject,
  loadAppState,
  loadProjectFromPath,
  removeRecentProject,
  type RecentProject,
} from "@/persistence";

// ---------------------------------------------------------------------------
// ProjectLauncher — Figma/Xcode-style welcome screen.
//
// Shown by Shell whenever the project store has no `path` (boot without a
// restored project, File → New creating an in-memory-only state, etc.).
// Guards entry into the editor so we never render the canvas against an
// unsaved in-memory doc that users expect to "just be saved somewhere".
//
// Surface:
//   ┌──────────────────────────────────────────────────────────┐
//   │  logo                                                    │
//   │  Wonder                                                  │
//   │  Design systems, live.                                   │
//   │                                                          │
//   │  [ + New project ]   [ ⌂ Open project… ]                 │
//   │                                                          │
//   │  Recent                                                  │
//   │  ├ Project A   /path/a    2h ago    ✕                    │
//   │  ├ Project B   /path/b    yesterday ✕                    │
//   │  …                                                       │
//   └──────────────────────────────────────────────────────────┘
//
// The whole chrome (TitleStrip, sidebars, canvas) is hidden while this is
// up. Once the user picks a project, `loadProjectFromPath` hydrates the
// store with `path !== null` and Shell swaps to the editor.
// ---------------------------------------------------------------------------

export function ProjectLauncher() {
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAppState()
      .then((s) => {
        if (cancelled) return;
        setRecents(s.recentProjects);
      })
      .catch((err) => {
        // Best-effort — launcher still works without recents.
        console.warn("[wonder] launcher: loadAppState failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Wrap any action in a busy guard so double-clicks don't stack dialogs.
  // Errors are caught + surfaced so a broken Tauri bridge (e.g. running in
  // a plain browser) doesn't leave the UI stuck on a spinner.
  const run = (key: string, fn: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      console.error(`[wonder] launcher action "${key}" failed:`, err);
      // Keep the surface visible — no alert — the console has the detail
      // and the button resets.
    } finally {
      setBusy(null);
    }
  };

  const openRecent = (r: RecentProject) =>
    run(`recent:${r.path}`, async () => {
      const ok = await loadProjectFromPath(r.path);
      if (!ok) {
        // `loadProjectFromPath` already removed the entry on error, but the
        // local list is stale — refresh from disk so the row disappears.
        const s = await loadAppState();
        setRecents(s.recentProjects);
      }
    });

  const dropRecent = (r: RecentProject) => async (e: React.MouseEvent) => {
    e.stopPropagation();
    await removeRecentProject(r.path);
    setRecents((prev) => prev.filter((x) => x.path !== r.path));
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-canvas text-ink">
      {/* Ambient background — soft radial tint so the card doesn't float on
          flat panel color. Purely decorative, no interaction. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 30% 20%, rgba(16,185,129,0.10), transparent 60%)," +
            "radial-gradient(ellipse at 70% 80%, rgba(59,130,246,0.06), transparent 55%)",
        }}
      />

      <div className="relative z-10 flex w-[720px] max-w-[calc(100vw-64px)] flex-col gap-8">
        <Header />

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <ActionCard
              title="New project"
              helper="Pick a folder on disk — Wonder sets up the scaffolding."
              icon="Plus"
              onClick={run("new", actionNewProject)}
              busy={busy === "new"}
              primary
            />
            <ActionCard
              title="Open project"
              helper="Browse to any folder. Initialize it if it's not a Wonder project yet."
              icon="FolderOpen"
              onClick={run("open", actionOpenProject)}
              busy={busy === "open"}
            />
          </div>
        </div>

        <RecentsList
          recents={recents}
          onOpen={openRecent}
          onRemove={dropRecent}
          busyKey={busy}
        />

        <Footer />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header — logo + wordmark + tagline. Keeps the surface feeling intentional
// instead of "modal with two buttons".
// ---------------------------------------------------------------------------

function Header() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <WonderLogo size={56} shadow />
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">
          Wonder
        </h1>
        <p className="text-[12.5px] text-ink-faint">
          Design systems, live — built from the components you already ship.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActionCard — large primary button used for "New" / "Open". Primary variant
// uses accent fill; secondary sits on a white surface with a subtle hover.
// ---------------------------------------------------------------------------

function ActionCard({
  title,
  helper,
  icon,
  onClick,
  busy,
  primary,
}: {
  title: string;
  helper: string;
  icon: Parameters<typeof AppIcon>[0]["name"];
  onClick: () => void;
  busy?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={
        "group flex items-start gap-3 rounded-xl border p-4 text-left transition " +
        (primary
          ? "border-accent/30 bg-accent-tint hover:bg-accent/15 hover:border-accent/50"
          : "border-stroke bg-white hover:bg-panel-soft hover:border-stroke-strong") +
        (busy ? " cursor-wait opacity-70" : " cursor-pointer")
      }
    >
      <div
        className={
          "grid size-9 shrink-0 place-items-center rounded-lg transition " +
          (primary
            ? "bg-accent text-white"
            : "bg-panel-soft text-ink group-hover:bg-white")
        }
      >
        {busy ? (
          <AppIcon name="Loader" size={16} className="animate-spin" />
        ) : (
          <AppIcon name={icon} size={16} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between">
          <span
            className={
              "text-[13px] font-semibold " +
              (primary ? "text-accent-ink" : "text-ink")
            }
          >
            {title}
          </span>
          <AppIcon
            name="ArrowRight"
            size={13}
            className={
              "translate-x-0 text-ink-faint transition group-hover:translate-x-0.5 " +
              (primary ? "text-accent-ink/70" : "")
            }
          />
        </div>
        <span className="mt-0.5 text-[11.5px] leading-relaxed text-ink-faint">
          {helper}
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Recents — scrollable list, max 5 visible before internal scroll. Empty
// state is explicit and tells the user what to do next.
// ---------------------------------------------------------------------------

function RecentsList({
  recents,
  onOpen,
  onRemove,
  busyKey,
}: {
  recents: RecentProject[];
  onOpen: (r: RecentProject) => () => Promise<void>;
  onRemove: (r: RecentProject) => (e: React.MouseEvent) => Promise<void>;
  busyKey: string | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
          Recent
        </span>
        {recents.length > 0 ? (
          <span className="text-[10.5px] text-ink-faint">
            {recents.length} project{recents.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {recents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stroke bg-panel-soft/40 px-4 py-6 text-center">
          <p className="text-[12px] text-ink-faint">
            No recent projects yet — create one or open a folder to get started.
          </p>
        </div>
      ) : (
        <div className="flex max-h-[260px] flex-col overflow-y-auto rounded-xl border border-stroke bg-white">
          {recents.map((r, i) => {
            const isBusy = busyKey === `recent:${r.path}`;
            return (
              <button
                key={r.path}
                onClick={onOpen(r)}
                disabled={!!busyKey}
                className={
                  "group flex items-center gap-3 px-3 py-2.5 text-left transition hover:bg-panel-soft " +
                  (i > 0 ? "border-t border-stroke" : "") +
                  (isBusy ? " cursor-wait opacity-70" : " cursor-pointer")
                }
              >
                <div
                  className={
                    "grid size-8 shrink-0 place-items-center rounded-md border transition " +
                    (isBusy
                      ? "border-accent/40 bg-accent-tint text-accent"
                      : "border-stroke bg-panel-soft text-ink-muted group-hover:bg-white group-hover:text-ink")
                  }
                >
                  {isBusy ? (
                    <AppIcon name="Loader" size={13} className="animate-spin" />
                  ) : (
                    <AppIcon name="FolderOpen" size={13} />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12.5px] font-medium text-ink">
                    {r.name}
                  </span>
                  <span
                    className="truncate font-mono text-[10.5px] text-ink-faint"
                    title={r.path}
                  >
                    {r.path}
                  </span>
                </div>
                <span className="shrink-0 text-[10.5px] text-ink-faint">
                  {formatRelative(r.openedAt)}
                </span>
                <span
                  onClick={onRemove(r)}
                  title="Remove from recents"
                  role="button"
                  tabIndex={-1}
                  className="ml-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-ink-faint opacity-0 transition hover:bg-stroke hover:text-ink-muted group-hover:opacity-100"
                >
                  <AppIcon name="X" size={11} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer — build marker + subtle reminder that the app is offline-first.
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <div className="flex items-center justify-center gap-3 text-[10.5px] text-ink-faint">
      <span className="inline-flex items-center gap-1">
        <span className="size-1.5 rounded-full bg-accent" />
        Local · offline-first
      </span>
      <span className="text-ink-faint/60">·</span>
      <span>v0.1.0 dev</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Relative time formatter. Intentionally rough — recents are scanned, not
// audited, so "yesterday" and "2d ago" beats "Apr 22, 2026 14:32:18".
// ---------------------------------------------------------------------------

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMs = Date.now() - t;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}
