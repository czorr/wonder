// ---------------------------------------------------------------------------
// Design system editor — renders inside the RightPanel when the "Design" tab
// is active and no element is selected. Binds to `useProject.tokens` and
// mutates via `updateTokens`, so every change goes through the store's
// history (undo/redo, dirty tracking).
//
// Visual language mirrors the element editor above (Group/Row/InputBox) so
// the right panel feels like one surface with two modes: "editing element"
// vs. "editing project".
//
// Intentional limits for v1:
//   - Color family names are free-form strings; we don't police the CSS
//     variable naming here. If a user enters "Hot Pink", they get
//     `--color-hot pink` which Tailwind ignores — that's on them. We could
//     slugify silently, but surprising the user is worse than a broken class.
//   - Font pickers are plain textareas-as-stacks. Picking "Inter" from a
//     dropdown is a nicer UX but requires a curated list we don't have yet.
//   - No drag-to-reorder on shades/radii — alphabetical order is fine for
//     the current volume.
// ---------------------------------------------------------------------------

import { ChevronDown, ChevronRight, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useProject } from "@/store/project";
import {
  defaultTokens,
  type ColorFamily,
  type Tokens,
} from "@/project/tokens";
import { ExtractDesignSystemModal } from "./ExtractDesignSystemModal";

// Families that the editor won't let you delete — the store+CSS emitter
// can survive their absence, but losing them silently would surprise users
// (and the AI agent, which relies on these roles existing in prompts).
const REQUIRED_FAMILIES = new Set(["primary", "neutral", "surface"]);

