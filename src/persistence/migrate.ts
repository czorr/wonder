import { PROJECT_FILE_VERSION, type ProjectFile } from "./types";

// ---------------------------------------------------------------------------
// Schema migration
//
// Single entry point — `migrateProjectFile(raw)` — that accepts any previous
// wonder.json shape and returns a value conforming to the CURRENT schema.
// Also reports the on-disk version so the caller can prompt for confirmation
// before committing to disk (the "Xcode-style" upgrade flow).
//
// Supported versions:
//   - v1: design config embedded in wonder.json via `tailwindConfig`
//   - v2: design config moved to `design/tokens.json` (see src/project/tokens.ts)
//
// Older ("v0") wonder.json files — the unversioned drafts from earliest
// development — were never shipped to any user, so we don't carry that
// path. If one shows up (version absent or 0), we treat it as v1 with
// best-effort defaults.
// ---------------------------------------------------------------------------

export type MigrateResult = {
  /** Always conforms to the CURRENT schema, regardless of on-disk version. */
  meta: ProjectFile;
  /** The version number as read from disk — lets callers detect upgrades. */
  fromVersion: number;
};

export function migrateProjectFile(raw: unknown): MigrateResult {
  if (!raw || typeof raw !== "object") {
    throw new ProjectFileError(
      "wonder.json is not a valid object",
      "invalid-shape",
    );
  }
  const obj = raw as Partial<ProjectFile> & { tailwindConfig?: unknown };
  const version = typeof obj.version === "number" ? obj.version : 1;

  if (version > PROJECT_FILE_VERSION) {
    throw new ProjectFileError(
      `This project was saved by a newer version of Wonder (v${version}). ` +
        `Please update Wonder to open it.`,
      "version-too-new",
    );
  }

  // v1 → v2: strip `tailwindConfig` (now lives in design/tokens.json) and
  // rebadge the version. Everything else is structurally unchanged, so the
  // migration is a single-field delete — no data loss.
  let migrated = obj;
  if (version < 2) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tailwindConfig: _drop, ...rest } = obj;
    migrated = { ...rest, version: 2 };
  }

  return {
    meta: assertCurrentShape(migrated),
    fromVersion: version,
  };
}

/**
 * Validate that the migrated object satisfies the current schema. Missing
 * required fields throw (rather than defaulting silently) because a
 * corrupted/truncated file is worse than an explicit failure the user can
 * act on — restore from backup, edit by hand, etc.
 */
function assertCurrentShape(obj: Partial<ProjectFile>): ProjectFile {
  const req = <T>(cond: T | undefined | null, field: string): T => {
    if (cond == null) {
      throw new ProjectFileError(
        `wonder.json missing required field: ${field}`,
        "invalid-shape",
      );
    }
    return cond;
  };
  return {
    $schema: obj.$schema,
    version: PROJECT_FILE_VERSION,
    name: req(obj.name, "name"),
    createdAt: obj.createdAt ?? new Date().toISOString(),
    updatedAt: obj.updatedAt ?? new Date().toISOString(),
    canvas: {
      zoom: obj.canvas?.zoom ?? 1,
      pan: obj.canvas?.pan ?? { x: 0, y: 0 },
    },
    selection: {
      componentId: obj.selection?.componentId ?? null,
      elementPath: obj.selection?.elementPath ?? null,
      openTabs: obj.selection?.openTabs ?? [],
      activeTab: obj.selection?.activeTab ?? null,
    },
    components: req(obj.components, "components"),
    propValues: obj.propValues ?? {},
  };
}

export type ProjectFileErrorKind =
  | "invalid-shape"
  | "version-too-new"
  | "unknown-version"
  | "missing-source-file"
  | "read-failed"
  | "write-failed";

export class ProjectFileError extends Error {
  kind: ProjectFileErrorKind;
  constructor(message: string, kind: ProjectFileErrorKind) {
    super(message);
    this.name = "ProjectFileError";
    this.kind = kind;
  }
}
