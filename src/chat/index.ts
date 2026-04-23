// ---------------------------------------------------------------------------
// Chat barrel.
//
// Transcript types + secrets storage. The AI provider/model catalog and
// streaming agent live under `@/agent`.
// ---------------------------------------------------------------------------

export * from "./types";
export { loadApiKey, saveApiKey, providersWithKey } from "./secrets";
