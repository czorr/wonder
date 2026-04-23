import { create } from "zustand";
import type { Message, ModelId, Session, ToolCall } from "@/chat/types";
import { loadApiKey } from "@/chat/secrets";
import { useProject } from "@/store/project";
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
 * A component tagged into the composer — acts as an explicit scope the user
 * is instructing the agent to work on. We denormalize `name` alongside `id`
 * so the chip renders correctly even if the user later renames the
 * component or opens a different project.
 */
export type ComposerTag = { id: string; name: string };

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
   * Component ids locked on the canvas for the duration of the current turn.
   * Canvas overlays a pixel-grid loader + disables interaction for each id
   * in here. Seeded at the start of `sendMessage` from the tag/selection
   * scope and cleared when the turn ends — NOT tracked per-tool-call.
   *
   * Why turn-level: tool_call → tool_result is near-synchronous in this
   * agent, so a per-call lock flickers too fast to see. A turn-level lock
   * matches the user's mental model ("I asked the agent to touch X; X is
   * locked until the agent is done").
   */
  busyComponents: Record<string, true>;

  /**
   * Components the user has explicitly tagged into the composer — these
   * become the "in-scope" set for the NEXT message. Cleared on send.
   * Drives the canvas overlay for the entire turn (not per-tool-call).
   */
  composerTags: ComposerTag[];

  // --- UI ---
  /** The sidebar's normal tab strip (Files / Library / Assets). Independent
   *  of the chat panel, which is toggled by its own flag. */
  sidebarTab: SidebarTab;
  /** When true, the LeftSidebar swaps its normal content for ChatPanel and
   *  expands to 360px. Toggled from the Topbar button + ⌘L. */
  chatOpen: boolean;
  profileOpen: boolean;
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
  openProfile: () => void;
  closeProfile: () => void;
  requestFocus: () => void;

  newSession: () => string;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  selectModel: (provider: ProviderId, model: ModelId) => void;

  addComposerTag: (id: string) => void;
  removeComposerTag: (id: string) => void;
  clearComposerTags: () => void;

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

  composerTags: [],

  sidebarTab: "files",
  chatOpen: false,
  profileOpen: false,
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
  openProfile() {
    set({ profileOpen: true });
  },
  closeProfile() {
    set({ profileOpen: false });
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

  addComposerTag(id) {
    const s = get();
    if (s.composerTags.some((t) => t.id === id)) return;
    const comp = useProject.getState().components[id];
    if (!comp) return;
    set({ composerTags: [...s.composerTags, { id, name: comp.name }] });
  },
  removeComposerTag(id) {
    set((s) => ({ composerTags: s.composerTags.filter((t) => t.id !== id) }));
  },
  clearComposerTags() {
    set({ composerTags: [] });
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
      set({ profileOpen: true });
      return;
    }

    const apiKey = await loadApiKey(provider.id);
    if (!apiKey) {
      set({ profileOpen: true });
      return;
    }

    // Ensure we have a session to append to.
    let sessionId = s0.activeSessionId;
    const hasActive = !!sessionId && s0.sessions.some((x) => x.id === sessionId);
    if (!hasActive) {
      sessionId = get().newSession();
    }

    // Resolve the target components for this turn.
    //   1. Explicit composer tags take precedence (user declared the scope).
    //   2. Otherwise fall back to the currently selected component on the
    //      canvas — that makes the flow "click component → chat → ask"
    //      work without forcing the user to tag every time.
    // Dropped if the referenced id no longer exists in the project.
    const projectNow = useProject.getState();
    const explicitTagIds = s0.composerTags
      .map((t) => t.id)
      .filter((id) => !!projectNow.components[id]);
    const targetIds =
      explicitTagIds.length > 0
        ? explicitTagIds
        : projectNow.selectedComponentId &&
            projectNow.components[projectNow.selectedComponentId]
          ? [projectNow.selectedComponentId]
          : [];

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
    // Turn-level lock: seed busyComponents with every target BEFORE we kick
    // off the stream. That way the canvas overlay appears the instant the
    // user presses send, not — as the old per-tool-call scheme did — during
    // the ~microsecond gap between tool_call and tool_result. Also clear
    // the composer tag strip: the scope is now "committed" to this turn.
    const seededBusy: Record<string, true> = {};
    for (const id of targetIds) seededBusy[id] = true;
    set({
      streaming: true,
      _abort: abort,
      busyComponents: seededBusy,
      composerTags: [],
    });

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
        system: buildSystemPrompt(buildProjectContext(targetIds)),
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
      // Turn ended — release the overlay on every component we locked.
      set({ streaming: false, _abort: null, busyComponents: {} });
    }
  },

  stop() {
    get()._abort?.abort();
    set({ streaming: false, _abort: null, busyComponents: {} });
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
  set((s) => ({
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
  }));
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
