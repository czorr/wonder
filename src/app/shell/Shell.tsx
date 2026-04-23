import { useEffect } from "react";
import { TitleStrip } from "@/app/shell/TitleStrip";
import { Topbar } from "@/app/shell/Topbar";
import { LeftSidebar } from "@/app/shell/LeftSidebar";
import { RightPanel } from "@/app/shell/RightPanel";
import { CanvasArea } from "@/app/shell/CanvasArea";
import { CodePanel } from "@/app/shell/CodePanel";
import { StatusBar } from "@/app/shell/StatusBar";
import { PreviewOverlay } from "@/app/shell/PreviewOverlay";
import { ProjectTokensStyle } from "@/app/shell/ProjectTokensStyle";
import { ResizableSidebar } from "@/app/shell/ResizableSidebar";
import { ProfileModal } from "@/app/shell/ProfileModal";
import { ProjectLauncher } from "@/app/shell/ProjectLauncher";
import { TokensStudio } from "@/app/shell/TokensStudio";
import { ExtractDesignSystemModal } from "@/app/shell/ExtractDesignSystemModal";
import { useNativeMenu } from "@/app/shell/useNativeMenu";
import { useProject } from "@/store/project";
import { useCanvas } from "@/store/canvas";
import { useChat } from "@/store/chat";
import { useLayout } from "@/store/layout";
import { useTheme } from "@/store/theme";
import { normalizePastedComponent } from "@/ast/paste";
import {
  loadAppState,
  loadProjectFromPath,
  initAutosave,
  flushAutosave,
} from "@/persistence";

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return true;
  if (t.isContentEditable) return true;
  if (t.closest(".monaco-editor")) return true;
  return false;
}

export function Shell() {
  // Single mount point for the profile/settings modal. Opened from the
  // TitleStrip avatar and the chat header cog — both funnel through
  // `useChat.openProfile()` so there's one source of truth.
  const profileOpen = useChat((s) => s.profileOpen);
  // Gate the whole editor behind a ProjectLauncher when no project is
  // loaded. `path === null` is the canonical "no project" signal — set by
  // initial boot, by File → Close, and by failed project restore.
  const projectPath = useProject((s) => s.projectMeta.path);
  const hasProject = !!projectPath;
  // What occupies the middle column of the shell. `"tokens"` replaces
  // CanvasArea + CodePanel with the full-height TokensStudio. Flipped on
  // by LeftSidebar's tailwind.config.ts entry, off by the studio's back
  // button. Sidebars stay mounted either way so file navigation still
  // works while editing tokens.
  const centerView = useLayout((s) => s.centerView);
  const extractOpen = useLayout((s) => s.extractDesignSystemOpen);
  const closeExtract = useLayout((s) => s.closeExtractDesignSystem);

  // Wire the native (Tauri) menu bar. No-op in plain-browser dev — safe to
  // call unconditionally. Must stay at Shell level so we don't install
  // multiple listeners.
  useNativeMenu();

  // Keep <html> in sync with the theme store so the chrome's `dark:` rules
  // flip the whole app. Done once, at the root — individual components never
  // touch `document.documentElement` themselves.
  const theme = useTheme((s) => s.theme);
  useEffect(() => {
    const cls = document.documentElement.classList;
    if (theme === "dark") cls.add("dark");
    else cls.remove("dark");
  }, [theme]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;
      const result = normalizePastedComponent(text, "Pasted");
      if (!result) return;
      e.preventDefault();
      const { pan, zoom } = useCanvas.getState();
      const x = Math.round(-pan.x / zoom) + 120;
      const y = Math.round(-pan.y / zoom) + 120;
      useProject.getState().addComponent({
        name: result.name,
        filename: `${result.name}.tsx`,
        folder: "pasted",
        source: result.source,
        x,
        y,
        width: 320,
        height: 200,
      });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // On launch, if the app previously had a project open, try to restore it.
  // A failure (folder moved/deleted) silently falls back to the seed project
  // that the store already boots with, so the UI is never stuck on a spinner.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await loadAppState();
      if (cancelled || !state.lastOpenedPath) return;
      await loadProjectFromPath(state.lastOpenedPath);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Browser-side guard: warn the user when trying to close the tab/window with
  // unsaved changes. With autosave running, this should almost never fire —
  // but if the user quits in the ~1.5s debounce window, we fire a best-effort
  // synchronous-ish flush. Tauri's beforeunload fires on window close, so
  // this covers the "accidental ⌘W" case without a Rust round-trip.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useProject.getState().projectMeta.dirty) return;
      // Kick off the save — we can't await here (beforeunload is sync), but
      // modern browsers give the in-flight write ~a few hundred ms to finish
      // before killing the page. Worth a try.
      void flushAutosave();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Debounced autosave: every mutation flips `dirty=true`; 1.5s after the
  // last one, we write the project to disk. Only active once a project has
  // a `path` (scaffolded or Save As'd) — the launcher flow is unaffected.
  useEffect(() => {
    const stop = initAutosave();
    return stop;
  }, []);

  // ProjectLauncher path: no project loaded → show the welcome screen.
  // We still mount ProjectTokensStyle + ProfileModal so tokens render and
  // the profile/settings modal can be opened from the launcher surface
  // (wired later if needed). The rest of the editor chrome is skipped.
  if (!hasProject) {
    return (
      <>
        <ProjectTokensStyle />
        <ProjectLauncher />
        {profileOpen ? <ProfileModal /> : null}
      </>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-ink">
      <ProjectTokensStyle />
      <TitleStrip />
      <Topbar />
      <div className="flex min-h-0 flex-1">
        <ResizableSidebar side="left">
          <LeftSidebar />
        </ResizableSidebar>
        <div className="flex min-w-0 flex-1 flex-col">
          {centerView === "tokens" ? (
            <TokensStudio />
          ) : (
            <>
              <CanvasArea />
              <CodePanel />
            </>
          )}
        </div>
        <ResizableSidebar side="right">
          <RightPanel />
        </ResizableSidebar>
      </div>
      <StatusBar />
      <PreviewOverlay />
      {profileOpen ? <ProfileModal /> : null}
      {extractOpen ? <ExtractDesignSystemModal onClose={closeExtract} /> : null}
    </div>
  );
}
