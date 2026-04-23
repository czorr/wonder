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
import { useProject } from "@/store/project";
import { useCanvas } from "@/store/canvas";
import { useChat } from "@/store/chat";
import { normalizePastedComponent } from "@/ast/paste";
import { loadAppState, loadProjectFromPath } from "@/persistence";

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
  // unsaved changes. Tauri also emits a close-requested event, but wiring that
  // requires a Rust command round-trip; the beforeunload hook is good enough
  // for the dev server + handles the "accidental window close" muscle memory.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useProject.getState().projectMeta.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
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
          <CanvasArea />
          <CodePanel />
        </div>
        <ResizableSidebar side="right">
          <RightPanel />
        </ResizableSidebar>
      </div>
      <StatusBar />
      <PreviewOverlay />
      {profileOpen ? <ProfileModal /> : null}
    </div>
  );
}
