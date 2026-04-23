import { tool } from "ai";
import { z } from "zod";
import { useProject } from "@/store/project";
import { useCanvas } from "@/store/canvas";
import {
  addClassesAtPath,
  removeClassesAtPath,
} from "@/ast/tailwind";
import type { ToolRegistry } from "./registry";

// ---------------------------------------------------------------------------
// Component tools.
//
// These are the agent's hands. Each tool dispatches to existing `useProject`
// actions, so:
//   - Undo/redo automatically covers any AI edit (pushHistory is called
//     inside setSource / addComponent / deleteComponent).
//   - The dirty flag flips on, so the user gets a "save?" prompt on close.
//   - The sandbox iframe re-renders because it subscribes to the same store.
//
// The tool surface is deliberately narrow:
//   list, read, create, update_source, update_classes, delete, move, resize.
//
// Design-system-level operations (extract palette, normalize spacing, etc.)
// belong in a skill — they're higher-order and will compose these primitives.
// ---------------------------------------------------------------------------

// Defaults for components the agent creates without explicit geometry.
const DEFAULT_FRAME = { x: 120, y: 120, width: 320, height: 200 };

// ---------------------------------------------------------------------------
// list_components
// ---------------------------------------------------------------------------

const listComponents = tool({
  description:
    "List every component currently in the project. Returns a compact tree with id, name, folder, filename, and geometry. Use this before editing so you know what exists.",
  inputSchema: z.object({}),
  execute: async () => {
    const { components, order, selectedComponentId } = useProject.getState();
    return {
      count: order.length,
      selectedId: selectedComponentId,
      components: order.map((id) => {
        const c = components[id];
        return {
          id,
          name: c.name,
          folder: c.folder,
          filename: c.filename,
          x: c.x,
          y: c.y,
          width: c.width,
          height: c.height,
        };
      }),
    };
  },
});

// ---------------------------------------------------------------------------
// read_component
// ---------------------------------------------------------------------------

const readComponent = tool({
  description:
    "Read the full .tsx source of a component by id. Call this before editing so you see the current code — never guess at the contents.",
  inputSchema: z.object({
    id: z.string().describe("Component id as returned by list_components"),
  }),
  execute: async ({ id }) => {
    const c = useProject.getState().components[id];
    if (!c) return { error: `Component '${id}' not found.` };
    return {
      id,
      name: c.name,
      filename: c.filename,
      folder: c.folder,
      source: c.source,
    };
  },
});

// ---------------------------------------------------------------------------
// create_component
// ---------------------------------------------------------------------------

const createComponent = tool({
  description:
    "Create a new React component and place it on the canvas. The `source` must be a complete .tsx file with a default-exported function component using Tailwind classes. Position defaults to near the current viewport if x/y omitted.",
  inputSchema: z.object({
    name: z
      .string()
      .describe("PascalCase component name (also used as the function name)."),
    source: z
      .string()
      .describe(
        "Complete .tsx source. Must include `export default function <Name>() { return (...); }`.",
      ),
    folder: z
      .string()
      .optional()
      .describe("Subfolder under components/. Defaults to 'components'."),
    x: z.number().optional().describe("Canvas x position (px)."),
    y: z.number().optional().describe("Canvas y position (px)."),
    width: z.number().optional().describe("Frame width (px). Defaults to 320."),
    height: z.number().optional().describe("Frame height (px). Defaults to 200."),
  }),
  execute: async ({ name, source, folder, x, y, width, height }) => {
    // If the model omitted a position, drop it near the current viewport
    // centre so it doesn't land off-screen.
    const { pan, zoom } = useCanvas.getState();
    const viewportX = Math.round(-pan.x / zoom) + 120;
    const viewportY = Math.round(-pan.y / zoom) + 120;

    const id = useProject.getState().addComponent({
      name,
      filename: `${name}.tsx`,
      folder: folder ?? "components",
      source,
      x: x ?? viewportX,
      y: y ?? viewportY,
      width: width ?? DEFAULT_FRAME.width,
      height: height ?? DEFAULT_FRAME.height,
    });
    return { ok: true, id };
  },
});

// ---------------------------------------------------------------------------
// update_component_source
// ---------------------------------------------------------------------------

