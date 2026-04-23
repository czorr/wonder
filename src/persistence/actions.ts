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
import { ensureAssetDirs, readAllAssets } from "./assets";
import { useAssets } from "@/store/assets";
import { addRecentProject, removeRecentProject } from "./appState";
import { ProjectFileError } from "./migrate";
import { PROJECT_FILE_VERSION } from "./types";
import { defaultTokens } from "@/project/tokens";

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

/**
 * Create a new project by picking a folder and scaffolding into it.
 *
 * Figma-style flow: Wonder is a local-file editor, so "New Project" always
 * lands on disk immediately — there's no in-memory untitled limbo. This
 * keeps the launcher honest (everything it lists is a real, loadable
 * project) and avoids the "where did my work go?" surprise you get when a
 * fake Untitled project is silently discarded.
 *
 * The save dialog defaults to `~/Documents/<basename>` on macOS so the
 * user can just type a folder name. `loadProjectFromPath` handles the
 * actual scaffolding via `initializeFolderAsProject` — we reuse that
 * path so Open and New go through the same write codepath.
 */
export async function actionNewProject(): Promise<boolean> {
  if (!(await confirmDiscardIfDirty())) return false;

  const target = await saveDialog({
    title: "Create new Wonder project",
    defaultPath: "Untitled",
  });
  if (!target) return false;

  // `loadProjectFromPath` handles both "exists as Wonder project" (load) and
  // "doesn't exist yet / empty folder" (initialize + load). Either way the
  // store ends up hydrated against `target` and the canvas pans to origin.
  const loaded = await loadProjectFromPath(target);
  if (!loaded) return false;

  useCanvas.getState().setPan({ x: 60, y: 60 });
  useCanvas.getState().setZoom(1);
  return true;
}

/**
 * "Close current project" — returns the user to the ProjectLauncher without
 * touching disk. Used by File → Close and by the launcher's back button
 * when you want to pick a different project.
 */
export async function actionCloseProject(): Promise<boolean> {
  if (!(await confirmDiscardIfDirty())) return false;
  useProject.getState().newProject();
  // Assets are per-project. Wipe the in-memory catalogue so the next
  // project load (or the launcher screen in between) doesn't see stale
  // images from the project we just left.
  useAssets.getState().clear();
  return true;
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
      // Fresh folder — offer to initialize instead of dead-ending the user.
      // Empty folders initialize silently (they just picked it); non-empty
      // folders get a confirm so we don't litter an existing directory
      // without warning.
      const initialized = await initializeFolderAsProject(path);
      if (!initialized) {
        // Declined, or a hard failure inside initialize (already shown).
        // Drop it from recents so stale broken entries don't accumulate.
        await removeRecentProject(path);
        return false;
      }
      // Fall through — we wrote wonder.json + scaffolding; read it back
      // like any other open so the UI state ends up identical to "opened
      // an existing project".
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

    // Assets live outside wonder.json (the folder IS the manifest) so we
    // scan them separately. A failure here is non-fatal — components still
    // render, they just get broken image icons until the user re-drops
    // files in. `ensureAssetDirs` seeds the folder for empty projects so
    // the panel always has a drop target.
    try {
      await ensureAssetDirs(path);
      const assets = await readAllAssets(path);
      useAssets.getState().replaceAll(assets);
    } catch (err) {
      console.warn("[wonder] asset load failed:", err);
      useAssets.getState().clear();
    }

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

// ---------------------------------------------------------------------------
// First-run initialization
//
// Writes an empty Wonder project into `path` so subsequent loads see the
// same structure they'd see on any other project. Used when the user runs
// "Open Project…" on a folder that isn't a Wonder workspace yet — instead
// of dead-ending them with an error, we scaffold the folder in place.
//
// Empty folder → init silently (they just picked it in the dialog, another
// confirm is friction). Non-empty folder → confirm, because dropping
// wonder.json / components/ / design/ into a directory with other files
// without warning is surprising.
//
// The resulting project is *empty* (no seed components) — opening a folder
// is about claiming it as a workspace, not importing the in-memory demo.
// Users who want to dump their current in-memory doc somewhere should use
// Save As, which takes the current components along for the ride.
// ---------------------------------------------------------------------------

async function initializeFolderAsProject(path: string): Promise<boolean> {
  const name = basename(path) || "Untitled";
  const isEmpty = await folderIsEmpty(path);

  if (!isEmpty) {
    const ok = await ask(
      `"${name}" isn't a Wonder project yet.\n\n` +
        `Initialize it here? This will add:\n` +
        `  • wonder.json (project manifest)\n` +
        `  • components/ (your .tsx files)\n` +
        `  • design/tokens.json + tokens.css\n` +
        `  • .wonder/ (runtime data)\n\n` +
        `Existing files in the folder are left alone.`,
      {
        title: "Initialize Wonder project?",
        kind: "info",
        okLabel: "Initialize",
        cancelLabel: "Cancel",
      },
    );
    if (!ok) return false;
  }

  try {
    const createdAt = new Date().toISOString();
    await writeProjectFolder({
      path,
      name,
      createdAt,
      components: {},
      order: [],
      propValues: {},
      declaredFolders: [],
      canvas: { zoom: 1, pan: { x: 0, y: 0 } },
      selection: {
        componentId: null,
        elementPath: null,
        openTabs: [],
        activeTab: null,
      },
      tokens: defaultTokens(),
    });
    return true;
  } catch (err) {
    await showError(
      "Could not initialize",
      `Failed to write project scaffolding into "${name}": ` +
        (err instanceof Error ? err.message : String(err)),
    );
    return false;
  }
}
