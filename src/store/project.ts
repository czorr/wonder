import { create } from "zustand";
import { defaultTokens, tokensEqual, type Tokens } from "@/project/tokens";

export type ComponentId = string;

export type WonderComponent = {
  id: ComponentId;
  name: string;
  filename: string;
  folder: string;
  source: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

// A "document snapshot" is the subset of state that undo/redo reverts.
// Selection, open tabs, and active tab are UI state — we don't time-travel
// them because it's confusing (you'd lose your current focus for a typo fix).
//
// Tokens ARE in the snapshot: editing the design system is a meaningful
// document mutation, and "undo this color change" is a flow users expect.
type DocSnapshot = {
  components: Record<ComponentId, WonderComponent>;
  order: ComponentId[];
  propValues: Record<ComponentId, Record<string, string>>;
  tokens: Tokens;
  declaredFolders: string[];
};

// Kinds of mutations we push into history. Used for coalescing — a burst of
// setSource events from typing should collapse into one history entry.
type HistoryKind =
  | "setSource"
  | "moveFrame"
  | "resizeFrame"
  | "addComponent"
  | "deleteComponent"
  | "setPropValue"
  | "clearPropValue"
  | "setTokens"
  | "applyExtraction"
  | "setFolder"
  | "folders";

type HistoryEntry = { snapshot: DocSnapshot; kind: HistoryKind; at: number };

const MAX_HISTORY = 100;
// Coalesce successive same-kind commits within this window into a single
// history entry. Tuned to feel natural when typing continuously in Monaco.
const COALESCE_MS = 500;

// Project-level metadata: where the project lives on disk, its name, and
// whether there are unsaved changes. Separate from the "document" state
// (components etc.) so save/load flows don't accidentally touch the
// undo history.
export type ProjectMeta = {
  /** Absolute folder path. null = untitled (never saved). */
  path: string | null;
  /** Display name; reflected in the title bar. */
  name: string;
  /** ISO string captured when the project was first created. */
  createdAt: string;
  /** True when there are mutations since the last save or load. */
  dirty: boolean;
  /** Timestamp (ms) of the last successful save. */
  lastSavedAt: number | null;
  /** True while an async open is in flight — blocks duplicate opens. */
  loading: boolean;
};

type State = {
  components: Record<ComponentId, WonderComponent>;
  order: ComponentId[];
  selectedComponentId: ComponentId | null;
  selectedElementPath: string | null;
  openTabs: ComponentId[];
  activeTab: ComponentId | null;
  propValues: Record<ComponentId, Record<string, string>>;

  /**
   * Design system tokens. Persisted to `<project>/design/tokens.json`;
   * mirrored to `design/tokens.css` for Tailwind v4 `@theme` consumption.
   * Editable via `updateTokens` — goes through history so undo works.
   */
  tokens: Tokens;

  /**
   * Folders declared by the user that don't necessarily contain any
   * components yet. The sidebar file tree unions this with folders
   * derived from `components`, so an empty folder stays visible until
   * the user fills it or deletes it.
   *
   * Invariants: all entries are normalized (no leading/trailing slashes),
   * de-duplicated, and stored in insertion order. `primitives` never needs
   * to be declared here because it's auto-derived from promoted components.
   */
  declaredFolders: string[];

  // History
  past: HistoryEntry[];
  future: HistoryEntry[];

  // Project meta
  projectMeta: ProjectMeta;

  selectComponent: (id: ComponentId | null) => void;
  selectElement: (path: string | null) => void;
  setSource: (id: ComponentId, source: string) => void;
  moveFrame: (id: ComponentId, x: number, y: number) => void;
  resizeFrame: (id: ComponentId, x: number, y: number, w: number, h: number) => void;
  openTab: (id: ComponentId) => void;
  closeTab: (id: ComponentId) => void;
  setActiveTab: (id: ComponentId) => void;
  setPropValue: (id: ComponentId, name: string, value: string) => void;
  clearPropValue: (id: ComponentId, name: string) => void;
  addComponent: (c: Omit<WonderComponent, "id"> & { id?: ComponentId }) => ComponentId;
  deleteComponent: (id: ComponentId) => void;
  /**
   * Move a component to a different folder. Used by promote/demote-primitive
   * actions — changing folder from/to `primitives/*` reclassifies the component
   * in the primitives index the agent sees. No-ops when the folder is unchanged.
   */
  setComponentFolder: (id: ComponentId, folder: string) => void;

  /**
   * Create an empty folder. No-ops if a folder with the same name already
   * exists (either declared or derived from a component). Returns the
   * normalized name that was created (or the existing match).
   */
  createFolder: (name: string) => string;
  /**
   * Rename a folder. Updates every component whose `folder` matches, plus
   * the entry in `declaredFolders`. Silently no-ops on duplicate targets.
   */
  renameFolder: (oldName: string, newName: string) => void;
  /**
   * Delete a folder. Components inside it are moved to `moveTo` (defaults
   * to "components", the catch-all bucket) so nothing is lost.
   */
  deleteFolder: (name: string, moveTo?: string) => void;

  /**
   * Replace the design system tokens. Accepts either a full Tokens value or
   * an updater function — the latter is convenient for UI that needs to
   * patch a single field without rebuilding the whole object.
   *
   * No-ops (deep-equal result) skip the history push so idle UI reads
   * don't flood undo. Coalesced with `COALESCE_MS` so dragging a color
   * slider collapses into a single history entry.
   */
  updateTokens: (next: Tokens | ((prev: Tokens) => Tokens)) => void;

  /**
   * Atomically write new tokens + rewritten sources in a single history
   * entry. Used by the design-system extraction flow — undo rolls BOTH the
   * token edits and the class rewrites together, so the user never ends up
   * in a half-migrated state.
   */
  applyDesignSystemExtraction: (args: {
    tokens: Tokens;
    sources: Record<ComponentId, string>;
  }) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // --- Project lifecycle ---
  /** Reset to an empty untitled project. Clears history. */
  newProject: (opts?: { name?: string }) => void;
  /** Replace the document with a loaded project from disk. Clears history. */
  replaceProject: (payload: ReplaceProjectPayload) => void;
  /** Called after a successful write — flips dirty off and bumps lastSavedAt. */
  markClean: (opts?: { path?: string; name?: string }) => void;
  /** Update project path/name without touching document state (e.g. Save As). */
  setProjectPath: (path: string, name?: string) => void;
  /** Toggles the async loading flag; UI uses this to disable mutations. */
  setLoading: (loading: boolean) => void;
};

export type ReplaceProjectPayload = {
  path: string | null;
  name: string;
  createdAt: string;
  components: Record<ComponentId, WonderComponent>;
  order: ComponentId[];
  propValues: Record<ComponentId, Record<string, string>>;
  /** Design system from disk. Fall-back to defaults if omitted (e.g. brand-new
   *  project or a read that failed to parse tokens.json). */
  tokens?: Tokens;
  /** User-declared folders from disk (may include empty ones). Optional so
   *  older project files without this field still load cleanly. */
  declaredFolders?: string[];
  selection?: {
    componentId: ComponentId | null;
    elementPath: string | null;
    openTabs: ComponentId[];
    activeTab: ComponentId | null;
  };
};

function slugify(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function uniqueId(base: string, taken: Record<string, unknown>): string {
  const slug = slugify(base) || "component";
  if (!(slug in taken)) return slug;
  let i = 2;
  while (`${slug}-${i}` in taken) i++;
  return `${slug}-${i}`;
}

function uniqueName(base: string, components: Record<string, WonderComponent>): string {
  const names = new Set(Object.values(components).map((c) => c.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

function snapshotOf(s: State): DocSnapshot {
  return {
    components: s.components,
    order: s.order,
    propValues: s.propValues,
    tokens: s.tokens,
    declaredFolders: s.declaredFolders,
  };
}

/** Normalize a folder name: trim, strip leading/trailing slashes, collapse
 *  consecutive slashes. Empty string is preserved (it means "top level"). */
function normalizeFolderName(s: string): string {
  return s.trim().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

// The store boots into an "empty, no project" state — the shell's
// ProjectLauncher takes over until the user opens/creates a project,
// at which point `replaceProject` hydrates everything. This avoids
// ever rendering the editor against a fake in-memory document that
// can't be saved to disk in a meaningful way.

/**
 * Initial state for a brand-new untitled project (no components).
 * Used by `newProject()`.
 */
export function emptyProjectState(name = "Untitled"): {
  components: Record<ComponentId, WonderComponent>;
  order: ComponentId[];
  propValues: Record<ComponentId, Record<string, string>>;
  tokens: Tokens;
  declaredFolders: string[];
  meta: ProjectMeta;
  selection: {
    selectedComponentId: ComponentId | null;
    selectedElementPath: string | null;
    openTabs: ComponentId[];
    activeTab: ComponentId | null;
  };
} {
  return {
    components: {},
    order: [],
    propValues: {},
    tokens: defaultTokens(),
    declaredFolders: [],
    meta: {
      path: null,
      name,
      createdAt: new Date().toISOString(),
      dirty: false,
      lastSavedAt: null,
      loading: false,
    },
    selection: {
      selectedComponentId: null,
      selectedElementPath: null,
      openTabs: [],
      activeTab: null,
    },
  };
}

export const useProject = create<State>((set, get) => {
  // Push the CURRENT state onto the past stack before a mutation is applied.
  // Coalesces successive same-kind commits within COALESCE_MS (e.g. typing).
  // Clears the redo stack because a new branch of history began.
  // Also flips `dirty` on, because any content mutation means unsaved changes.
  const pushHistory = (kind: HistoryKind) => {
    const s = get();
    const now = Date.now();
    const top = s.past[s.past.length - 1];
    const shouldCoalesce =
      top && top.kind === kind && now - top.at < COALESCE_MS;
    let past = s.past;
    if (!shouldCoalesce) {
      past = [...past, { snapshot: snapshotOf(s), kind, at: now }];
      if (past.length > MAX_HISTORY) past = past.slice(past.length - MAX_HISTORY);
    } else {
      // Bump the timestamp so the coalesce window slides with continued typing,
      // but keep the original snapshot so undo rolls back the whole burst.
      past = past.slice(0, -1).concat([{ ...top, at: now }]);
    }
    const meta = s.projectMeta.dirty
      ? s.projectMeta
      : { ...s.projectMeta, dirty: true };
    set({ past, future: [], projectMeta: meta });
  };

  return {
    components: {},
    order: [],
    selectedComponentId: null,
    selectedElementPath: null,
    openTabs: [],
    activeTab: null,
    propValues: {},
    // Start with default tokens so the design surfaces render cleanly even
    // before a project is opened (e.g. the launcher).
    tokens: defaultTokens(),
    declaredFolders: [],
    past: [],
    future: [],
    projectMeta: {
      // Boot as "no project" — the shell shows ProjectLauncher until the
      // user picks or creates one. `path === null` is the signal.
      path: null,
      name: "",
      createdAt: new Date().toISOString(),
      dirty: false,
      lastSavedAt: null,
      loading: false,
    },

    selectComponent(id) {
      set((s) => ({
        selectedComponentId: id,
        selectedElementPath: id ? "0" : null,
        openTabs: id
          ? s.openTabs.includes(id)
            ? s.openTabs
            : [...s.openTabs, id]
          : s.openTabs,
        activeTab: id ?? s.activeTab,
      }));
    },
    selectElement(path) {
      set({ selectedElementPath: path });
    },
    setSource(id, source) {
      if (get().components[id]?.source === source) return;
      pushHistory("setSource");
      set((s) => ({
        components: {
          ...s.components,
          [id]: { ...s.components[id], source },
        },
      }));
    },
    moveFrame(id, x, y) {
      const c = get().components[id];
      if (!c || (c.x === x && c.y === y)) return;
      pushHistory("moveFrame");
      set((s) => ({
        components: {
          ...s.components,
          [id]: { ...s.components[id], x, y },
        },
      }));
    },
    resizeFrame(id, x, y, w, h) {
      const c = get().components[id];
      if (!c || (c.x === x && c.y === y && c.width === w && c.height === h)) return;
      pushHistory("resizeFrame");
      set((s) => ({
        components: {
          ...s.components,
          [id]: { ...s.components[id], x, y, width: w, height: h },
        },
      }));
    },
    openTab(id) {
      set((s) => ({
        openTabs: s.openTabs.includes(id) ? s.openTabs : [...s.openTabs, id],
        activeTab: id,
      }));
    },
    closeTab(id) {
      set((s) => {
        const tabs = s.openTabs.filter((t) => t !== id);
        return {
          openTabs: tabs,
          activeTab: s.activeTab === id ? (tabs[tabs.length - 1] ?? null) : s.activeTab,
        };
      });
    },
    setActiveTab(id) {
      set({ activeTab: id, selectedComponentId: id, selectedElementPath: "0" });
    },
    setPropValue(id, name, value) {
      if (get().propValues[id]?.[name] === value) return;
      pushHistory("setPropValue");
      set((s) => ({
        propValues: {
          ...s.propValues,
          [id]: { ...(s.propValues[id] ?? {}), [name]: value },
        },
      }));
    },
    clearPropValue(id, name) {
      if (get().propValues[id]?.[name] === undefined) return;
      pushHistory("clearPropValue");
      set((s) => {
        const cur = { ...(s.propValues[id] ?? {}) };
        delete cur[name];
        return { propValues: { ...s.propValues, [id]: cur } };
      });
    },
    addComponent(partial) {
      pushHistory("addComponent");
      let createdId: ComponentId = partial.id ?? "";
      set((s) => {
        const name = uniqueName(partial.name, s.components);
        const id = partial.id && !(partial.id in s.components)
          ? partial.id
          : uniqueId(name, s.components);
        createdId = id;
        const comp: WonderComponent = {
          id,
          name,
          filename: partial.filename || `${name}.tsx`,
          folder: partial.folder || "components",
          source: partial.source,
          x: partial.x,
          y: partial.y,
          width: partial.width,
          height: partial.height,
        };
        return {
          components: { ...s.components, [id]: comp },
          order: [...s.order, id],
          selectedComponentId: id,
          selectedElementPath: "0",
          openTabs: s.openTabs.includes(id) ? s.openTabs : [...s.openTabs, id],
          activeTab: id,
        };
      });
      return createdId;
    },
    deleteComponent(id) {
      if (!(id in get().components)) return;
      pushHistory("deleteComponent");
      set((s) => {
        const { [id]: _removed, ...rest } = s.components;
        const order = s.order.filter((x) => x !== id);
        const openTabs = s.openTabs.filter((x) => x !== id);
        const { [id]: _pv, ...propValues } = s.propValues;
        const selectedComponentId = s.selectedComponentId === id ? null : s.selectedComponentId;
        const activeTab = s.activeTab === id ? (openTabs[openTabs.length - 1] ?? null) : s.activeTab;
        return {
          components: rest,
          order,
          openTabs,
          propValues,
          selectedComponentId,
          selectedElementPath: selectedComponentId ? s.selectedElementPath : null,
          activeTab,
        };
      });
    },

    setComponentFolder(id, folder) {
      const c = get().components[id];
      if (!c) return;
      const normalized = normalizeFolderName(folder);
      if (c.folder === normalized) return;
      pushHistory("setFolder");
      set((s) => ({
        components: {
          ...s.components,
          [id]: { ...s.components[id], folder: normalized },
        },
        // Drop the target from declaredFolders once a real component lives
        // there — the union in the UI will still surface it, and we avoid
        // dead declared entries piling up in the manifest.
        declaredFolders: s.declaredFolders.filter((f) => f !== normalized),
      }));
    },

    createFolder(name) {
      const normalized = normalizeFolderName(name);
      if (!normalized) return "";
      const s = get();
      // Already present — as a declared entry OR backing a real component.
      const derived = new Set(
        Object.values(s.components).map((c) => c.folder),
      );
      if (s.declaredFolders.includes(normalized) || derived.has(normalized)) {
        return normalized;
      }
      pushHistory("folders");
      set({ declaredFolders: [...s.declaredFolders, normalized] });
      return normalized;
    },

    renameFolder(oldName, newName) {
      const from = normalizeFolderName(oldName);
      const to = normalizeFolderName(newName);
      if (!from || !to || from === to) return;
      const s = get();
      const targetExists =
        s.declaredFolders.includes(to) ||
        Object.values(s.components).some((c) => c.folder === to);
      if (targetExists) return; // avoid silent merges — UI should prevent this
      const touched = Object.values(s.components).some(
        (c) => c.folder === from,
      );
      const wasDeclared = s.declaredFolders.includes(from);
      if (!touched && !wasDeclared) return;
      pushHistory("folders");
      set((st) => ({
        components: Object.fromEntries(
          Object.entries(st.components).map(([id, c]) => [
            id,
            c.folder === from ? { ...c, folder: to } : c,
          ]),
        ),
        declaredFolders: st.declaredFolders.map((f) => (f === from ? to : f)),
      }));
    },

    deleteFolder(name, moveTo = "components") {
      const from = normalizeFolderName(name);
      const dest = normalizeFolderName(moveTo);
      if (!from || from === dest) {
        // Still allow removing a purely-declared folder that has no contents.
        const s = get();
        if (s.declaredFolders.includes(from)) {
          pushHistory("folders");
          set({
            declaredFolders: s.declaredFolders.filter((f) => f !== from),
          });
        }
        return;
      }
      const s = get();
      const touched = Object.values(s.components).some(
        (c) => c.folder === from,
      );
      const wasDeclared = s.declaredFolders.includes(from);
      if (!touched && !wasDeclared) return;
      pushHistory("folders");
      set((st) => ({
        components: Object.fromEntries(
          Object.entries(st.components).map(([id, c]) => [
            id,
            c.folder === from ? { ...c, folder: dest } : c,
          ]),
        ),
        declaredFolders: st.declaredFolders.filter((f) => f !== from),
      }));
    },

    updateTokens(next) {
      const current = get().tokens;
      const resolved = typeof next === "function" ? next(current) : next;
      if (tokensEqual(current, resolved)) return;
      pushHistory("setTokens");
      set({ tokens: resolved });
    },

    applyDesignSystemExtraction({ tokens, sources }) {
      const s = get();
      const tokensChanged = !tokensEqual(s.tokens, tokens);
      const changedIds = Object.keys(sources);
      if (!tokensChanged && changedIds.length === 0) return;

      // Single history entry — the snapshot captures the PRE-state, so undo
      // rolls tokens and every rewritten source back together. No coalescing
      // (the kind is rare and the user won't trigger it twice in 500ms).
      pushHistory("applyExtraction");

      const components = { ...s.components };
      for (const id of changedIds) {
        const c = components[id];
        if (!c) continue;
        components[id] = { ...c, source: sources[id] };
      }
      set({ components, tokens });
    },

    undo() {
      const s = get();
      if (s.past.length === 0) return;
      const top = s.past[s.past.length - 1];
      const current: HistoryEntry = {
        snapshot: snapshotOf(s),
        kind: top.kind,
        at: Date.now(),
      };
      const { components, order, propValues, tokens, declaredFolders } =
        top.snapshot;
      // If the currently selected component is being removed by the undo, drop selection.
      const selectedComponentId =
        s.selectedComponentId && components[s.selectedComponentId]
          ? s.selectedComponentId
          : null;
      const openTabs = s.openTabs.filter((id) => components[id]);
      const activeTab =
        s.activeTab && components[s.activeTab]
          ? s.activeTab
          : (openTabs[openTabs.length - 1] ?? null);
      set({
        components,
        order,
        propValues,
        tokens,
        declaredFolders,
        selectedComponentId,
        selectedElementPath: selectedComponentId ? s.selectedElementPath : null,
        openTabs,
        activeTab,
        past: s.past.slice(0, -1),
        future: [...s.future, current],
      });
    },

    redo() {
      const s = get();
      if (s.future.length === 0) return;
      const top = s.future[s.future.length - 1];
      const current: HistoryEntry = {
        snapshot: snapshotOf(s),
        kind: top.kind,
        at: Date.now(),
      };
      const { components, order, propValues, tokens, declaredFolders } =
        top.snapshot;
      const selectedComponentId =
        s.selectedComponentId && components[s.selectedComponentId]
          ? s.selectedComponentId
          : null;
      const openTabs = s.openTabs.filter((id) => components[id]);
      const activeTab =
        s.activeTab && components[s.activeTab]
          ? s.activeTab
          : (openTabs[openTabs.length - 1] ?? null);
      set({
        components,
        order,
        propValues,
        tokens,
        declaredFolders,
        selectedComponentId,
        selectedElementPath: selectedComponentId ? s.selectedElementPath : null,
        openTabs,
        activeTab,
        past: [...s.past, current],
        future: s.future.slice(0, -1),
      });
    },

    canUndo() {
      return get().past.length > 0;
    },
    canRedo() {
      return get().future.length > 0;
    },

    // ---------------------------------------------------------------------
    // Project lifecycle
    //
    // These operations REPLACE the document wholesale and therefore clear
    // undo history — time-travel across different projects would be
    // surprising and history entries would reference dead ids.
    // ---------------------------------------------------------------------

    newProject(opts) {
      const empty = emptyProjectState(opts?.name);
      set({
        components: empty.components,
        order: empty.order,
        propValues: empty.propValues,
        tokens: empty.tokens,
        declaredFolders: empty.declaredFolders,
        selectedComponentId: empty.selection.selectedComponentId,
        selectedElementPath: empty.selection.selectedElementPath,
        openTabs: empty.selection.openTabs,
        activeTab: empty.selection.activeTab,
        past: [],
        future: [],
        projectMeta: empty.meta,
      });
    },

    replaceProject(payload) {
      // Prefer the caller-provided selection (restored from wonder.json), but
      // fall back to selecting the first component so the user isn't staring
      // at a blank inspector.
      const firstId = payload.order[0] ?? null;
      const fallbackSelection = {
        selectedComponentId: firstId,
        selectedElementPath: firstId ? "0" : null,
        openTabs: firstId ? [firstId] : [],
        activeTab: firstId,
      };
      const sel = payload.selection
        ? {
            selectedComponentId: payload.selection.componentId,
            selectedElementPath: payload.selection.elementPath,
            openTabs: payload.selection.openTabs,
            activeTab: payload.selection.activeTab,
          }
        : fallbackSelection;
      set({
        components: payload.components,
        order: payload.order,
        propValues: payload.propValues,
        // Fall back to defaults when tokens weren't supplied — happens when
        // opening a v1 project whose design/tokens.json doesn't exist yet.
        tokens: payload.tokens ?? defaultTokens(),
        declaredFolders: payload.declaredFolders ?? [],
        selectedComponentId: sel.selectedComponentId,
        selectedElementPath: sel.selectedElementPath,
        openTabs: sel.openTabs,
        activeTab: sel.activeTab,
        past: [],
        future: [],
        projectMeta: {
          path: payload.path,
          name: payload.name,
          createdAt: payload.createdAt,
          dirty: false,
          lastSavedAt: payload.path ? Date.now() : null,
          loading: false,
        },
      });
    },

    markClean(opts) {
      set((s) => ({
        projectMeta: {
          ...s.projectMeta,
          path: opts?.path ?? s.projectMeta.path,
          name: opts?.name ?? s.projectMeta.name,
          dirty: false,
          lastSavedAt: Date.now(),
        },
      }));
    },

    setProjectPath(path, name) {
      set((s) => ({
        projectMeta: {
          ...s.projectMeta,
          path,
          name: name ?? s.projectMeta.name,
        },
      }));
    },

    setLoading(loading) {
      set((s) => ({ projectMeta: { ...s.projectMeta, loading } }));
    },
  };
});
