import type { Tokens } from "@/project/tokens";

// Schema versioning — bump when the shape of wonder.json changes in a way
// that older Wonder builds cannot read. Add a matching migration in
// ./migrate.ts and a confirmation path in ./actions.ts.
//
// v1 → v2 (2026-04): design system moved out of `wonder.json` into a new
// `design/` folder (`tokens.json` authoritative + `tokens.css` generated).
// The `tailwindConfig: string | null` field is dropped; it was reserved
// but never had a consumer.
export const PROJECT_FILE_VERSION = 2;

/**
 * The on-disk shape of `wonder.json`.
 *
 * IMPORTANT:
 *   - Component `source` lives in the .tsx files under `components/`, not here.
 *     This file only tracks metadata, ids, positions, and selection.
 *   - Design system (colors, fonts, radii) lives in `design/tokens.json`,
 *     not here. See `src/project/tokens.ts`.
 *
 * Keeping this file slim makes it easier to reason about, and keeps
 * per-domain diffs clean in Git — a color change doesn't churn the
 * project manifest.
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
 *
 *   - `meta`    — parsed wonder.json (migrated to current schema)
 *   - `sources` — id → raw source of the corresponding .tsx
 *   - `tokens`  — parsed design/tokens.json (or defaults if file missing/invalid)
 *
 * `onDiskVersion` tells the caller whether the project was upgraded by the
 * read — actions.ts uses that to show an explicit upgrade prompt and to
 * trigger an auto-save afterward so the disk layout catches up.
 */
export type LoadedProject = {
  path: string;
  meta: ProjectFile;
  sources: Record<string, string>;
  tokens: Tokens;
  onDiskVersion: number;
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
  path: string; // absolute folder path
  name: string; // project display name at last open
  openedAt: string; // ISO
};

export const MAX_RECENT_PROJECTS = 10;
