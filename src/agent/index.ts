// ---------------------------------------------------------------------------
// Agent module barrel.
//
// The rest of the app imports from `@/agent`. Internals (tools/*, context,
// systemPrompt) are accessible via their own paths if needed, but the
// common entry points are here.
// ---------------------------------------------------------------------------

export { Agent, type AgentOptions } from "./agent";
export type { AgentEvent } from "./types";
export { defaultTools, mergeTools, type ToolRegistry } from "./tools";
export { buildProjectContext, type ProjectContext } from "./context";
export { buildSystemPrompt } from "./systemPrompt";
export {
  PROVIDERS,
  PROVIDER_ICON,
  allModels,
  providerForModel,
  resolveLanguageModel,
  type ModelConfig,
  type ProviderId,
} from "./models";
export { DEFAULT_MAX_STEPS, DEFAULT_TEMPERATURE } from "./config";
