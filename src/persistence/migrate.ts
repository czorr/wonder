import { PROJECT_FILE_VERSION, type ProjectFile } from "./types";

/**
 * Upgrade a parsed wonder.json from any older schema version to the current one.
 *
 * Today we only have v1, so this is a passthrough; the function exists so that
 * (a) callers always route through it — no "just-in-case" parsing sprinkled
 * around the codebase — and (b) when v2 lands, a single file changes.
 *
 * Throws if the version is newer than what this build knows how to read.
 */
export function migrateProjectFile(raw: unknown): ProjectFile {
  if (!raw || typeof raw !== "object") {
    throw new ProjectFileError(
      "wonder.json is not a valid object",
      "invalid-shape",
    );
  }
  const obj = raw as Partial<ProjectFile>;
  const version = typeof obj.version === "number" ? obj.version : 0;

  if (version > PROJECT_FILE_VERSION) {
    throw new ProjectFileError(
      `This project was saved by a newer version of Wonder (v${version}). ` +
        `Please update Wonder to open it.`,
      "version-too-new",
    );
  }

  // Validate required fields for v1. Anything missing means the file is
  // corrupt or truncated — surface a clear error rather than booting with
  // a half-populated store.
  if (version === PROJECT_FILE_VERSION) {
    return assertV1Shape(obj);
  }

  // Future: if (version === 0) { return migrateV0toV1(obj); }

  throw new ProjectFileError(
    `Unknown wonder.json version: ${version}`,
    "unknown-version",
  );
}

function assertV1Shape(obj: Partial<ProjectFile>): ProjectFile {
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
    tailwindConfig: obj.tailwindConfig ?? null,
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
