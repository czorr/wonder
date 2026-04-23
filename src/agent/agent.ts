import { streamText, stepCountIs, type LanguageModel, type ModelMessage } from "ai";
import type { Message } from "@/chat/types";
import type { AgentEvent } from "./types";
import type { ToolRegistry } from "./tools/registry";
import { DEFAULT_MAX_STEPS, DEFAULT_TEMPERATURE } from "./config";

// ---------------------------------------------------------------------------
// Agent.
//
// A thin object-oriented wrapper around `streamText`. The job of this class
// is to:
//   1. Hold the model + tools + system prompt for a conversation.
//   2. Normalize the SDK's `fullStream` into the UI-facing `AgentEvent`
//      union (see ./types.ts). The store never imports from `ai`.
//   3. Expose `run(messages, {signal})` as an async iterable so the chat
//      store can consume events with a plain `for await`.
//
// Skills (future) will be composed outside of here: callers pass in a
// merged `tools` registry and a system prompt that's been extended with
// the skill's addendum. The Agent itself stays skill-agnostic.
// ---------------------------------------------------------------------------

export type AgentOptions = {
  model: LanguageModel;
  tools: ToolRegistry;
  system: string;
  /** Max tool-calling steps per turn. Defaults to {@link DEFAULT_MAX_STEPS}. */
  maxSteps?: number;
  /** Model temperature. Defaults to {@link DEFAULT_TEMPERATURE}. */
  temperature?: number;
};

export class Agent {
  private readonly model: LanguageModel;
  private readonly tools: ToolRegistry;
  private readonly system: string;
  private readonly maxSteps: number;
  private readonly temperature: number;

  constructor(opts: AgentOptions) {
    this.model = opts.model;
    this.tools = opts.tools;
    this.system = opts.system;
    this.maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
    this.temperature = opts.temperature ?? DEFAULT_TEMPERATURE;
  }

  /**
   * Run one turn against the provided transcript. Yields `AgentEvent`s as
   * the model streams text and calls tools. The iterator ends with either
   * a `done` or `error` event — callers don't need to track a separate
   * terminal flag.
   */
  async *run(
    messages: Message[],
    { signal }: { signal?: AbortSignal } = {},
  ): AsyncIterable<AgentEvent> {
    const modelMessages = toModelMessages(messages);

    let result;
    try {
      result = streamText({
        model: this.model,
        system: this.system,
        messages: modelMessages,
        tools: this.tools,
        stopWhen: stepCountIs(this.maxSteps),
        temperature: this.temperature,
        abortSignal: signal,
      });
    } catch (err) {
      yield { type: "error", message: errMsg(err) };
      return;
    }

    try {
      for await (const part of result.fullStream) {
        if (signal?.aborted) break;

        switch (part.type) {
          case "text-delta":
            if (part.text) yield { type: "text", delta: part.text };
            break;

          case "tool-call":
            yield {
              type: "tool_call",
              id: part.toolCallId,
              name: part.toolName,
              args: (part.input ?? {}) as Record<string, unknown>,
            };
            break;

          case "tool-result":
            yield {
              type: "tool_result",
              id: part.toolCallId,
              name: part.toolName,
              output: part.output,
            };
            break;

          case "tool-error":
            yield {
              type: "tool_error",
              id: part.toolCallId,
              name: part.toolName,
              error: errMsg(part.error),
            };
            break;

          case "error":
            yield { type: "error", message: errMsg(part.error) };
            return;

          case "abort":
            yield { type: "done", reason: "other" };
            return;

          case "finish":
            yield { type: "done", reason: mapFinishReason(part.finishReason) };
            return;

          // Everything else (text-start/end, reasoning-*, tool-input-*,
          // start/start-step/finish-step, source, file, raw) is either
          // bookkeeping or not part of the UI protocol. Drop silently.
          default:
            break;
        }
      }
    } catch (err) {
      if (signal?.aborted) {
        yield { type: "done", reason: "other" };
        return;
      }
      yield { type: "error", message: errMsg(err) };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert our persisted transcript into `ModelMessage[]`. We only forward
 * user and assistant text — tool calls/results from prior turns aren't
 * replayed because the system prompt includes a fresh project snapshot on
 * every turn, which is a more reliable source of truth than stale tool
 * outputs.
 */
function toModelMessages(messages: Message[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role === "user" && m.content) {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant" && m.content) {
      out.push({ role: "assistant", content: m.content });
    }
    // system messages are handled via `options.system`; tool messages are
    // ephemeral in-turn state and intentionally dropped.
  }
  return out;
}

function mapFinishReason(
  r: string | undefined,
): "stop" | "tool-calls" | "length" | "content-filter" | "error" | "other" {
  switch (r) {
    case "stop":
    case "tool-calls":
    case "length":
    case "content-filter":
    case "error":
      return r;
    default:
      return "other";
  }
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
