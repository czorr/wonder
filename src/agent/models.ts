import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

// ---------------------------------------------------------------------------
// Model catalog + provider factory.
//
// This is the ONLY place that knows about specific providers + models. UI
// code imports `PROVIDERS` / `allModels()` to render pickers; the agent
// imports `resolveLanguageModel(modelId, apiKey)` to actually instantiate
// an `ai` SDK model.
//
// Adding a new provider: add an entry to PROVIDERS with `factory` returning
// a `LanguageModel` given an apiKey. Everything else in the app walks this
// map generically.
// ---------------------------------------------------------------------------

export type ProviderId = "openai" | "anthropic";

export type ModelConfig = {
  /** Exact string passed to `<provider>(id)` — this is the API model name. */
  id: string;
  /** Human-friendly name shown in the picker. */
  label: string;
  provider: ProviderId;
  /** Short tagline under the label in dropdowns. Optional. */
  description?: string;
};

type ProviderDef = {
  id: ProviderId;
  label: string;
  tagline?: string;
  /** "coming soon" providers show in Settings but can't be selected. */
  enabled: boolean;
  models: ModelConfig[];
  /**
   * Given an apiKey, produce a factory that takes a model id and returns an
   * `ai` SDK `LanguageModel`. Separating this from `models` lets us type-
   * check once at boot and reuse the factory across model switches.
   */
  factory: (apiKey: string) => (modelId: string) => LanguageModel;
};

const OPENAI_MODELS: ModelConfig[] = [
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    provider: "openai",
    description: "Fast and cheap. Good default for edits.",
  },
  {
    id: "gpt-5.3-codex",
    label: "GPT-5.3 Codex",
    provider: "openai",
    description: "Code-tuned. Use for multi-component work.",
  },
];

// Kept empty on purpose — the provider card is visible in Settings as
// "Coming soon". When we flip `enabled: true`, we just add model entries.
const ANTHROPIC_MODELS: ModelConfig[] = [];

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    tagline: "Chat Completions + streaming",
    enabled: true,
    models: OPENAI_MODELS,
    factory: (apiKey) => {
      const provider = createOpenAI({ apiKey });
      return (modelId: string) => provider(modelId);
    },
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    tagline: "Coming soon",
    enabled: false,
    models: ANTHROPIC_MODELS,
    factory: (apiKey) => {
      const provider = createAnthropic({ apiKey });
      return (modelId: string) => provider(modelId);
    },
  },
};

/** Flattened list of every model across enabled providers. */
export function allModels(): ModelConfig[] {
  return Object.values(PROVIDERS)
    .filter((p) => p.enabled)
    .flatMap((p) => p.models);
}

/** Which provider owns a given model id? Returns null if unknown. */
export function providerForModel(modelId: string): ProviderDef | null {
  for (const p of Object.values(PROVIDERS)) {
    if (p.models.some((m) => m.id === modelId)) return p;
  }
  return null;
}

/**
 * Build a LanguageModel instance for the agent.
 *
 * Throws if the model isn't registered or the provider is disabled — callers
 * should catch and surface this as a user-facing error (usually "pick a
 * different model" / "add an API key").
 */
export function resolveLanguageModel(
  modelId: string,
  apiKey: string,
): LanguageModel {
  const provider = providerForModel(modelId);
  if (!provider) {
    throw new Error(`Unknown model: ${modelId}`);
  }
  if (!provider.enabled) {
    throw new Error(`Provider ${provider.label} is not enabled yet.`);
  }
  return provider.factory(apiKey)(modelId);
}
