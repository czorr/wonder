import { AppIcon, type AppIconName } from "@/app/icons";
import { useEffect, useMemo, useState } from "react";
import { useChat } from "@/store/chat";
import { PROVIDERS, PROVIDER_ICON, allModels, type ProviderId } from "@/agent";
import { loadApiKey, saveApiKey } from "@/chat/secrets";

// ---------------------------------------------------------------------------
// Profile & Settings modal.
//
// VSCode / Cursor style: fixed-size card, left rail with navigation, right
// column scrolls independently. Content is rendered as flat rows separated by
// hairline dividers — no nested cards, no visual noise. Every row follows the
// same shape: label (+ optional helper) on the left, control on the right.
//
// Single mount (see Shell.tsx). Opened via `useChat.openProfile()` from both
// the TitleStrip avatar and the chat header cog.
// ---------------------------------------------------------------------------

type SectionId = "profile" | "ai" | "providers" | "about";

type NavEntry = { id: SectionId; label: string; icon: AppIconName };

const NAV: readonly NavEntry[] = [
  { id: "profile", label: "Profile", icon: "User" },
  { id: "ai", label: "AI", icon: "Sparkles" },
  { id: "providers", label: "Providers", icon: "Key" },
  { id: "about", label: "About", icon: "Settings" },
] as const;

