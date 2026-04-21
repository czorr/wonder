import { Topbar } from "@/app/shell/Topbar";
import { LeftSidebar } from "@/app/shell/LeftSidebar";
import { RightPanel } from "@/app/shell/RightPanel";
import { CanvasArea } from "@/app/shell/CanvasArea";
import { CodePanel } from "@/app/shell/CodePanel";

export function Shell() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg text-fg">
      <Topbar />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <CanvasArea />
          <CodePanel />
        </div>
        <RightPanel />
      </div>
    </div>
  );
}
