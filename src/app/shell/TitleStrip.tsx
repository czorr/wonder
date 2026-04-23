import { AppIcon } from "@/app/icons";
import { useEffect, useState } from "react";
import { useProject } from "@/store/project";
import { useChat } from "@/store/chat";
import {
  actionNewProject,
  actionOpenProject,
  actionCloseProject,
  actionSave,
  actionSaveAs,
  loadProjectFromPath,
  loadAppState,
} from "@/persistence";
import type { RecentProject } from "@/persistence";
import { basename } from "@/persistence";

/**
 * Top-of-window strip. On macOS it doubles as the drag region (Tauri respects
 * `data-tauri-drag-region`). Click the project name to open the File menu.
 */
export function TitleStrip() {
  const name = useProject((s) => s.projectMeta.name);
  const dirty = useProject((s) => s.projectMeta.dirty);
  const activeTab = useProject((s) => s.activeTab);
  const components = useProject((s) => s.components);
  const activeFilename = activeTab ? components[activeTab]?.filename ?? null : null;

  const [menuOpen, setMenuOpen] = useState(false);
  const openProfile = useChat((s) => s.openProfile);

  return (
    <div
      data-tauri-drag-region
      className="relative flex h-9 shrink-0 items-center border-b border-stroke bg-panel"
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

        {/* Project name button (opens File menu). We stopPropagation on the
            button so clicking it doesn't trigger Tauri's window-drag. */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-ink hover:bg-panel-soft transition"
          title="Project menu"
        >
          {name}
          {dirty ? (
            <span
              className="size-1.5 rounded-full bg-accent"
              title="Unsaved changes"
            />
          ) : null}
          <AppIcon name="ChevronDown" size={11} className="text-ink-faint" />
        </button>

        {activeFilename ? (
          <>
            <span className="text-ink-faint">·</span>
            <span className="text-ink">{activeFilename}</span>
          </>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 pr-2">
        <button
          title="Share"
          className="grid size-7 place-items-center rounded-md text-ink-muted hover:bg-panel-soft hover:text-ink transition"
        >
          <AppIcon name="Share" size={14} />
        </button>
        <button
          title="Comments"
          className="grid size-7 place-items-center rounded-md text-ink-muted hover:bg-panel-soft hover:text-ink transition"
        >
          <AppIcon name="Message" size={14} />
        </button>
        <div className="mx-1 h-4 w-px bg-stroke" />
        {/* Profile avatar — opens the unified Profile & Settings modal.
            Gets slight visual weight (circle + accent tint) to read as the
            user's personal surface, separate from the chrome icons beside
            it. Shortcut target lives inside the modal itself (Esc closes). */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            openProfile();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Profile & settings"
          className="grid size-7 place-items-center rounded-full bg-accent-tint text-[10.5px] font-semibold text-accent transition hover:brightness-105"
        >
          W
        </button>
      </div>

      {menuOpen ? <FileMenu onClose={() => setMenuOpen(false)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// File menu dropdown
// ---------------------------------------------------------------------------

function FileMenu({ onClose }: { onClose: () => void }) {
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const dirty = useProject((s) => s.projectMeta.dirty);
  const hasPath = useProject((s) => s.projectMeta.path != null);
  const activeTab = useProject((s) => s.activeTab);
  const components = useProject((s) => s.components);

  // Close on outside click / Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-wonder-file-menu]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Load recents once on mount.
  useEffect(() => {
    let cancelled = false;
    loadAppState().then((s) => {
      if (!cancelled) setRecents(s.recentProjects);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = (fn: () => void | Promise<unknown>) => () => {
    onClose();
    void fn();
  };

  const exportCurrent = () => {
    const id = activeTab;
    const c = id ? components[id] : null;
    if (!c) return;
    const blob = new Blob([c.source], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = c.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      data-wonder-file-menu
      className="absolute left-1/2 top-full z-40 mt-1 w-[260px] -translate-x-1/2 rounded-lg border border-stroke bg-white shadow-lg"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <MenuItem
        icon={<AppIcon name="FileNew" size={13} />}
        label="New Project"
        shortcut="⌘N"
        onClick={run(actionNewProject)}
      />
      <MenuItem
        icon={<AppIcon name="FolderOpen" size={13} />}
        label="Open Project…"
        shortcut="⌘O"
        onClick={run(actionOpenProject)}
      />

      <RecentsSubmenu
        recents={recents}
        onPick={(path) => run(() => loadProjectFromPath(path))()}
      />

      <Divider />

      <MenuItem
        icon={<AppIcon name="Save" size={13} />}
        label="Save"
        shortcut="⌘S"
        disabled={hasPath && !dirty}
        onClick={run(actionSave)}
      />
      <MenuItem
        icon={<AppIcon name="SaveAll" size={13} />}
        label="Save As…"
        shortcut="⌘⇧S"
        onClick={run(actionSaveAs)}
      />

      <Divider />

      <MenuItem
        icon={<AppIcon name="Download" size={13} />}
        label="Export current .tsx"
        disabled={!activeTab}
        onClick={run(exportCurrent)}
      />

      <Divider />

      {/* "Close project" returns to the ProjectLauncher. Handy when the
          user wants to pick a different project without quitting the app. */}
      <MenuItem
        icon={<AppIcon name="CircleSlash" size={13} />}
        label="Close project"
        onClick={run(actionCloseProject)}
      />
    </div>
  );
}

function RecentsSubmenu({
  recents,
  onPick,
}: {
  recents: RecentProject[];
  onPick: (path: string) => void;
}) {
  if (recents.length === 0) return null;
  return (
    <div className="border-b border-stroke pb-1">
      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
        <AppIcon name="Clock" size={10} />
        Recent
      </div>
      {recents.slice(0, 8).map((r) => (
        <button
          key={r.path}
          onClick={() => onPick(r.path)}
          className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] hover:bg-panel-soft"
          title={r.path}
        >
          <span className="truncate text-ink">{r.name}</span>
          <span className="ml-2 shrink-0 truncate text-[10px] text-ink-faint">
            {basename(r.path)}
          </span>
        </button>
      ))}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition " +
        (disabled
          ? "text-ink-faint opacity-50 cursor-not-allowed"
          : "text-ink hover:bg-panel-soft")
      }
    >
      <span className="grid size-4 place-items-center text-ink-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut ? (
        <span className="text-[10px] text-ink-faint">{shortcut}</span>
      ) : null}
    </button>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-stroke" />;
}
