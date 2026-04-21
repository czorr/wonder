import { useEffect } from "react";
import { TitleStrip } from "@/app/shell/TitleStrip";
import { Topbar } from "@/app/shell/Topbar";
import { LeftSidebar } from "@/app/shell/LeftSidebar";
import { RightPanel } from "@/app/shell/RightPanel";
import { CanvasArea } from "@/app/shell/CanvasArea";
import { CodePanel } from "@/app/shell/CodePanel";
import { StatusBar } from "@/app/shell/StatusBar";
import { PreviewOverlay } from "@/app/shell/PreviewOverlay";
import { useProject } from "@/store/project";
import { useCanvas } from "@/store/canvas";
import { normalizePastedComponent } from "@/ast/paste";

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return true;
  if (t.isContentEditable) return true;
  if (t.closest(".monaco-editor")) return true;
  return false;
}

export function Shell() {
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

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-ink">
      <TitleStrip />
      <Topbar />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <CanvasArea />
          <CodePanel />
        </div>
        <RightPanel />
      </div>
      <StatusBar />
      <PreviewOverlay />
    </div>
  );
}
