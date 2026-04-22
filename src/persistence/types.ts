// Schema versioning — bump when the shape of wonder.json changes in a way that
// older Wonder builds cannot read. Add a matching migration in ./migrate.ts.
export const PROJECT_FILE_VERSION = 1;

/**
 * The on-disk shape of `wonder.json`.
 *
 * IMPORTANT: component `source` is NOT stored here. Sources live in the
 * actual .tsx files inside the `components/` subfolder. This file only
 * tracks metadata, ids, positions, and selection state.
 */
export type ProjectFile = {
  $schema?: string;
  version: number;
  name: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  canvas: {
    zoom: number;
    pan: { x: number; y: number };
  };
  selection: {
    componentId: string | null;
    elementPath: string | null;
    openTabs: string[];
    activeTab: string | null;
  };
  components: ProjectFileComponent[];
  propValues: Record<string, Record<string, string>>;
  tailwindConfig: string | null;
};

export type ProjectFileComponent = {
  id: string;
  name: string;
  /** Subfolder path relative to `components/`. Empty string = top-level. */
  folder: string;
  /** File name within the folder, e.g. "StatTile.tsx". */
  filename: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * In-memory representation after reading a folder from disk.
 * Source is pulled from the .tsx files; everything else from wonder.json.
 */
export type LoadedProject = {
  path: string;           // absolute folder path
  meta: ProjectFile;
  /** id → raw source of the component's .tsx file. */
  sources: Record<string, string>;
};

/**
 * App-level state persisted across sessions in $APPDATA/app.json.
 * Project-specific state lives in the project folder itself, not here.
 */
export const APP_STATE_VERSION = 1;

export type AppState = {
  version: number;
  recentProjects: RecentProject[];
  lastOpenedPath: string | null;
};

export type RecentProject = {
  path: string;       // absolute folder path
  name: string;       // project display name at last open
  openedAt: string;   // ISO
};

export const MAX_RECENT_PROJECTS = 10;
