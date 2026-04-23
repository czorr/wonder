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
import { PROJECT_FILE_VERSION } from "./types";

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
 *
 * Upgrade flow: when the project on disk is an older schema version, we
 * show an explicit "Upgrade?" prompt (Xcode-style) BEFORE loading into the
 * store. On confirm, the project opens AND auto-saves so the on-disk
 * layout catches up — otherwise the user would have to remember to save
 * for the upgrade to stick.
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
    const needsUpgrade = loaded.onDiskVersion < PROJECT_FILE_VERSION;

    if (needsUpgrade) {
      const ok = await confirmUpgrade(loaded.onDiskVersion, loaded.meta.name);
      if (!ok) return false;
    }

    useProject.getState().replaceProject({
      path,
      name: loaded.meta.name,
      createdAt: loaded.meta.createdAt,
      components: loaded.components,
      order: loaded.order,
      propValues: loaded.meta.propValues,
      selection: loaded.meta.selection,
      tokens: loaded.tokens,
      declaredFolders: loaded.meta.declaredFolders ?? [],
    });
    // Restore canvas view from the file (persisted with the project).
    useCanvas.getState().setZoom(loaded.meta.canvas.zoom);
    useCanvas.getState().setPan(loaded.meta.canvas.pan);

    await addRecentProject({ path, name: loaded.meta.name });

    // Post-upgrade: persist the new layout immediately so the on-disk
    // format matches what's now in memory. If this fails, the project is
    // still usable — the user can retry with manual save.
    if (needsUpgrade) {
      const saved = await writeToPath(path, loaded.meta.name);
      if (!saved) {
        console.warn(
          "[wonder] upgraded project loaded but auto-save failed; " +
            "save manually to persist v2 layout.",
        );
      }
    }
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

/**
 * Confirmation dialog shown when an older-schema project is opened.
 * Describes what the upgrade does so the user can decide informedly.
 * The upgrade is non-destructive in v1→v2 (we only strip a never-used
 * field and add new files), so we frame it as safe.
 */
async function confirmUpgrade(
  fromVersion: number,
  projectName: string,
): Promise<boolean> {
  return ask(
    `"${projectName}" was created with an older Wonder format ` +
      `(v${fromVersion}).\n\n` +
      `Upgrade to v${PROJECT_FILE_VERSION}? This will:\n` +
      `  • Add design/tokens.json (your project's color + font system)\n` +
      `  • Add design/tokens.css (auto-generated from tokens.json)\n` +
      `  • Create .wonder/ for runtime data (chat history, caches)\n` +
      `  • Bump wonder.json to v${PROJECT_FILE_VERSION}\n\n` +
      `Nothing is lost — the upgrade is additive, and you can hand-edit ` +
      `any of the new files. The change is written to disk immediately.`,
    {
      title: "Upgrade project format",
      kind: "info",
      okLabel: "Upgrade",
      cancelLabel: "Cancel",
    },
  );
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
      declaredFolders: store.declaredFolders,
      canvas: { zoom: canvas.zoom, pan: canvas.pan },
      selection: {
        componentId: store.selectedComponentId,
        elementPath: store.selectedElementPath,
        openTabs: store.openTabs,
        activeTab: store.activeTab,
      },
      tokens: store.tokens,
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
