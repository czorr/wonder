import { componentTools } from "./components";
import { selectionTools } from "./selection";
import { mergeTools, type ToolRegistry } from "./registry";

// ---------------------------------------------------------------------------
// Tool barrel.
//
// `defaultTools()` is the baseline set the agent always has. Skills layer on
// top via `mergeTools(defaultTools(), skill.tools)`.
// ---------------------------------------------------------------------------

export { componentTools, selectionTools, mergeTools };
export type { ToolRegistry };

export function defaultTools(): ToolRegistry {
  return mergeTools(componentTools, selectionTools);
}
