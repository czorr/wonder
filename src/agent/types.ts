// ---------------------------------------------------------------------------
// Agent event protocol.
//
// The store + UI consume these. The concrete source is the Vercel AI SDK's
// `streamText` fullStream, but we normalize it through this union so the UI
// stays decoupled from SDK internals (and from the provider's wire format).
//
// Keeping the set narrow on purpose. We map SDK chunks down to what the UI
// actually cares about; everything else (reasoning, raw, step start/finish)
// is either ignored or folded into another event.
// ---------------------------------------------------------------------------

export type AgentEvent =
  /** Assistant text chunk (append to the current assistant message). */
  | { type: "text"; delta: string }

  /** Model decided to call a tool; args fully parsed. Emitted once per call. */
  | {
      type: "tool_call";
      id: string;
      name: string;
      args: Record<string, unknown>;
    }

  /** Tool's execute() returned successfully. */
  | {
      type: "tool_result";
      id: string;
      name: string;
      output: unknown;
    }

  /** Tool threw or the SDK couldn't parse the tool call. */
  | {
      type: "tool_error";
      id: string;
      name: string;
      error: string;
    }

  /** Terminal — the turn ended normally. */
  | { type: "done"; reason: "stop" | "tool-calls" | "length" | "content-filter" | "error" | "other" }

  /** Terminal — unrecoverable problem (network, 401, 429, abort). */
  | { type: "error"; message: string };
