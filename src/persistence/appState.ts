import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import {
  APP_STATE_VERSION,
  MAX_RECENT_PROJECTS,
  type AppState,
  type RecentProject,
} from "./types";

// All paths are relative to $APPDATA (Tauri resolves this to the per-OS
// standard: ~/Library/Application Support/com.wonder.app on macOS, etc.)
const APP_STATE_FILE = "app.json";

const DEFAULT_STATE: AppState = {
  version: APP_STATE_VERSION,
  recentProjects: [],
  lastOpenedPath: null,
};

let memo: AppState | null = null;

/**
 * Read the app state from $APPDATA/app.json. Returns the default state on
 * first launch or if the file is missing / corrupt (we don't want a bad
 * preferences file to brick the app).
 */
export async function loadAppState(): Promise<AppState> {
  if (memo) return memo;
  try {
    if (!(await exists(APP_STATE_FILE, { baseDir: BaseDirectory.AppData }))) {
      memo = { ...DEFAULT_STATE };
      return memo;
    }
    const raw = await readTextFile(APP_STATE_FILE, { baseDir: BaseDirectory.AppData });
    const parsed = JSON.parse(raw) as Partial<AppState>;
    memo = {
      version: APP_STATE_VERSION,
      recentProjects: Array.isArray(parsed.recentProjects)
        ? parsed.recentProjects.filter(isValidRecent).slice(0, MAX_RECENT_PROJECTS)
        : [],
      lastOpenedPath:
        typeof parsed.lastOpenedPath === "string" ? parsed.lastOpenedPath : null,
    };
    return memo;
  } catch (err) {
    console.warn("[wonder] Could not load app state, using defaults:", err);
    memo = { ...DEFAULT_STATE };
    return memo;
  }
}

async function saveAppState(next: AppState): Promise<void> {
  memo = next;
  try {
    // Ensure $APPDATA exists (first launch).
    try {
      await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
    } catch {
      // fine — already exists
    }
    await writeTextFile(APP_STATE_FILE, JSON.stringify(next, null, 2) + "\n", {
      baseDir: BaseDirectory.AppData,
    });
  } catch (err) {
    console.warn("[wonder] Could not save app state:", err);
  }
}

export async function patchAppState(patch: Partial<AppState>): Promise<AppState> {
  const current = await loadAppState();
  const next: AppState = { ...current, ...patch };
  await saveAppState(next);
  return next;
}

/**
 * Add (or bump to top) a recent project entry. Older duplicate entries for
 * the same path are removed. Trims to MAX_RECENT_PROJECTS.
 */
export async function addRecentProject(entry: Omit<RecentProject, "openedAt">) {
  const state = await loadAppState();
  const now = new Date().toISOString();
  const filtered = state.recentProjects.filter((r) => r.path !== entry.path);
  const recent: RecentProject = { ...entry, openedAt: now };
  const recentProjects = [recent, ...filtered].slice(0, MAX_RECENT_PROJECTS);
  return patchAppState({
    recentProjects,
    lastOpenedPath: entry.path,
  });
}

/** Remove an entry from the recents list — used when an open fails. */
export async function removeRecentProject(path: string) {
  const state = await loadAppState();
  const recentProjects = state.recentProjects.filter((r) => r.path !== path);
  const lastOpenedPath =
    state.lastOpenedPath === path ? null : state.lastOpenedPath;
  return patchAppState({ recentProjects, lastOpenedPath });
}

function isValidRecent(r: unknown): r is RecentProject {
  if (!r || typeof r !== "object") return false;
  const x = r as Partial<RecentProject>;
  return (
    typeof x.path === "string" &&
    typeof x.name === "string" &&
    typeof x.openedAt === "string"
  );
}