const updateComponentSource = tool({
  description:
    "Replace the entire .tsx source of a component. Prefer `update_component_classes` for small Tailwind changes — this tool rewrites the whole file and is heavier to diff.",
  inputSchema: z.object({
    id: z.string().describe("Component id"),
    source: z.string().describe("New complete .tsx source."),
  }),
  execute: async ({ id, source }) => {
    const state = useProject.getState();
    if (!state.components[id]) {
      return { error: `Component '${id}' not found.` };
    }
    state.setSource(id, source);
    return { ok: true, id };
  },
});

// ---------------------------------------------------------------------------
// update_component_classes (AST-aware)
// ---------------------------------------------------------------------------

const updateComponentClasses = tool({
  description:
    "Edit the Tailwind classes on a specific JSX element inside a component, without rewriting the whole file. Use `path` to target the element (e.g. '0' = root, '0.1' = root's 2nd child). Can add new classes, remove exact matches, or remove classes matching a prefix (e.g. 'bg-' removes all background colors before adding a new one).",
  inputSchema: z.object({
    id: z.string().describe("Component id"),
    path: z
      .string()
      .describe(
        "Dot-separated element path. '0' = root JSX element, '0.1' = root's second child, etc.",
      ),
    addClasses: z
      .array(z.string())
      .optional()
      .describe("Classes to add. Duplicates are de-duplicated."),
    removeClasses: z
      .array(z.string())
      .optional()
      .describe("Exact class names to remove."),
    removePrefixes: z
      .array(z.string())
      .optional()
      .describe(
        "Remove any class starting with these prefixes (e.g. ['bg-', 'text-'] before adding a new color).",
      ),
  }),
  execute: async ({ id, path, addClasses, removeClasses, removePrefixes }) => {
    const state = useProject.getState();
    const c = state.components[id];
    if (!c) return { error: `Component '${id}' not found.` };

    let src = c.source;
    const toRemove = new Set(removeClasses ?? []);
    const prefixes = removePrefixes ?? [];
    if (toRemove.size > 0 || prefixes.length > 0) {
      src = removeClassesAtPath(src, path, (cls) => {
        if (toRemove.has(cls)) return true;
        return prefixes.some((p) => cls.startsWith(p));
      });
    }
    if (addClasses && addClasses.length > 0) {
      src = addClassesAtPath(src, path, addClasses);
    }
    if (src === c.source) {
      return { ok: true, id, changed: false };
    }
    state.setSource(id, src);
    return { ok: true, id, changed: true };
  },
});

// ---------------------------------------------------------------------------
// delete_component
// ---------------------------------------------------------------------------

const deleteComponent = tool({
  description:
    "Permanently delete a component from the project. Undoable via ⌘Z. Confirm with the user if they didn't explicitly ask for deletion.",
  inputSchema: z.object({
    id: z.string(),
  }),
  execute: async ({ id }) => {
    const state = useProject.getState();
    if (!state.components[id]) return { error: `Component '${id}' not found.` };
    state.deleteComponent(id);
    return { ok: true, id };
  },
});

// ---------------------------------------------------------------------------
// move_component / resize_component
// ---------------------------------------------------------------------------

const moveComponent = tool({
  description: "Move a component's frame to absolute canvas coordinates.",
  inputSchema: z.object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  execute: async ({ id, x, y }) => {
    const state = useProject.getState();
    const c = state.components[id];
    if (!c) return { error: `Component '${id}' not found.` };
    state.moveFrame(id, x, y);
    return { ok: true, id };
  },
});

const resizeComponent = tool({
  description: "Resize a component's frame (width/height in px).",
  inputSchema: z.object({
    id: z.string(),
    width: z.number(),
    height: z.number(),
  }),
  execute: async ({ id, width, height }) => {
    const state = useProject.getState();
    const c = state.components[id];
    if (!c) return { error: `Component '${id}' not found.` };
    state.resizeFrame(id, c.x, c.y, width, height);
    return { ok: true, id };
  },
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const componentTools: ToolRegistry = {
  list_components: listComponents,
  read_component: readComponent,
  create_component: createComponent,
  update_component_source: updateComponentSource,
  update_component_classes: updateComponentClasses,
  delete_component: deleteComponent,
  move_component: moveComponent,
  resize_component: resizeComponent,
};
