import { create } from "zustand";
import type { Message, ModelId, Session, ToolCall } from "@/chat/types";
import { loadApiKey } from "@/chat/secrets";
import {
  Agent,
  PROVIDERS,
  buildProjectContext,
  buildSystemPrompt,
  defaultTools,
  providerForModel,
  resolveLanguageModel,
  type AgentEvent,
  type ProviderId,
} from "@/agent";

// ---------------------------------------------------------------------------
// Chat store.
//
// Holds:
//   - a list of chat sessions (each with its own transcript + pinned model)
//   - the model currently selected in the top picker
//   - UI state: chatOpen toggle, active sidebar tab, Settings modal
//   - a `streaming` flag + AbortController so the user can stop a response
//
// Session persistence lives in memory for now. A follow-up wires
// `<project>/.wonder/chats.json` so chats survive app restarts and travel
// with the project folder. The in-memory shape matches `ChatFile.sessions`
// so the save/load step is mechanical.
//
// `sendMessage` constructs a fresh Agent per turn. That's cheap (it's just
// a handful of references) and means every turn picks up the latest
// project context + system prompt without any invalidation logic.
// ---------------------------------------------------------------------------

export type SidebarTab = "files" | "library" | "assets";

/**
 * Tools that mutate a specific component by id — calling one of these locks
 * the target component on the canvas (pixel-grid overlay + disabled input)
 * until the result lands. `create_component` is excluded because the new id
 * isn't known yet; `delete_component` is excluded because the component
 * disappears when the call succeeds; read-only tools aren't in here either.
 */
const MUTATING_TOOLS = new Set([
  "update_component_source",
  "update_component_classes",
  "move_component",
  "resize_component",
]);

