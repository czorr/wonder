// ---------------------------------------------------------------------------
// Autosave.
//
// Subscribes to the project store and — whenever the project is dirty and has
// a path on disk — schedules a debounced save. The debounce resets on every
// mutation, so rapid edits (dragging a color picker, typing in an input)
// collapse into one write after the user pauses.
//
// Invariants:
//   - Never saves a project with `path === null` (untitled / launcher state).
//     Autosave is for projects already anchored to disk. Save As is the
//     only path to anchor one.
//   - Silent failures. A broken Tauri bridge or disk-full error would fire
//     on every debounce window and drown the user in dialogs — instead we
//     log and keep `dirty=true` so explicit ⌘S can retry with a visible
//     error. `lastAutosaveError` is exposed for a future status-bar pill.
//   - Never overlaps with an in-flight save. If a save is running when the
//     next tick fires, we skip this window; the next mutation re-arms the
//     timer.
//   - Does not mark history — we hook in BELOW the store's undo stack, so
//     autosave doesn't create undo entries.
//
// Cost budget:
//   A save writes every component .tsx + tokens.json + tokens.css +
//   wonder.json. Practical projects are tens of files, all parallelized.
//   Real measured cost is <50ms on SSD. The 1500ms debounce is about
//   perceived liveness, not cost.
// ---------------------------------------------------------------------------

import { useProject } from "@/store/project";
import { useCanvas } from "@/store/canvas";
import { writeProjectFolder, pruneOrphans } from "./fs";
import { addRecentProject } from "./appState";

/** How long after the last mutation we wait before writing. Long enough to
 *  coalesce a scrub/drag gesture; short enough that users feel saved. */
const DEBOUNCE_MS = 1500;

let timer: ReturnType<typeof setTimeout> | null = null;
let saving = false;
let stopped = false;

/** Last autosave error, if any. Consumers (status bar) can poll this to
 *  surface a pill when saves start silently failing. Cleared on success. */
export let lastAutosaveError: string | null = null;

/**
 * Subscribe the autosave loop to the project store. Returns an unsubscribe
 * function — call it from Shell's cleanup so HMR doesn't leak listeners.
 *
 * Idempotent-ish: calling init twice stacks subscribers, which is harmless
 * (they'd both debounce to the same save) but leaks memory. Shell's
 * useEffect should ensure one call per mount.
 */
export function initAutosave(): () => void {
  stopped = false;

  const unsub = useProject.subscribe((state, prev) => {
    if (stopped) return;

    // Only react when `dirty` flipped on OR mutations keep happening while
    // dirty. Reacting to every store change is wasteful — the only thing
    // that can trigger a save is new unsaved work, which by definition
    // flips or preserves `dirty=true`.
    const dirty = state.projectMeta.dirty;
    if (!dirty) return;

    const path = state.projectMeta.path;
    if (!path) return;

    // Skip while the store is reloading (opening a different project).
    // The loading flag is flipped in loadProjectFromPath; we don't want
    // to clobber the in-flight load with a half-written snapshot.
    if (state.projectMeta.loading) return;

    // Skip no-op ticks. The store publishes updates for non-content
    // changes (selection, openTabs) that don't mutate `dirty`. Only
    // re-arm the timer when `dirty` actually changed, or when a content
    // snapshot changed. The cheap proxy: did components/order/tokens/
    // propValues change? The store triggers subscribers on reference
    // changes, so reference equality is enough.
    const contentChanged =
      !prev ||
      prev.components !== state.components ||
      prev.order !== state.order ||
      prev.tokens !== state.tokens ||
      prev.propValues !== state.propValues ||
      prev.declaredFolders !== state.declaredFolders ||
      prev.projectMeta.dirty !== state.projectMeta.dirty;
    if (!contentChanged) return;

    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (stopped) return;
      void flushAutosave();
    }, DEBOUNCE_MS);
  });

  return () => {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    unsub();
  };
}

/**
 * Force an autosave-style flush immediately (ignoring debounce). Used by:
 *   - `beforeunload` → last-ditch persist before the window closes.
 *   - Future: explicit "Save" action could delegate here when `path` is set
 *     to share a single codepath with autosave.
 *
 * Still silent on error — caller gets a boolean.
 */
export async function flushAutosave(): Promise<boolean> {
  if (saving) return false;
  const store = useProject.getState();
  const { path, name, dirty, loading } = store.projectMeta;
  if (!dirty || !path || loading) return false;

  saving = true;
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
    await pruneOrphans({
      path,
      components: store.components,
      order: store.order,
    });
    // Mark clean only if the document hasn't mutated while we were writing.
    // If it has, leave `dirty=true` so the next debounce picks up the tail.
    const now = useProject.getState();
    const sameSnapshot =
      now.components === store.components &&
      now.order === store.order &&
      now.tokens === store.tokens &&
      now.propValues === store.propValues;
    if (sameSnapshot) {
      useProject.getState().markClean({ path, name });
    }
    await addRecentProject({ path, name });
    lastAutosaveError = null;
    return true;
  } catch (err) {
    lastAutosaveError = err instanceof Error ? err.message : String(err);
    // Console is the diagnostic surface. We deliberately don't show a
    // dialog — autosave failures shouldn't interrupt the flow. Manual ⌘S
    // still surfaces errors the old way (with a dialog).
    console.warn("[wonder] autosave failed:", err);
    return false;
  } finally {
    saving = false;
  }
}
