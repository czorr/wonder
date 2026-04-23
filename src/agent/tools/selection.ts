import { tool } from "ai";
import { z } from "zod";
import { useProject } from "@/store/project";
import { getClassNameAtPath } from "@/ast/tailwind";
import type { ToolRegistry } from "./registry";

// ---------------------------------------------------------------------------
// Selection tools.
//
// The canvas has a selected component + optionally a selected JSX element
// inside it. These tools let the agent read that focus and move it around —
// useful for "tweak the selected button" style prompts where the user's
// intent refers to whatever they clicked last.
// ---------------------------------------------------------------------------

const getSelected = tool({
  description:
    "Get the currently selected component (and element path inside it, if any). Returns null fields when nothing is selected. Use this at the start of a turn to resolve references like 'this' or 'the selected button'.",
  inputSchema: z.object({}),
  execute: async () => {
    const { selectedComponentId, selectedElementPath, components } =
      useProject.getState();
    if (!selectedComponentId) {
      return { componentId: null, elementPath: null };
    }
    const c = components[selectedComponentId];
    if (!c) {
      return { componentId: null, elementPath: null };
    }
    // If an element is selected, include its current Tailwind classes so the
    // model doesn't need a separate read_component call for small tweaks.
    let classes: string[] | undefined;
    if (selectedElementPath) {
      try {
        classes = getClassNameAtPath(c.source, selectedElementPath);
      } catch {
        classes = undefined;
      }
    }
    return {
      componentId: selectedComponentId,
      componentName: c.name,
      elementPath: selectedElementPath,
      classes,
    };
  },
});

const selectComponent = tool({
  description:
    "Select a component (and optionally an element path inside it). This moves the canvas focus — the user will see the selection update. Pass path='0' to select the root JSX element.",
  inputSchema: z.object({
    id: z.string().describe("Component id to select, or empty string to clear."),
    path: z
      .string()
      .optional()
      .describe("Dot-separated element path inside the component."),
  }),
  execute: async ({ id, path }) => {
    const state = useProject.getState();
    if (id === "") {
      state.selectComponent(null);
      return { ok: true, componentId: null };
    }
    if (!state.components[id]) {
      return { error: `Component '${id}' not found.` };
    }
    state.selectComponent(id);
    if (path !== undefined) {
      state.selectElement(path);
    }
    return { ok: true, componentId: id, elementPath: path ?? "0" };
  },
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const selectionTools: ToolRegistry = {
  get_selected: getSelected,
  select_component: selectComponent,
};
