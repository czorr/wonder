import { X, Eye, EyeOff, Check, KeyRound, BadgeCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useChat } from "@/store/chat";
import { PROVIDERS, allModels, type ProviderId } from "@/agent";
import { loadApiKey, saveApiKey } from "@/chat/secrets";

/**
 * Chat Settings modal — provider & API key management.
 *
 * Provider-agnostic from day 1: we loop PROVIDERS. Enabled providers get an
 * editable API key row with "Save" + "Clear" actions. Disabled ones ("coming
 * soon") get a gray row with a badge so users can see what's on the roadmap.
 *
 * Keys persist to `$APPDATA/secrets.json` via `secrets.ts`. We re-read on open
 * so the modal is always fresh (e.g. if the file was edited out of band).
 */
export function ChatSettingsModal() {
  const closeSettings = useChat((s) => s.closeSettings);

  // Close on Escape. Click-outside is handled by the backdrop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSettings]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={closeSettings}
    >
      <div
        className="flex max-h-[80vh] w-[520px] flex-col overflow-hidden rounded-xl border border-stroke bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stroke px-4 py-3">
          <div className="flex items-center gap-2">
            <KeyRound size={14} strokeWidth={1.75} className="text-ink-muted" />
            <span className="text-[13px] font-semibold text-ink">Chat Settings</span>
          </div>
          <button
            onClick={closeSettings}
            className="grid size-6 place-items-center rounded-md text-ink-muted hover:bg-panel-soft hover:text-ink"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <DefaultModelSection />

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Providers
            </div>
            <div className="mt-1 text-[11px] text-ink-faint">
              API keys are stored on your machine in <code className="rounded bg-panel-soft px-1">$APPDATA/secrets.json</code>. They are never sent anywhere except to the provider you select.
            </div>
          </div>

          {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
            <ProviderRow key={id} providerId={id} />
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-stroke bg-panel px-4 py-3">
          <button
            onClick={closeSettings}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium text-ink-soft hover:bg-panel-soft"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default model
//
// Mirrors the model picker in the ChatPanel header so users can set their
// preferred default from Settings without opening the chat. Both controls
// read/write the same store slice.
// ---------------------------------------------------------------------------

function DefaultModelSection() {
  const selectedModel = useChat((s) => s.selectedModel);
  const selectModel = useChat((s) => s.selectModel);
  const models = allModels();

  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        Default model
      </div>
      <div className="mt-1 text-[11px] text-ink-faint">
        New chats open pinned to this model. You can always change the model
        for a single chat from the chat header.
      </div>
      {models.length === 0 ? (
        <div className="mt-2 rounded-md border border-stroke bg-panel-soft/40 px-3 py-2 text-[11px] text-ink-faint">
          No models available — enable a provider below.
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {models.map((m) => {
            const active = m.id === selectedModel;
            return (
              <button
                key={m.id}
                onClick={() => selectModel(m.provider, m.id)}
                title={m.description}
                className={
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition " +
                  (active
                    ? "border-accent bg-accent-tint text-accent"
                    : "border-stroke bg-white text-ink-soft hover:bg-panel-soft")
                }
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider row
// ---------------------------------------------------------------------------

function ProviderRow({ providerId }: { providerId: ProviderId }) {
  const provider = PROVIDERS[providerId];
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState(false);

  // Load the saved key on mount so the user sees whether one is already set.
  useEffect(() => {
    let cancelled = false;
    loadApiKey(providerId).then((k) => {
      if (cancelled) return;
      if (k) {
        setKey(k);
        setHasStoredKey(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const onSave = async () => {
    setSaving(true);
    try {
      await saveApiKey(providerId, key.trim());
      setHasStoredKey(!!key.trim());
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    await saveApiKey(providerId, "");
    setKey("");
    setHasStoredKey(false);
  };

  const disabled = !provider.enabled;

  return (
    <div
      className={
        "rounded-lg border border-stroke bg-panel-soft/40 p-3 " +
        (disabled ? "opacity-60" : "")
      }
    >
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-ink">{provider.label}</span>
        {provider.tagline ? (
          <span className="text-[10px] text-ink-faint">· {provider.tagline}</span>
        ) : null}
        <div className="flex-1" />
        {disabled ? (
          <span className="rounded-full bg-ink-faint/15 px-2 py-0.5 text-[10px] font-medium text-ink-muted">
            Coming soon
          </span>
        ) : hasStoredKey ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            <BadgeCheck size={10} strokeWidth={2} /> Key saved
          </span>
        ) : null}
      </div>

      {provider.models.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {provider.models.map((m) => (
            <span
              key={m.id}
              className="rounded-md border border-stroke bg-white px-1.5 py-0.5 text-[10px] text-ink-soft"
              title={m.description}
            >
              {m.label}
            </span>
          ))}
        </div>
      ) : null}

      {!disabled ? (
        <>
          <div className="mt-3 flex items-center gap-1.5 rounded-md border border-stroke bg-white px-2 py-1.5">
            <KeyRound size={12} strokeWidth={1.75} className="text-ink-faint" />
            <input
              type={show ? "text" : "password"}
              spellCheck={false}
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                providerId === "openai" ? "sk-…" : "API key"
              }
              className="flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-faint outline-none"
            />
            <button
              onClick={() => setShow((v) => !v)}
              title={show ? "Hide" : "Show"}
              className="grid size-5 place-items-center rounded text-ink-faint hover:bg-panel-soft hover:text-ink"
            >
              {show ? <EyeOff size={11} strokeWidth={1.75} /> : <Eye size={11} strokeWidth={1.75} />}
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={onSave}
              disabled={saving || !key.trim()}
              className={
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition " +
                (saving || !key.trim()
                  ? "bg-panel text-ink-faint cursor-not-allowed"
                  : "bg-accent text-white hover:brightness-110")
              }
            >
              {saved ? <Check size={11} strokeWidth={2.5} /> : null}
              {saved ? "Saved" : saving ? "Saving…" : "Save key"}
            </button>
            {hasStoredKey ? (
              <button
                onClick={onClear}
                className="rounded-md px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:bg-panel-soft hover:text-ink"
              >
                Clear
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
