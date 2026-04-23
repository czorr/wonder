// ---------------------------------------------------------------------------
// useNativeMenu — bridge between Tauri's native menu bar and Wonder's
// Zustand stores.
//
// The Rust side (src-tauri/src/lib.rs) builds the menu and emits a
// `wonder:menu` event with the item id every time the user clicks or hits
// the accelerator. This hook listens for those events and dispatches to
// the right action.
//
// Design notes:
//   - Single listener, installed once at the Shell level. Duplicating the
//     listener across components would cause every menu click to fire the
//     action N times.
//   - Store reads go through `getState()` (not hooks) so we always see the
//     latest values — the listener is long-lived and doesn't re-render.
//   - In non-Tauri environments (dev server in a plain browser, storybook,
//     etc.) the dynamic import fails silently; in-app keyboard handlers
//     still cover the common shortcuts there.
//   - The id strings must stay in lockstep with `lib.rs`. If you rename
//     one, grep both files.
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import { useProject } from "@/store/project";
import { useLayout } from "@/store/layout";
import { useChat } from "@/store/chat";
import { useCanvas } from "@/store/canvas";
import {
  actionCloseProject,
  actionNewProject,
  actionOpenProject,
  actionSave,
  actionSaveAs,
} from "@/persistence";

/** Download the currently active component's `.tsx` as a file via an
 *  in-browser anchor. Mirrors the File menu's in-app "Export current .tsx"
 *  path — kept inline here because it doesn't fit any shared action module
 *  and the surface is tiny. */
function exportActiveComponent(): void {
  const state = useProject.getState();
  const id = state.activeTab;
  const component = id ? state.components[id] : null;
  if (!component) return;

  const blob = new Blob([component.source], { type: "text/typescript" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = component.filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Map a menu id (string) to the action it triggers. Centralized so the
 *  switch-like surface is easy to audit and reason about. */
function dispatchMenu(id: string): void {
  switch (id) {
    // ----- App -----
    case "app.settings":
      useChat.getState().openProfile();
      break;

    // ----- File -----
    case "file.new":
      void actionNewProject();
      break;
    case "file.open":
      void actionOpenProject();
      break;
    case "file.save":
      void actionSave();
      break;
    case "file.save_as":
      void actionSaveAs();
      break;
    case "file.export":
      exportActiveComponent();
      break;
    case "file.close":
      void actionCloseProject();
      break;

    // ----- Edit ----- (Cut/Copy/Paste/SelectAll are predefined and never
    // reach us — the OS routes them to the focused element directly.)
    case "edit.undo":
      useProject.getState().undo();
      break;
    case "edit.redo":
      useProject.getState().redo();
      break;

    // ----- View -----
    case "view.toggle_left":
      useLayout.getState().toggleLeft();
      break;
    case "view.toggle_right":
      useLayout.getState().toggleRight();
      break;
    case "view.toggle_bottom":
      useLayout.getState().toggleBottom();
      break;
    case "view.canvas":
      useLayout.getState().setCenterView("canvas");
      break;
    case "view.tokens":
      useLayout.getState().setCenterView("tokens");
      break;
    case "view.zoom_in":
      useCanvas.getState().zoomIn();
      break;
    case "view.zoom_out":
      useCanvas.getState().zoomOut();
      break;
    case "view.zoom_reset":
      useCanvas.getState().zoomReset();
      break;
    case "view.reset_layout":
      useLayout.getState().resetLayout();
      break;

    // ----- Assistant -----
    case "assistant.toggle_chat":
      useChat.getState().toggleChat();
      break;
    case "assistant.preview":
      useCanvas.getState().openPreview();
      break;
    case "assistant.extract_ds":
      useLayout.getState().openExtractDesignSystem();
      break;

    // ----- Help -----
    case "help.docs":
      // TODO: replace with real docs URL once published.
      window.open("https://wonder.dev", "_blank", "noopener,noreferrer");
      break;
    case "help.issue":
      window.open(
        "https://github.com/wonder-app/wonder/issues/new",
        "_blank",
        "noopener,noreferrer",
      );
      break;

    default:
      // Unknown id — log so renames or typos in lib.rs surface loudly.
      console.warn(`[wonder] unhandled native menu id: "${id}"`);
  }
}

/**
 * Install the `wonder:menu` listener for the lifetime of the mounted
 * component. Safe to call from any component — just call it once, at Shell
 * level, to avoid duplicate dispatch.
 */
export function useNativeMenu(): void {
  useEffect(() => {
    // Guard against non-Tauri environments. We can't reliably detect "are we
    // in Tauri" without importing the module, so we just let the import fail
    // in the browser and treat it as a no-op.
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const off = await listen<string>("wonder:menu", (event) => {
          dispatchMenu(event.payload);
        });
        if (cancelled) {
          off();
        } else {
          unlisten = off;
        }
      } catch (err) {
        // Running in plain browser dev — silently skip. Native menus only
        // exist in the Tauri shell anyway.
        if (import.meta.env?.DEV) {
          console.info(
            "[wonder] native menu listener not installed (not running in Tauri)",
            err,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
