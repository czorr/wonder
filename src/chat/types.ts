import type { ProviderId } from "@/agent/models";

// ---------------------------------------------------------------------------
// Chat transcript types.
//
// Pure persistence shapes: what goes into `<project>/.wonder/chats.json`
// and what the UI renders. Provider wiring, model catalog, and streaming
// event protocol all live under `@/agent` now — this module is only
// concerned with the conversation log.
// ---------------------------------------------------------------------------

export type ModelId = string;

export type Role = "system" | "user" | "assistant" | "tool";

/**
 * One tool invocation the assistant made during a turn. We keep these
 * attached to the assistant message (not sent back to the model on the
 * next turn — the project context is refreshed instead) so the UI can
 * render a "tool call chip" inline.
 */
export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: {
    ok: boolean;
    data?: unknown;
    error?: string;
  };
};

export type Message = {
  id: string;
  role: Role;
  /** Plain-text content. Assistant messages stream into this field. */
  content: string;
  /** Populated for assistant turns that invoked tools. */
  toolCalls?: ToolCall[];
  /** For role="tool": the id of the ToolCall this result pairs with. */
  toolCallId?: string;
  createdAt: number;
};

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type Session = {
  id: string;
  /** Auto-populated from the first user message. */
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  /** The model this session is currently pinned to. */
  model: ModelId;
  /** Which provider owns `model`. */
  provider: ProviderId;
};

// ---------------------------------------------------------------------------
// Persisted chat file (per-project)
// ---------------------------------------------------------------------------

export const CHAT_FILE_VERSION = 1;

export type ChatFile = {
  version: number;
  sessions: Session[];
  activeSessionId: string | null;
};