export function DesignSystemPanel() {
  const tokens = useProject((s) => s.tokens);
  const updateTokens = useProject((s) => s.updateTokens);
  const [extractOpen, setExtractOpen] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="border-b border-stroke px-3 py-3">
        <h2 className="text-[11px] font-semibold tracking-wide text-ink">
          Project design system
        </h2>
        <p className="mt-0.5 text-[10.5px] text-ink-faint leading-snug">
          Colors, fonts, and radii for the whole project. Saved to{" "}
          <span className="font-mono">design/tokens.json</span> and mirrored
          to <span className="font-mono">design/tokens.css</span>.
        </p>
        <button
          onClick={() => setExtractOpen(true)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-accent/30 bg-accent-tint px-2 py-1.5 text-[11px] font-medium text-accent-ink hover:bg-accent/10"
        >
          <Sparkles size={12} strokeWidth={1.75} />
          Extract from components
        </button>
      </div>

      {extractOpen ? (
        <ExtractDesignSystemModal onClose={() => setExtractOpen(false)} />
      ) : null}

      <ColorsSection tokens={tokens} update={updateTokens} />
      <FontsSection tokens={tokens} update={updateTokens} />
      <RadiiSection tokens={tokens} update={updateTokens} />

      <div className="flex items-center justify-end px-3 py-3">
        <button
          onClick={() => updateTokens(defaultTokens())}
          className="flex items-center gap-1 rounded-md border border-stroke bg-white px-2 py-1 text-[10.5px] text-ink-muted hover:text-ink hover:border-stroke-strong"
          title="Reset all tokens to Wonder defaults"
        >
          <RotateCcw size={11} strokeWidth={2} /> Reset to defaults
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared building blocks (local — not imported from RightPanel on purpose so
// that file stays focused on the element editor).
// ---------------------------------------------------------------------------

function Group({
  title,
  children,
  headerRight,
}: {
  title: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="border-b border-stroke">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-ink-soft"
        >
          <Chevron size={11} strokeWidth={2} className="text-ink-faint" />
          {title}
        </button>
        {headerRight}
      </div>
      {open ? (
        <div className="flex flex-col gap-2 px-3 pb-3">{children}</div>
      ) : null}
    </div>
  );
}

function AddButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-0.5 text-[10px] text-ink-muted hover:text-ink"
    >
      <Plus size={11} strokeWidth={2} /> {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

function ColorsSection({
  tokens,
  update,
}: {
  tokens: Tokens;
  update: (fn: (prev: Tokens) => Tokens) => void;
}) {
  const addFamily = () => {
    const name = promptFamilyName(tokens.colors);
    if (!name) return;
    update((prev) => ({
      ...prev,
      colors: {
        ...prev.colors,
        [name]: { DEFAULT: "#000000" },
      },
    }));
  };

  const families = Object.keys(tokens.colors);

  return (
    <Group
      title="Colors"
      headerRight={<AddButton label="Family" onClick={addFamily} />}
    >
      {families.map((family) => (
        <ColorFamilyEditor
          key={family}
          name={family}
          family={tokens.colors[family]}
          onChange={(next) =>
            update((prev) => ({
              ...prev,
              colors: { ...prev.colors, [family]: next },
            }))
          }
          onRename={(newName) => {
            if (!newName || newName === family) return;
            if (tokens.colors[newName]) return; // name collision — silently ignore
            update((prev) => {
              const { [family]: moving, ...rest } = prev.colors;
              return {
                ...prev,
                // Rebuild to preserve insertion order. Spreading `rest` first
                // and then appending the renamed family puts the renamed one
                // at the bottom — acceptable for a rename op.
                colors: { ...rest, [newName]: moving } as Tokens["colors"],
              };
            });
          }}
          onDelete={
            REQUIRED_FAMILIES.has(family)
              ? undefined
              : () =>
                  update((prev) => {
                    const { [family]: _, ...rest } = prev.colors;
                    return { ...prev, colors: rest as Tokens["colors"] };
                  })
          }
        />
      ))}
    </Group>
  );
}

function ColorFamilyEditor({
  name,
  family,
  onChange,
  onRename,
  onDelete,
}: {
  name: string;
  family: ColorFamily;
  onChange: (next: ColorFamily) => void;
  onRename: (next: string) => void;
  onDelete?: () => void;
}) {
  const [localName, setLocalName] = useState(name);
  // Re-sync local edits when the prop changes (undo/redo, external rename).
  // Ref-based guard avoids a useEffect round-trip, which would show a flash
  // of stale text for one frame after undo.
  const lastName = useRef(name);
  if (lastName.current !== name) {
    lastName.current = name;
    setLocalName(name);
  }

  const setShade = (variant: string, value: string) => {
    onChange({ ...family, [variant]: value });
  };

  const renameShade = (oldKey: string, newKey: string) => {
    if (!newKey || oldKey === newKey) return;
    if (newKey in family) return;
    const { [oldKey]: value, ...rest } = family;
    if (typeof value !== "string") return;
    onChange({ ...(rest as ColorFamily), [newKey]: value });
  };

  const removeShade = (variant: string) => {
    if (variant === "DEFAULT") return; // keep base
    const { [variant]: _, ...rest } = family;
    onChange(rest as ColorFamily);
  };

  const addShade = () => {
    const used = new Set(Object.keys(family));
    // Stable guesses first, then numbered fallback.
    const candidates = ["soft", "tint", "ink", "muted", "strong", "inverse"];
    let next = candidates.find((c) => !used.has(c));
    if (!next) {
      let i = 2;
      while (used.has(`var${i}`)) i++;
      next = `var${i}`;
    }
    onChange({ ...family, [next]: family.DEFAULT });
  };

  // Emit DEFAULT first so the swatch preview at the top always matches the
  // family's base color.
  const shadeKeys = Object.keys(family).sort((a, b) => {
    if (a === "DEFAULT") return -1;
    if (b === "DEFAULT") return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="rounded-md border border-stroke bg-panel-soft p-2">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Swatch color={family.DEFAULT} />
        <input
          data-family={name}
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={() => {
            const trimmed = localName.trim();
            if (!trimmed || trimmed === name) {
              setLocalName(name);
              return;
            }
            onRename(trimmed);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setLocalName(name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-ink outline-none focus:text-accent-ink"
        />
        <AddButton label="Shade" onClick={addShade} />
        {onDelete ? (
          <button
            onClick={onDelete}
            title="Remove family"
            className="text-ink-faint hover:text-rose-600"
          >
            <Trash2 size={11} strokeWidth={2} />
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        {shadeKeys.map((variant) => (
          <ShadeRow
            key={variant}
            variant={variant}
            value={family[variant]}
            cssVarHint={
              variant === "DEFAULT"
                ? `--color-${name}`
                : `--color-${name}-${variant}`
            }
            onValueChange={(v) => setShade(variant, v)}
            onRename={
              variant === "DEFAULT"
                ? undefined
                : (newKey) => renameShade(variant, newKey)
            }
            onRemove={variant === "DEFAULT" ? undefined : () => removeShade(variant)}
          />
        ))}
      </div>
    </div>
  );
}

function ShadeRow({
  variant,
  value,
  cssVarHint,
  onValueChange,
  onRename,
  onRemove,
}: {
  variant: string;
  value: string;
  cssVarHint: string;
  onValueChange: (next: string) => void;
  onRename?: (next: string) => void;
  onRemove?: () => void;
}) {
  const [localKey, setLocalKey] = useState(variant);
  const [localValue, setLocalValue] = useState(value);
  // Keep local state in sync when parent changes (e.g. undo).
  const lastPropKey = useRef(variant);
  const lastPropValue = useRef(value);
  if (lastPropKey.current !== variant) {
    lastPropKey.current = variant;
    setLocalKey(variant);
  }
  if (lastPropValue.current !== value) {
    lastPropValue.current = value;
    setLocalValue(value);
  }

  // Native <input type="color"> requires a 7-char "#rrggbb". Colors can be
  // any CSS value (hsl, oklch, shorthand hex), so we fall back to black and
  // still let the text input carry the canonical value.
  const colorInputValue = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={colorInputValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          onValueChange(e.target.value);
        }}
        className="size-6 shrink-0 cursor-pointer rounded border border-stroke bg-white p-0.5"
        title="Pick color"
      />
      <input
        value={localKey}
        readOnly={!onRename}
        onChange={(e) => setLocalKey(e.target.value)}
        onBlur={() => {
          if (!onRename) return;
          const trimmed = localKey.trim();
          if (!trimmed || trimmed === variant) {
            setLocalKey(variant);
            return;
          }
          onRename(trimmed);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setLocalKey(variant);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={
          "h-6 w-[72px] shrink-0 rounded border border-stroke bg-white px-1.5 text-[10.5px] font-mono text-ink outline-none focus:border-accent " +
          (onRename ? "" : "text-ink-faint")
        }
        title={onRename ? "Rename shade" : "DEFAULT shade cannot be renamed"}
      />
      <input
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          if (localValue !== value) onValueChange(localValue);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="#rrggbb"
        className="h-6 min-w-0 flex-1 rounded border border-stroke bg-white px-1.5 text-[10.5px] font-mono text-ink outline-none focus:border-accent"
      />
      <span
        title={cssVarHint}
        className="shrink-0 truncate font-mono text-[9.5px] text-ink-faint max-w-[72px]"
      >
        {cssVarHint}
      </span>
      {onRemove ? (
        <button
          onClick={onRemove}
          title="Remove shade"
          className="text-ink-faint hover:text-rose-600"
        >
          <Trash2 size={10} strokeWidth={2} />
        </button>
      ) : (
        <span className="w-3 shrink-0" />
      )}
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="size-4 shrink-0 rounded-[4px] border border-stroke"
      style={{ backgroundColor: color }}
    />
  );
}

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

function FontsSection({
  tokens,
  update,
}: {
  tokens: Tokens;
  update: (fn: (prev: Tokens) => Tokens) => void;
}) {
  const toggleDisplay = () => {
    update((prev) => {
      if (prev.fonts.display !== undefined) {
        const { display: _, ...rest } = prev.fonts;
        return { ...prev, fonts: rest };
      }
      return {
        ...prev,
        fonts: {
          ...prev.fonts,
          display: prev.fonts.sans,
        },
      };
    });
  };

  return (
    <Group
      title="Typography"
      headerRight={
        <button
          onClick={toggleDisplay}
          className="flex items-center gap-0.5 text-[10px] text-ink-muted hover:text-ink"
        >
          {tokens.fonts.display !== undefined ? (
            <>
              <Trash2 size={10} strokeWidth={2} /> Display
            </>
          ) : (
            <>
              <Plus size={11} strokeWidth={2} /> Display
            </>
          )}
        </button>
      }
    >
      <FontRow
        label="Sans"
        cssVarHint="--font-sans"
        value={tokens.fonts.sans}
        onCommit={(v) =>
          update((prev) => ({ ...prev, fonts: { ...prev.fonts, sans: v } }))
        }
      />
      <FontRow
        label="Mono"
        cssVarHint="--font-mono"
        value={tokens.fonts.mono}
        onCommit={(v) =>
          update((prev) => ({ ...prev, fonts: { ...prev.fonts, mono: v } }))
        }
      />
      {tokens.fonts.display !== undefined ? (
        <FontRow
          label="Display"
          cssVarHint="--font-display"
          value={tokens.fonts.display}
          onCommit={(v) =>
            update((prev) => ({
              ...prev,
              fonts: { ...prev.fonts, display: v },
            }))
          }
        />
      ) : null}
    </Group>
  );
}

function FontRow({
  label,
  value,
  cssVarHint,
  onCommit,
}: {
  label: string;
  value: string;
  cssVarHint: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const lastProp = useRef(value);
  if (lastProp.current !== value) {
    lastProp.current = value;
    setLocal(value);
  }
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-ink-muted">{label}</span>
        <span className="font-mono text-[9.5px] text-ink-faint">{cssVarHint}</span>
      </div>
      <textarea
        rows={2}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onCommit(local);
        }}
        spellCheck={false}
        placeholder='e.g. "Inter", ui-sans-serif, system-ui'
        className="w-full resize-none rounded-md border border-stroke bg-white px-2 py-1 font-mono text-[10.5px] text-ink outline-none focus:border-accent"
        style={{ fontFamily: value }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radii
// ---------------------------------------------------------------------------

function RadiiSection({
  tokens,
  update,
}: {
  tokens: Tokens;
  update: (fn: (prev: Tokens) => Tokens) => void;
}) {
  const addRadius = () => {
    const used = new Set(Object.keys(tokens.radii));
    const candidates = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "full"];
    let next = candidates.find((c) => !used.has(c));
    if (!next) {
      let i = 2;
      while (used.has(`r${i}`)) i++;
      next = `r${i}`;
    }
    update((prev) => ({
      ...prev,
      radii: { ...prev.radii, [next!]: "0.5rem" },
    }));
  };

  return (
    <Group
      title="Radii"
      headerRight={<AddButton label="Radius" onClick={addRadius} />}
    >
      {Object.entries(tokens.radii).map(([key, value]) => (
        <RadiusRow
          key={key}
          name={key}
          value={value}
          onValueChange={(next) =>
            update((prev) => ({
              ...prev,
              radii: { ...prev.radii, [key]: next },
            }))
          }
          onRename={(newKey) => {
            if (!newKey || newKey === key || newKey in tokens.radii) return;
            update((prev) => {
              const { [key]: v, ...rest } = prev.radii;
              return {
                ...prev,
                radii: { ...rest, [newKey]: v },
              };
            });
          }}
          onRemove={() =>
            update((prev) => {
              const { [key]: _, ...rest } = prev.radii;
              return { ...prev, radii: rest };
            })
          }
        />
      ))}
      {Object.keys(tokens.radii).length === 0 ? (
        <div className="text-[10.5px] text-ink-faint">No radii defined.</div>
      ) : null}
    </Group>
  );
}

function RadiusRow({
  name,
  value,
  onValueChange,
  onRename,
  onRemove,
}: {
  name: string;
  value: string;
  onValueChange: (v: string) => void;
  onRename: (v: string) => void;
  onRemove: () => void;
}) {
  const [localKey, setLocalKey] = useState(name);
  const [localValue, setLocalValue] = useState(value);
  const lastKey = useRef(name);
  const lastValue = useRef(value);
  if (lastKey.current !== name) {
    lastKey.current = name;
    setLocalKey(name);
  }
  if (lastValue.current !== value) {
    lastValue.current = value;
    setLocalValue(value);
  }

  // Show a small preview square using the value as a border-radius — quick
  // visual feedback that "0.75rem" actually rounds the way the user wants.
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="size-5 shrink-0 border border-accent bg-accent-tint"
        style={{ borderRadius: value }}
        title={`Preview: ${value}`}
      />
      <input
        value={localKey}
        onChange={(e) => setLocalKey(e.target.value)}
        onBlur={() => {
          const trimmed = localKey.trim();
          if (!trimmed || trimmed === name) {
            setLocalKey(name);
            return;
          }
          onRename(trimmed);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setLocalKey(name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-6 w-[72px] shrink-0 rounded border border-stroke bg-white px-1.5 text-[10.5px] font-mono text-ink outline-none focus:border-accent"
      />
      <input
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          if (localValue !== value) onValueChange(localValue);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="0.5rem"
        className="h-6 min-w-0 flex-1 rounded border border-stroke bg-white px-1.5 text-[10.5px] font-mono text-ink outline-none focus:border-accent"
      />
      <span className="shrink-0 font-mono text-[9.5px] text-ink-faint max-w-[72px] truncate">
        --radius-{name}
      </span>
      <button
        onClick={onRemove}
        title="Remove radius"
        className="text-ink-faint hover:text-rose-600"
      >
        <Trash2 size={10} strokeWidth={2} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function promptFamilyName(
  existing: Record<string, unknown>,
): string | null {
  // Keep it boring for v1 — native prompt. A styled modal is a DS-7 polish item.
  const input = window.prompt(
    "New color family name\n\nLowercase, no spaces. Examples: accent, success, danger.",
  );
  if (input == null) return null;
  const name = input.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!name) return null;
  if (name in existing) {
    window.alert(`"${name}" already exists.`);
    return null;
  }
  return name;
}
