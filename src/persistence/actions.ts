import { open as openDialog, save as saveDialog, ask, message } from "@tauri-apps/plugin-dialog";
import { useProject } from "@/store/project";
import { useCanvas } from "@/store/canvas";
import {
  openProject,
  writeProjectFolder,
  pruneOrphans,
  folderIsEmpty,
  folderIsWonderProject,
  basename,
} from "./fs";
import { addRecentProject, removeRecentProject } from "./appState";
import { ProjectFileError } from "./migrate";

// ---------------------------------------------------------------------------
// Discard confirmation — central helper so every flow that replaces the
// document (New, Open, Open Recent, app close) uses the same prompt.
// ---------------------------------------------------------------------------

async function confirmDiscardIfDirty(): Promise<boolean> {
  const { dirty, name } = useProject.getState().projectMeta;
  if (!dirty) return true;
  return ask(
    `You have unsaved changes in "${name}". Discard them?`,
    {
      title: "Unsaved changes",
      kind: "warning",
      okLabel: "Discard",
      cancelLabel: "Cancel",
    },
  );
}

async function showError(title: string, msg: string) {
  await message(msg, { title, kind: "error" });
}

// ---------------------------------------------------------------------------
// New project
// ---------------------------------------------------------------------------

export async function actionNewProject(): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return;
  useProject.getState().newProject();
  // Reset the canvas view so users don't wake up looking at empty space
  // panned 800px to the right from their last project.
  useCanvas.getState().setPan({ x: 60, y: 60 });
  useCanvas.getState().setZoom(1);
}

// ---------------------------------------------------------------------------
// Open project (folder picker)
// ---------------------------------------------------------------------------

export async function actionOpenProject(): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return;

  const selected = await openDialog({
    directory: true,
    multiple: false,
    title: "Open Wonder project",
  });
  if (!selected || typeof selected !== "string") return;

  await loadProjectFromPath(selected);
}

/**
 * Load a project from a specific folder path. Used by Open dialog, Open
 * Recent, and bootstrap. Handles errors with a dialog and cleans the
 * recents list if the folder is no longer a valid Wonder project.
 */
export async function loadProjectFromPath(path: string): Promise<boolean> {
  const store = useProject.getState();
  store.setLoading(true);
  try {
    if (!(await folderIsWonderProject(path))) {
      await showError(
        "Not a Wonder project",
        `The folder "${basename(path)}" does not contain a wonder.json file.`,
      );
      await removeRecentProject(path);
      return false;
    }

    const loaded = await openProject(path);
    useProject.getState().replaceProject({
      path,
      name: loaded.meta.name,
      createdAt: loaded.meta.createdAt,
      components: loaded.components,
      order: loaded.order,
      propValues: loaded.meta.propValues,
      selection: loaded.meta.selection,
    });
    // Restore canvas view from the file (persisted with the project).
    useCanvas.getState().setZoom(loaded.meta.canvas.zoom);
    useCanvas.getState().setPan(loaded.meta.canvas.pan);

    await addRecentProject({ path, name: loaded.meta.name });
    return true;
  } catch (err) {
    const msg =
      err instanceof ProjectFileError
        ? err.message
        : `Could not open project: ${err instanceof Error ? err.message : String(err)}`;
    await showError("Open failed", msg);
    // If the project file is missing/moved, forget it so the recents list stays clean.
    await removeRecentProject(path);
    return false;
  } finally {
    useProject.getState().setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Save / Save As
// ---------------------------------------------------------------------------

export async function actionSave(): Promise<boolean> {
  const meta = useProject.getState().projectMeta;
  if (!meta.path) return actionSaveAs();
  return writeToPath(meta.path, meta.name);
}

export async function actionSaveAs(): Promise<boolean> {
  // `save` dialog returns a single path; passing `defaultPath` with the current
  // name makes macOS default to "~/Projects/<name>". Tauri's save dialog is
  // for files, but the user will type a folder name — we then create that
  // folder and write the project into it.
  const target = await saveDialog({
    title: "Save Wonder project as…",
    defaultPath: useProject.getState().projectMeta.name || "Untitled",
  });
  if (!target) return false;

  // The user picked a path — that path will be our project FOLDER.
  // If it exists and is non-empty and isn't already a Wonder project, warn.
  if (
    !(await folderIsEmpty(target)) &&
    !(await folderIsWonderProject(target))
  ) {
    const ok = await ask(
      `"${basename(target)}" is not empty. Continue and add a wonder.json + components/ here?`,
      {
        title: "Folder not empty",
        kind: "warning",
        okLabel: "Continue",
        cancelLabel: "Cancel",
      },
    );
    if (!ok) return false;
  }

  const name = basename(target);
  const ok = await writeToPath(target, name);
  if (ok) {
    useProject.getState().setProjectPath(target, name);
  }
  return ok;
}

async function writeToPath(path: string, name: string): Promise<boolean> {
  const store = useProject.getState();
  const canvas = useCanvas.getState();
  try {
    await writeProjectFolder({
      path,
      name,
      createdAt: store.projectMeta.createdAt,
      components: store.components,
      order: store.order,
      propValues: store.propValues,
      canvas: { zoom: canvas.zoom, pan: canvas.pan },
      selection: {
        componentId: store.selectedComponentId,
        elementPath: store.selectedElementPath,
        openTabs: store.openTabs,
        activeTab: store.activeTab,
      },
    });
    // Post-save cleanup: delete .tsx files that no longer exist in the manifest.
    await pruneOrphans({
      path,
      components: store.components,
      order: store.order,
    });

    useProject.getState().markClean({ path, name });
    await addRecentProject({ path, name });
    return true;
  } catch (err) {
    await showError(
      "Save failed",
      `Could not save project: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
