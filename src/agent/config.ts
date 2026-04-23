// ---------------------------------------------------------------------------
// Agent config.
//
// Knobs that we may want to expose in Settings later. Keeping them in one
// file (instead of magic numbers in `agent.ts`) so the eventual "advanced
// settings" pane has a single place to pull defaults from.
// ---------------------------------------------------------------------------

/**
 * Max tool-calling steps per user turn before the loop stops even if the
 * model wants to keep going. Guards against runaway behaviour.
 *
 * At 10, complex edits (create 3 components + update 2) comfortably fit,
 * but an agent caught in a "fix-retry" cycle bottoms out quickly.
 */
export const DEFAULT_MAX_STEPS = 10;

/**
 * Temperature for chat completions. Low-ish because most of what the agent
 * does is structured editing — we're not writing poetry.
 */
export const DEFAULT_TEMPERATURE = 0.2;
