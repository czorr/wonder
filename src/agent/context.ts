import { useProject } from "@/store/project";
import type { Tokens } from "@/project/tokens";
import {
  buildPrimitivesIndex,
  type PrimitiveDescriptor,
} from "@/project/primitives";

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

export type FocusedComponent = {
  id: string;
  name: string;
  /** Full .tsx source so the model can reason about the file without an
   *  extra `read_component` roundtrip. */
  source: string;
};

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
  /**
   * Components the user explicitly scoped this turn (via composer tags or
   * selection fallback). When non-empty, the system prompt tells the model
   * these are the ones it's allowed to touch — and inlines their source so
   * it doesn't have to read them first.
   */
  focused: FocusedComponent[];
  /**
   * Project design tokens (colors / fonts / radii). Rendered into the system
   * prompt as a list of Tailwind utilities the model should prefer over raw
   * palette classes — the whole point of the design system is that `bg-primary`
   * stays consistent across components and recolors centrally when the user
   * edits tokens.
   */
  tokens: Tokens;
  /**
   * Components under `components/primitives/*` — the project's pattern
   * library. The system prompt encourages the model to compose from these
   * (via `import { Foo } from "./primitives/foo"`) rather than rebuilding
   * their HTML inline when creating new components.
   */
  primitives: PrimitiveDescriptor[];
};

/**
 * Snapshot the project for the system prompt.
 *
 * @param focusedIds Component ids the user scoped this turn. Invalid ids are
 *   dropped silently. Pass `[]` (or omit) when there's no explicit scope;
 *   the prompt then falls back to a regular "here's the manifest, here's the
 *   selection" view.
 */
export function buildProjectContext(focusedIds: string[] = []): ProjectContext {
  const {
    components,
    order,
    selectedComponentId,
    selectedElementPath,
    projectMeta,
    tokens,
  } = useProject.getState();

  const manifest = order.map((id) => {
    const c = components[id];
    return `- ${id}  (${c.folder}/${c.filename}, ${c.name})  frame=[${c.x},${c.y} ${c.width}×${c.height}]`;
  });

  const selected = selectedComponentId ? components[selectedComponentId] : null;

  const focused: FocusedComponent[] = [];
  for (const id of focusedIds) {
    const c = components[id];
    if (!c) continue;
    focused.push({ id, name: c.name, source: c.source });
  }

  return {
    projectName: projectMeta.name,
    componentCount: order.length,
    manifest,
    selectedId: selectedComponentId,
    selectedName: selected?.name ?? null,
    selectedSource: selected?.source ?? null,
    selectedElementPath: selectedElementPath,
    focused,
    tokens,
    primitives: buildPrimitivesIndex(components, order),
  };
}
