import { AppIcon } from "@/app/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@/store/chat";
import { useProject } from "@/store/project";
import { useLayout } from "@/store/layout";
import { allModels } from "@/agent";
import type { Message, Session } from "@/chat/types";

/**
 * Main chat surface, rendered inside the LeftSidebar when the Chat toggle is
 * on. Three vertical regions:
 *   - header: session dropdown + new / settings / close icons
 *   - message list (scrolls independently)
 *   - composer: rounded card with live status chip + textarea + model chip + send
 *
 * The model picker lives INSIDE the composer (bottom-left chip), so the
 * header stays uncluttered and the model choice sits next to where you type.
 */
export function ChatPanel() {
  const sessions = useChat((s) => s.sessions);
  const activeSessionId = useChat((s) => s.activeSessionId);
  const openProfile = useChat((s) => s.openProfile);
  const newSession = useChat((s) => s.newSession);
  const setChatOpen = useChat((s) => s.setChatOpen);
  const collapseLeft = useLayout((s) => s.toggleLeft);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-1 px-2">
        <SessionDropdown />
        <div className="flex-1" />
        <IconBtn title="New chat" onClick={() => newSession()}>
          <AppIcon name="Plus" size={13} />
        </IconBtn>
        {/* Settings live in the unified Profile modal (TitleStrip avatar).
            We keep the cog here as an affordance from inside the chat, but
            it opens the same modal so there is a single place for keys,
            models, and account. */}
        <IconBtn title="AI settings (opens profile)" onClick={openProfile}>
          <AppIcon name="Settings" size={13} />
        </IconBtn>
        <IconBtn title="Close chat (⌘L)" onClick={() => setChatOpen(false)}>
          <AppIcon name="X" size={13} />
        </IconBtn>
        {/* Collapse the whole sidebar — distinct from closing chat. Closing
            chat returns to Files view; collapsing hides the panel entirely. */}
        <IconBtn title="Collapse panel (⌘\)" onClick={collapseLeft}>
          <AppIcon name="ChevronLeft" size={13} />
        </IconBtn>
      </div>

      {/* Messages */}
      <MessageList session={activeSession} />

      {/* Input */}
      <ChatInput session={activeSession} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session dropdown
//
// Fixed max height with internal scroll so a long chat history stays usable.
// ---------------------------------------------------------------------------

function SessionDropdown() {
  const sessions = useChat((s) => s.sessions);
  const activeSessionId = useChat((s) => s.activeSessionId);
  const selectSession = useChat((s) => s.selectSession);
  const deleteSession = useChat((s) => s.deleteSession);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const active = sessions.find((s) => s.id === activeSessionId);
  const label = active ? active.title : sessions.length ? "Pick a chat" : "New chat";

  return (
    <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[220px] items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] font-medium text-ink hover:bg-panel-soft"
        title={label}
      >
        <AppIcon name="Message" size={11} className="text-ink-muted" />
        <span className="truncate">{label}</span>
        <AppIcon name="ChevronDown" size={10} className="text-ink-faint" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-[280px] w-[260px] overflow-y-auto rounded-xl border border-stroke bg-white py-1 shadow-lg">
          {sessions.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-ink-faint">
              Start typing below to create your first chat.
            </div>
          ) : (
            sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  className={
                    "group flex items-center gap-1 px-2 py-1 text-[12px] hover:bg-panel-soft " +
                    (isActive ? "bg-panel-soft" : "")
                  }
                >
                  <button
                    onClick={() => {
                      selectSession(s.id);
                      setOpen(false);
                    }}
                    className="flex-1 truncate text-left text-ink"
                  >
                    {s.title}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(s.id);
                    }}
                    title="Delete chat"
                    className="hidden size-5 place-items-center rounded text-ink-faint hover:bg-red-50 hover:text-red-600 group-hover:grid"
                  >
                    <AppIcon name="Trash" size={11} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message list
// ---------------------------------------------------------------------------

function MessageList({ session }: { session: Session | null }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const messages = session?.messages ?? [];

  // Auto-scroll to bottom whenever a message (or delta) lands.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid size-11 place-items-center rounded-full bg-accent-tint text-accent">
          <AppIcon name="Sparkles" size={18} />
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-[13px] font-semibold text-ink">Ask anything</div>
          <div className="max-w-[240px] text-[11px] leading-relaxed text-ink-faint">
            Create, edit, or rearrange components by describing what you want.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3"
    >
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={"flex flex-col gap-1 " + (isUser ? "items-end" : "items-start")}>
      <div
        className={
          "max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[12.5px] leading-relaxed " +
          (isUser
            ? "bg-accent text-white"
            : "bg-panel-soft text-ink")
        }
      >
        {message.content || (
          <span className="inline-flex items-center gap-1 text-ink-faint">
            <Dot /> <Dot delay={120} /> <Dot delay={240} />
          </span>
        )}
      </div>
    </div>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="inline-block size-1.5 animate-pulse rounded-full bg-ink-faint"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}

// ---------------------------------------------------------------------------
// Composer
//
// Rounded card with three rows:
//   1. Status chip (only while streaming — shows current tool or "Thinking…")
//   2. Textarea (auto-grow up to 160px)
//   3. Footer: model picker chip (left), mic placeholder (future) + send (right)
//
// Focus state animates the border to accent and drops a soft ring — Figma /
// Notion style. The send button is a full circle to match the reference.
// ---------------------------------------------------------------------------

function ChatInput({ session }: { session: Session | null }) {
  const sendMessage = useChat((s) => s.sendMessage);
  const streaming = useChat((s) => s.streaming);
  const stop = useChat((s) => s.stop);
  const focusRequestId = useChat((s) => s.focusRequestId);
  const composerTags = useChat((s) => s.composerTags);
  const removeComposerTag = useChat((s) => s.removeComposerTag);

  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // ⌘L (Topbar) increments focusRequestId — refocus + select.
  useEffect(() => {
    if (focusRequestId === 0) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, el.value.length);
  }, [focusRequestId]);

  // Auto-grow textarea up to 160px.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(160, el.scrollHeight) + "px";
  }, [value]);

  const submit = () => {
    if (streaming) return;
    const text = value;
    if (!text.trim()) return;
    setValue("");
    void sendMessage(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // Derive a short live status for the chip. While streaming, show the
  // in-flight tool's name if any; otherwise "Thinking…".
  const lastMsg = session?.messages[session.messages.length - 1];
  const inflightTool =
    streaming && lastMsg?.role === "assistant"
      ? lastMsg.toolCalls?.find((c) => !c.result)
      : undefined;
  const statusText = inflightTool ? `Using ${inflightTool.name}…` : "Thinking…";

  const canSend = !!value.trim() && !streaming;

  return (
    <div className="shrink-0 px-3 pb-3 pt-1">
      <div
        className={
          "flex flex-col gap-2 rounded-2xl border bg-white px-3 pb-2 pt-2.5 transition-[border-color,box-shadow] " +
          (focused
            ? "border-accent/40 shadow-[0_0_0_3px_rgba(16,185,129,0.08)]"
            : "border-stroke")
        }
        onClick={() => ref.current?.focus()}
      >
        {/* Status chip — only while streaming */}
        {streaming ? (
          <div className="flex items-center gap-1.5 self-start rounded-full bg-accent-tint px-2 py-0.5 text-[10.5px] font-medium text-accent">
            <AppIcon name="Loader" size={10} className="animate-spin" />
            {statusText}
          </div>
        ) : null}

        {/* Scope chips — components the user tagged for this turn */}
        {composerTags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {composerTags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-tint px-1.5 py-0.5 text-[10.5px] font-medium text-accent-ink"
                title={`Scoped: ${t.name}`}
              >
                <AppIcon name="AtSign" size={9} />
                {t.name}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeComposerTag(t.id);
                  }}
                  className="grid size-3.5 place-items-center rounded-full text-accent-ink/70 hover:bg-accent/15 hover:text-accent-ink"
                  title="Remove"
                >
                  <AppIcon name="X" size={8} />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {/* Textarea */}
        <textarea
          ref={ref}
          data-wonder-chat-input
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Ask anything…"
          className="max-h-[160px] w-full resize-none bg-transparent text-[12.5px] leading-[1.5] text-ink placeholder:text-ink-faint outline-none"
        />

        {/* Footer: @picker + model chip + send */}
        <div className="flex items-center gap-1.5">
          <AtPicker />
          <ModelChip />
          <div className="flex-1" />
          {streaming ? (
            <button
              onClick={stop}
              title="Stop"
              className="grid size-8 place-items-center rounded-full bg-ink text-white transition hover:brightness-110"
            >
              <AppIcon name="Square" size={11} />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!canSend}
              title="Send (Enter)"
              className={
                "grid size-8 place-items-center rounded-full transition " +
                (canSend
                  ? "bg-accent text-white hover:brightness-110"
                  : "bg-panel-soft text-ink-faint cursor-not-allowed")
              }
            >
              <AppIcon name="Send" size={12} className="-ml-0.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// @ picker (inline in composer footer)
//
// Opens a dropdown of the project's components so the user can tag one (or
// more) as the scope for the next message. Tagged components are locked on
// the canvas (pixel-grid overlay) for the full turn — see `useChat.busyComponents`.
//
// Dropdown opens upward (`bottom-full`) because it sits at the bottom of the
// sidebar. Components already in the tag strip are shown as "added" but
// clicking one again is a no-op thanks to the store's dedupe.
// ---------------------------------------------------------------------------

function AtPicker() {
  const components = useProject((s) => s.components);
  const order = useProject((s) => s.order);
  const composerTags = useChat((s) => s.composerTags);
  const addComposerTag = useChat((s) => s.addComposerTag);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const tagged = useMemo(
    () => new Set(composerTags.map((t) => t.id)),
    [composerTags],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = order
      .map((id) => components[id])
      .filter((c): c is NonNullable<typeof c> => !!c);
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [order, components, query]);

  return (
    <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid size-7 place-items-center rounded-full border border-stroke bg-white text-ink-soft transition hover:bg-panel-soft"
        title="Tag a component for the agent to scope this message to"
      >
        <AppIcon name="AtSign" size={11} />
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-30 mb-1.5 w-[240px] overflow-hidden rounded-xl border border-stroke bg-white shadow-lg">
          <div className="border-b border-stroke p-1.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search components…"
              className="w-full rounded-md bg-panel-soft px-2 py-1 text-[11.5px] text-ink placeholder:text-ink-faint outline-none"
            />
          </div>
          <div className="max-h-[220px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-ink-faint">
                No components match.
              </div>
            ) : (
              filtered.map((c) => {
                const already = tagged.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      if (!already) addComposerTag(c.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={
                      "flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[12px] transition hover:bg-panel-soft " +
                      (already ? "text-ink-faint" : "text-ink")
                    }
                  >
                    <AppIcon
                      name="AtSign"
                      size={10}
                      className={already ? "text-ink-faint" : "text-accent"}
                    />
                    <span className="flex-1 truncate">{c.name}</span>
                    {already ? (
                      <span className="text-[10px] text-ink-faint">added</span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model chip (inline in composer footer)
//
// Behaves like the old ModelPicker but renders as a pill and opens UPWARD
// since it's anchored near the bottom of the panel. On open, sits at
// `bottom-full` with mb-1.
// ---------------------------------------------------------------------------

function ModelChip() {
  const selectedModel = useChat((s) => s.selectedModel);
  const selectModel = useChat((s) => s.selectModel);
  const [open, setOpen] = useState(false);

  const models = allModels();
  const current = models.find((m) => m.id === selectedModel) ?? models[0];

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  if (!current) {
    return (
      <span className="text-[10px] text-ink-faint px-1.5">No models</span>
    );
  }

  return (
    <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-full border border-stroke bg-white px-2 py-1 text-[11px] font-medium text-ink-soft transition hover:bg-panel-soft"
        title={current.description}
      >
        <AppIcon name="Sparkles" size={10} className="text-accent" />
        {current.label}
        <AppIcon name="ChevronDown" size={9} className="text-ink-faint" />
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-30 mb-1.5 w-[240px] rounded-xl border border-stroke bg-white py-1 shadow-lg">
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                selectModel(m.provider, m.id);
                setOpen(false);
              }}
              className={
                "flex w-full flex-col items-start px-3 py-1.5 text-left text-[12px] hover:bg-panel-soft " +
                (m.id === selectedModel ? "bg-panel-soft" : "")
              }
            >
              <span className="font-medium text-ink">{m.label}</span>
              {m.description ? (
                <span className="text-[10px] text-ink-faint">{m.description}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="grid size-7 place-items-center rounded-md text-ink-muted hover:bg-panel-soft hover:text-ink transition"
    >
      {children}
    </button>
  );
}
