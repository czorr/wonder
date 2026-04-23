import { useProject } from "@/store/project";

// ---------------------------------------------------------------------------
// Project context.
//
// Before each turn we snapshot a compact view of the project and fold it
// into the system prompt. The idea: give the model enough to reference
// components by name without forcing it to call `list_components` on every
// turn, but cheap enough that long chats don't explode token count.
//
// Only component-level metadata (id, name, folder, frame) + the selected
// component's full source. Other sources must be fetched via `read_component`.
// ---------------------------------------------------------------------------

export type ProjectContext = {
  projectName: string;
  componentCount: number;
  /** One line per component with id/name/folder and a frame summary. */
  manifest: string[];
  /** Full .tsx of the selected component, if any. */
  selectedId: string | null;
  selectedName: string | null;
  selectedSource: string | null;
  selectedElementPath: string | null;
};

export function buildProjectContext(): ProjectContext {
  const {
    components,
    order,
    selectedComponentId,
    selectedElementPath,
    projectMeta,
  } = useProject.getState();

  const manifest = order.map((id) => {
    const c = components[id];
    return `- ${id}  (${c.folder}/${c.filename}, ${c.name})  frame=[${c.x},${c.y} ${c.width}×${c.height}]`;
  });

  const selected = selectedComponentId ? components[selectedComponentId] : null;

  return {
    projectName: projectMeta.name,
    componentCount: order.length,
    manifest,
    selectedId: selectedComponentId,
    selectedName: selected?.name ?? null,
    selectedSource: selected?.source ?? null,
    selectedElementPath: selectedElementPath,
  };
}
