import type { ToolSet } from "ai";

// ---------------------------------------------------------------------------
// Tool registry.
//
// A ToolRegistry is just a `ToolSet` (ai SDK's `Record<string, Tool>`) plus a
// tiny wrapper so the rest of the codebase never has to import `ai` types
// for composition. Skills will stack toolsets by calling `merge(a, b, …)`.
// ---------------------------------------------------------------------------

export type ToolRegistry = ToolSet;

/**
 * Combine multiple toolsets. Later entries override earlier ones on name
 * collision — useful for skills that want to specialize a default tool
 * (e.g. a "design system" skill overriding `create_component` to also tag
 * the component in a registry).
 */
export function mergeTools(...toolsets: ToolRegistry[]): ToolRegistry {
  return Object.assign({}, ...toolsets);
}