export function ProfileModal() {
  const closeProfile = useChat((s) => s.closeProfile);
  const [section, setSection] = useState<SectionId>("profile");

  // Close on Escape. Click-outside is handled by the backdrop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeProfile();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeProfile]);

  const current = NAV.find((n) => n.id === section) ?? NAV[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={closeProfile}
    >
      <div
        className="flex h-[600px] max-h-[calc(100vh-80px)] w-[820px] max-w-[calc(100vw-80px)] overflow-hidden rounded-xl border border-stroke bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Left rail */}
        <nav className="flex w-[200px] shrink-0 flex-col gap-0.5 border-r border-stroke bg-panel-soft/30 p-2">
          <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Settings
          </div>
          {NAV.map((n) => (
            <NavItem
              key={n.id}
              icon={n.icon}
              label={n.label}
              active={section === n.id}
              onClick={() => setSection(n.id)}
            />
          ))}
        </nav>

        {/* Right column: fixed header + scroll body */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-stroke px-6">
            <h2 className="text-[14px] font-semibold text-ink">
              {current.label}
            </h2>
            <button
              onClick={closeProfile}
              title="Close (Esc)"
              className="grid size-6 place-items-center rounded-md text-ink-muted hover:bg-panel-soft hover:text-ink"
            >
              <AppIcon name="X" size={14} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
            {section === "profile" ? <ProfileSection /> : null}
            {section === "ai" ? <AISection /> : null}
            {section === "providers" ? <ProvidersSection /> : null}
            {section === "about" ? <AboutSection /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav item
// ---------------------------------------------------------------------------

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: AppIconName;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition " +
        (active
          ? "bg-white text-ink shadow-[0_0_0_1px] shadow-stroke"
          : "text-ink-soft hover:bg-white/60 hover:text-ink")
      }
    >
      <AppIcon
        name={icon}
        size={14}
        className={active ? "text-accent" : "text-ink-muted"}
      />
      <span className="font-medium">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Row primitives — flat, label-left / control-right. No nested cards.
// ---------------------------------------------------------------------------

function Row({
  label,
  helper,
  children,
  align = "center",
}: {
  label: string;
  helper?: string;
  children?: React.ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div
      className={
        "flex gap-6 border-b border-stroke py-4 last:border-b-0 " +
        (align === "start" ? "items-start" : "items-center")
      }
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
        {helper ? (
          <span className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">
            {helper}
          </span>
        ) : null}
      </div>
      {children ? (
        <div className="flex shrink-0 items-center">{children}</div>
      ) : null}
    </div>
  );
}

function BlockRow({
  label,
  helper,
  icon,
  trailing,
  children,
}: {
  label: string;
  helper?: string;
  /** Optional app-icon rendered before the label (e.g. provider brand mark). */
  icon?: AppIconName;
  /** Right-aligned content that sits next to the label (badges, status). */
  trailing?: React.ReactNode;
  /** Full-width content that renders BELOW the label row. */
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-stroke py-4 last:border-b-0">
      <div className="flex items-center gap-4">
        {icon ? (
          <div className="grid size-8 shrink-0 place-items-center rounded-md border border-stroke bg-white text-ink">
            <AppIcon name={icon} size={16} />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12.5px] font-medium text-ink">{label}</span>
          {helper ? (
            <span className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">
              {helper}
            </span>
          ) : null}
        </div>
        {trailing ? (
          <div className="flex shrink-0 items-center">{trailing}</div>
        ) : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile section
//
// Placeholder for now — no auth is wired yet. Fields are editable client-side
// so the surface feels real, but there is nowhere to persist them to until
// account plumbing lands.
// ---------------------------------------------------------------------------

function ProfileSection() {
  const [displayName, setDisplayName] = useState("Wonder user");
  const [handle, setHandle] = useState("username");
  const [privateProfile, setPrivateProfile] = useState(false);

  const initial = (displayName.trim()[0] ?? "W").toUpperCase();

  return (
    <div>
      <Row
        label="Private profile"
        helper="Hide your projects from the public Wonder directory."
      >
        <Toggle checked={privateProfile} onChange={setPrivateProfile} />
      </Row>

      <Row label="Avatar" helper="Auto-generated from your display name for now.">
        <div className="grid size-9 place-items-center rounded-full bg-accent-tint text-[13px] font-semibold text-accent">
          {initial}
        </div>
      </Row>

      <Row label="Display name">
        <PlainInput
          value={displayName}
          onChange={setDisplayName}
          placeholder="Your name"
        />
      </Row>

      <Row label="Handle" helper="Used for sharing links once Cloud ships.">
        <div className="flex items-center gap-1 text-[12px] text-ink-faint">
          <span>wonder.app/@</span>
          <PlainInput
            value={handle}
            onChange={setHandle}
            placeholder="username"
            width={140}
          />
        </div>
      </Row>

      <Row
        label="Account"
        helper="Local workspace · sign-in is coming in a future release."
      >
        <button
          disabled
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-stroke bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink-faint"
        >
          <AppIcon name="LogOut" size={11} />
          Sign in
        </button>
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI section
// ---------------------------------------------------------------------------

function AISection() {
  const selectedModel = useChat((s) => s.selectedModel);
  const selectModel = useChat((s) => s.selectModel);
  const models = useMemo(() => allModels(), []);

  return (
    <div>
      <BlockRow
        label="Default model"
        helper="New chats open pinned to this model. You can change it per-chat from the composer."
      >
        {models.length === 0 ? (
          <div className="text-[11.5px] text-ink-faint">
            No models available — configure a provider to unlock them.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {models.map((m) => {
              const active = m.id === selectedModel;
              return (
                <button
                  key={m.id}
                  onClick={() => selectModel(m.provider, m.id)}
                  title={m.description}
                  className={
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-medium transition " +
                    (active
                      ? "border-accent bg-accent-tint text-accent"
                      : "border-stroke bg-white text-ink-soft hover:bg-panel-soft")
                  }
                >
                  <AppIcon
                    name={PROVIDER_ICON[m.provider]}
                    size={13}
                    className={active ? "text-accent" : "text-ink"}
                  />
                  {m.label}
                </button>
              );
            })}
          </div>
        )}
      </BlockRow>

      <Row
        label="Streaming responses"
        helper="Show tokens as they arrive. Always on — listed here for clarity."
      >
        <span className="text-[11.5px] text-ink-faint">Enabled</span>
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Providers section
// ---------------------------------------------------------------------------

function ProvidersSection() {
  return (
    <div>
      <div className="-mt-1 pb-2 text-[11px] leading-relaxed text-ink-faint">
        API keys are stored on your machine in{" "}
        <code className="rounded bg-panel-soft px-1">
          $APPDATA/secrets.json
        </code>
        . They are never sent anywhere except to the provider you select.
      </div>
      {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
        <ProviderBlock key={id} providerId={id} />
      ))}
    </div>
  );
}

function ProviderBlock({ providerId }: { providerId: ProviderId }) {
  const provider = PROVIDERS[providerId];
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState(false);

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

  const trailing = disabled ? (
    <span className="text-[10.5px] font-medium text-ink-faint">
      Coming soon
    </span>
  ) : hasStoredKey ? (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-700">
      <AppIcon name="BadgeCheck" size={11} /> Key saved
    </span>
  ) : (
    <span className="text-[10.5px] font-medium text-ink-faint">
      Not configured
    </span>
  );

  return (
    <BlockRow
      label={provider.label}
      helper={provider.tagline ?? undefined}
      icon={PROVIDER_ICON[providerId]}
      trailing={trailing}
    >
      {disabled ? null : (
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1.5 rounded-md border border-stroke bg-white px-2 py-1.5">
            <AppIcon name="Key" size={12} className="text-ink-faint" />
            <input
              type={show ? "text" : "password"}
              spellCheck={false}
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={providerId === "openai" ? "sk-…" : "API key"}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-faint outline-none"
            />
            <button
              onClick={() => setShow((v) => !v)}
              title={show ? "Hide" : "Show"}
              className="grid size-5 place-items-center rounded text-ink-faint hover:bg-panel-soft hover:text-ink"
            >
              {show ? (
                <AppIcon name="EyeOff" size={11} />
              ) : (
                <AppIcon name="Eye" size={11} />
              )}
            </button>
          </div>
          <button
            onClick={onSave}
            disabled={saving || !key.trim()}
            className={
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold transition " +
              (saving || !key.trim()
                ? "bg-panel text-ink-faint cursor-not-allowed"
                : "bg-accent text-white hover:brightness-110")
            }
          >
            {saved ? <AppIcon name="Check" size={11} /> : null}
            {saved ? "Saved" : saving ? "Saving…" : "Save"}
          </button>
          {hasStoredKey ? (
            <button
              onClick={onClear}
              className="rounded-md px-2.5 py-1.5 text-[11.5px] font-medium text-ink-muted hover:bg-panel-soft hover:text-ink"
            >
              Clear
            </button>
          ) : null}
        </div>
      )}
    </BlockRow>
  );
}

// ---------------------------------------------------------------------------
// About section
// ---------------------------------------------------------------------------

function AboutSection() {
  return (
    <div>
      <Row label="Wonder" helper="Local desktop build">
        <span className="text-[11.5px] text-ink-faint">v0.1.0 · dev</span>
      </Row>
      <Row label="Icons" helper="App chrome uses MingCute via Iconify.">
        <span className="text-[11.5px] text-ink-faint">mingcute</span>
      </Row>
      <Row
        label="Storage"
        helper="Projects live on disk · chats and keys in $APPDATA."
      >
        <span className="text-[11.5px] text-ink-faint">Local only</span>
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primitives: toggle + plain input. Kept local so the modal stays self-
// contained; promote to shared UI if reused elsewhere.
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={
        "relative h-5 w-9 shrink-0 rounded-full transition " +
        (checked ? "bg-accent" : "bg-stroke")
      }
    >
      <span
        className={
          "absolute top-0.5 grid size-4 place-items-center rounded-full bg-white shadow transition " +
          (checked ? "left-[18px]" : "left-0.5")
        }
      />
    </button>
  );
}

function PlainInput({
  value,
  onChange,
  placeholder,
  width = 200,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width }}
      className="rounded-md border border-stroke bg-white px-2 py-1 text-[12px] text-ink placeholder:text-ink-faint outline-none transition focus:border-accent/60 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.08)]"
    />
  );
}