type ChatStore = {
  // --- sessions ---
  sessions: Session[];
  activeSessionId: string | null;

  // --- model ---
  selectedProvider: ProviderId;
  selectedModel: ModelId;

  // --- streaming ---
  streaming: boolean;
  /** Internal: abort controller for the in-flight stream, if any. */
  _abort: AbortController | null;
  /**
   * Set of component ids currently being edited by an in-flight mutating
   * tool call. Canvas overlays a pixel-grid loader + disables input while
   * an id is in here. Keyed as a record for cheap O(1) lookups in
   * `ComponentFrame`.
   */
  busyComponents: Record<string, true>;
  /**
   * Internal: `toolCallId → componentId` mapping used so we can release
   * the right component when a tool_result/tool_error lands (result events
   * don't carry the original input args). Reset on turn end.
   */
  _busyByCall: Record<string, string>;

  // --- UI ---
  /** The sidebar's normal tab strip (Files / Library / Assets). Independent
   *  of the chat panel, which is toggled by its own flag. */
  sidebarTab: SidebarTab;
  /** When true, the LeftSidebar swaps its normal content for ChatPanel and
   *  expands to 360px. Toggled from the Topbar button + ⌘L. */
  chatOpen: boolean;
  settingsOpen: boolean;
  /**
   * Incremented whenever something wants to focus the chat input (e.g. ⌘L).
   * ChatPanel watches this via a subscription and calls focus() in an effect.
   * Avoids prop drilling a ref across the layout.
   */
  focusRequestId: number;

  // --- actions ---
  setSidebarTab: (tab: SidebarTab) => void;
  setChatOpen: (open: boolean) => void;
  toggleChat: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  requestFocus: () => void;

  newSession: () => string;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  selectModel: (provider: ProviderId, model: ModelId) => void;

  sendMessage: (text: string) => Promise<void>;
  stop: () => void;
};

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function newEmptySession(provider: ProviderId, model: ModelId): Session {
  const now = Date.now();
  return {
    id: uid(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
    model,
    provider,
  };
}

// First enabled provider+model is the initial selection. Falls back to
// gpt-5.4-mini so the store is usable even if the registry is mis-ordered.
const DEFAULT_PROVIDER: ProviderId = "openai";
const DEFAULT_MODEL: ModelId =
  PROVIDERS.openai.models[0]?.id ?? "gpt-5.4-mini";

export const useChat = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  selectedProvider: DEFAULT_PROVIDER,
  selectedModel: DEFAULT_MODEL,
  streaming: false,
  _abort: null,
  busyComponents: {},
  _busyByCall: {},

  sidebarTab: "files",
  chatOpen: false,
  settingsOpen: false,
  focusRequestId: 0,

  setSidebarTab(tab) {
    set({ sidebarTab: tab });
  },
  setChatOpen(open) {
    set({ chatOpen: open });
  },
  toggleChat() {
    set((s) => ({ chatOpen: !s.chatOpen }));
  },
  openSettings() {
    set({ settingsOpen: true });
  },
  closeSettings() {
    set({ settingsOpen: false });
  },
  requestFocus() {
    set((s) => ({ focusRequestId: s.focusRequestId + 1 }));
  },

  newSession() {
    const s = get();
    const session = newEmptySession(s.selectedProvider, s.selectedModel);
    set({
      sessions: [session, ...s.sessions],
      activeSessionId: session.id,
    });
    return session.id;
  },
  selectSession(id) {
    if (!get().sessions.some((s) => s.id === id)) return;
    set({ activeSessionId: id });
  },
  deleteSession(id) {
    const s = get();
    const next = s.sessions.filter((x) => x.id !== id);
    set({
      sessions: next,
      activeSessionId:
        s.activeSessionId === id ? (next[0]?.id ?? null) : s.activeSessionId,
    });
  },
  renameSession(id, title) {
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id
          ? { ...x, title: title.trim() || "Untitled", updatedAt: Date.now() }
          : x,
      ),
    }));
  },
  selectModel(provider, model) {
    set({ selectedProvider: provider, selectedModel: model });
  },

  async sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const s0 = get();
    if (s0.streaming) return;

    // Resolve the provider BEFORE we touch any session state — if the model
    // is unknown we'd rather fail fast than leave a dangling user message.
    const provider =
      providerForModel(s0.selectedModel) ?? PROVIDERS[s0.selectedProvider];
    if (!provider || !provider.enabled) {
      set({ settingsOpen: true });
      return;
    }

    const apiKey = await loadApiKey(provider.id);
    if (!apiKey) {
      set({ settingsOpen: true });
      return;
    }

    // Ensure we have a session to append to.
    let sessionId = s0.activeSessionId;
    const hasActive = !!sessionId && s0.sessions.some((x) => x.id === sessionId);
    if (!hasActive) {
      sessionId = get().newSession();
    }

    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    const assistantMsg: Message = {
      id: uid(),
      role: "assistant",
      content: "",
      toolCalls: [],
      createdAt: Date.now(),
    };

    // Append user + empty assistant placeholder; also rewrite the session
    // title to the first user prompt so the dropdown isn't a wall of
    // "New chat" entries.
    set((st) => ({
      sessions: st.sessions.map((x) => {
        if (x.id !== sessionId) return x;
        const title =
          x.messages.length === 0
            ? trimmed.slice(0, 60) + (trimmed.length > 60 ? "…" : "")
            : x.title;
        return {
          ...x,
          title,
          messages: [...x.messages, userMsg, assistantMsg],
          updatedAt: Date.now(),
        };
      }),
    }));

    const abort = new AbortController();
    set({ streaming: true, _abort: abort });

    // Build the turn's transcript — everything but the empty assistant
    // placeholder we just inserted.
    const currentSession = get().sessions.find((x) => x.id === sessionId);
    const transcript = currentSession
      ? currentSession.messages.slice(0, -1)
      : [];

    try {
      const model = resolveLanguageModel(s0.selectedModel, apiKey);
      const agent = new Agent({
        model,
        tools: defaultTools(),
        system: buildSystemPrompt(buildProjectContext()),
      });

      for await (const evt of agent.run(transcript, { signal: abort.signal })) {
        if (abort.signal.aborted) break;
        applyEvent(set, sessionId!, assistantMsg.id, evt);
        if (evt.type === "done" || evt.type === "error") break;
      }
    } catch (err) {
      applyEvent(set, sessionId!, assistantMsg.id, {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      // Whatever happens, the turn is over — no more tool calls can land,
      // so release any components that were locked.
      set({ streaming: false, _abort: null, busyComponents: {}, _busyByCall: {} });
    }
  },

  stop() {
    get()._abort?.abort();
    set({ streaming: false, _abort: null, busyComponents: {}, _busyByCall: {} });
  },
}));

