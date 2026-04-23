import type { WonderComponent } from "@/store/project";
import {
  PROJECT_FILE_VERSION,
  type ProjectFile,
  type ProjectFileComponent,
} from "./types";

/**
 * Build the on-disk `wonder.json` shape from the current in-memory store.
 *
 * The `source` of each component is stripped — it lives in the actual .tsx
 * file on disk, written separately by writeProjectFolder(). Keeping source
 * out of wonder.json makes per-component diffs clean in Git.
 */
export function serializeMeta(args: {
  name: string;
  createdAt: string;
  components: Record<string, WonderComponent>;
  order: string[];
  propValues: Record<string, Record<string, string>>;
  declaredFolders: string[];
  canvas: { zoom: number; pan: { x: number; y: number } };
  selection: {
    componentId: string | null;
    elementPath: string | null;
    openTabs: string[];
    activeTab: string | null;
  };
}): ProjectFile {
  const componentsArr: ProjectFileComponent[] = [];
  for (const id of args.order) {
    const c = args.components[id];
    if (!c) continue;
    componentsArr.push({
      id: c.id,
      name: c.name,
      folder: c.folder,
      filename: c.filename,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
    });
  }
  return {
    $schema: "https://wonder.dev/schemas/v2.json",
    version: PROJECT_FILE_VERSION,
    name: args.name,
    createdAt: args.createdAt,
    updatedAt: new Date().toISOString(),
    canvas: args.canvas,
    selection: args.selection,
    components: componentsArr,
    propValues: args.propValues,
    declaredFolders: args.declaredFolders,
  };
}

/**
 * Rehydrate store-shaped component records by merging meta entries with
 * their on-disk sources, which the caller has already read from the
 * `components/` subtree.
 */
export function hydrateComponents(
  meta: ProjectFile,
  sources: Record<string, string>,
): { components: Record<string, WonderComponent>; order: string[] } {
  const components: Record<string, WonderComponent> = {};
  const order: string[] = [];
  for (const entry of meta.components) {
    const source = sources[entry.id];
    if (source == null) {
      // Surface later — the caller decides whether to tolerate or throw.
      continue;
    }
    components[entry.id] = {
      id: entry.id,
      name: entry.name,
      folder: entry.folder,
      filename: entry.filename,
      source,
      x: entry.x,
      y: entry.y,
      width: entry.width,
      height: entry.height,
    };
    order.push(entry.id);
  }
  return { components, order };
}

/**
 * Relative path (from the project root) where a given component's .tsx file lives.
 * Folder can be empty (top-level) or nested like "dashboard" or "ui/forms".
 */
export function componentFilePath(
  c: Pick<ProjectFileComponent, "folder" | "filename">,
): string {
  const parts = ["components"];
  if (c.folder) parts.push(c.folder);
  parts.push(c.filename);
  return parts.join("/");
}