// ---------------------------------------------------------------------------
// Event → state reducer.
//
// Kept outside the store so `sendMessage` can feed agent events in a tight
// loop without each iteration reallocating closure scope. Handles both
// content streaming (text deltas) and tool call bookkeeping so the UI can
// render inline tool chips.
// ---------------------------------------------------------------------------

function applyEvent(
  set: (updater: (s: ChatStore) => Partial<ChatStore>) => void,
  sessionId: string,
  messageId: string,
  evt: AgentEvent,
): void {
  set((s) => {
    const next: Partial<ChatStore> = {
      sessions: s.sessions.map((sess) => {
        if (sess.id !== sessionId) return sess;
        return {
          ...sess,
          updatedAt: Date.now(),
          messages: sess.messages.map((m) => {
            if (m.id !== messageId) return m;
            return reduceMessage(m, evt);
          }),
        };
      }),
    };
    const busyUpdate = reduceBusy(s.busyComponents, s._busyByCall, evt);
    if (busyUpdate) {
      next.busyComponents = busyUpdate.busyComponents;
      next._busyByCall = busyUpdate._busyByCall;
    }
    return next;
  });
}

/**
 * Track which components are being mutated right now.
 *
 * - `tool_call` for a mutating tool with an `args.id` → add the id to
 *   `busyComponents` and record `toolCallId → componentId` in the side map.
 * - `tool_result` / `tool_error` for a known `toolCallId` → remove the
 *   mapping and release the component (canvas overlay turns off).
 *
 * Returns `null` when nothing changes, so the caller can skip setState work.
 */
function reduceBusy(
  busy: Record<string, true>,
  byCall: Record<string, string>,
  evt: AgentEvent,
): { busyComponents: Record<string, true>; _busyByCall: Record<string, string> } | null {
  if (evt.type === "tool_call") {
    if (!MUTATING_TOOLS.has(evt.name)) return null;
    const id = typeof evt.args?.id === "string" ? evt.args.id : null;
    if (!id) return null;
    return {
      busyComponents: busy[id] ? busy : { ...busy, [id]: true },
      _busyByCall: { ...byCall, [evt.id]: id },
    };
  }
  if (evt.type === "tool_result" || evt.type === "tool_error") {
    const componentId = byCall[evt.id];
    if (!componentId) return null;
    const { [evt.id]: _dropped, ...restByCall } = byCall;
    // Only release the component if no OTHER pending call still references
    // it. Rare in practice (the agent doesn't parallel-mutate the same id),
    // but cheap to check and avoids a flicker if the model did queue two.
    const stillBusy = Object.values(restByCall).includes(componentId);
    if (stillBusy) {
      return { busyComponents: busy, _busyByCall: restByCall };
    }
    const { [componentId]: _out, ...restBusy } = busy;
    return { busyComponents: restBusy, _busyByCall: restByCall };
  }
  return null;
}

function reduceMessage(m: Message, evt: AgentEvent): Message {
  switch (evt.type) {
    case "text":
      return { ...m, content: m.content + evt.delta };

    case "tool_call": {
      const call: ToolCall = {
        id: evt.id,
        name: evt.name,
        arguments: evt.args,
      };
      return {
        ...m,
        toolCalls: [...(m.toolCalls ?? []), call],
      };
    }

    case "tool_result": {
      const calls = (m.toolCalls ?? []).map((c) =>
        c.id === evt.id ? { ...c, result: { ok: true, data: evt.output } } : c,
      );
      return { ...m, toolCalls: calls };
    }

    case "tool_error": {
      const calls = (m.toolCalls ?? []).map((c) =>
        c.id === evt.id
          ? { ...c, result: { ok: false, error: evt.error } }
          : c,
      );
      return { ...m, toolCalls: calls };
    }

    case "error": {
      const prefix = m.content ? m.content + "\n\n" : "";
      return { ...m, content: prefix + `⚠️ ${evt.message}` };
    }

    case "done":
      return m;

    default:
      return m;
  }
}
