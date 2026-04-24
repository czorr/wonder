// ---------------------------------------------------------------------------
// TokensStudio — full-screen design-token editor.
//
// Mounted by Shell when `useLayout.centerView === "tokens"` (flipped on by
// clicking the `tailwind.config.ts` entry in LeftSidebar). Replaces both
// CanvasArea and CodePanel for the session — the left/right sidebars stay
// so the user can still navigate files or check inspector state.
//
// Layout:
//   ┌─────────────────────────────────────────────────────────────────┐
//   │ ← back · tailwind.config.ts · design/tokens.json        Extract │
//   ├────────────────────────────────────────────┬────────────────────┤
//   │ Colors                                     │                    │
//   │  primary   [■] [■] [■] [■]                 │   /* … */          │
//   │  neutral   …                               │   @theme {         │
//   │                                            │     --color-…      │
//   │ Typography                                 │   }                │
//   │  sans   [live preview text]                │                    │
//   │                                            │  (Monaco, live     │
//   │ Radii                                      │   read-only)       │
//   │  md    ████ 0.5rem                         │                    │
//   └────────────────────────────────────────────┴────────────────────┘
//
// Why reimplement instead of reusing DesignSystemPanel:
//   - The sidebar panel is tuned for a 320-ish column (cramped rows,
//     tiny swatches). Full-screen has room for big color cards, live
//     font previews, and radius render samples — a proper studio vs.
//     a properties inspector.
//   - Keeps the sidebar panel unchanged so users who want a compact
//     right-sidebar workflow still get it.
// ---------------------------------------------------------------------------

import Editor, { type BeforeMount } from "@monaco-editor/react";
import { useMemo, useRef, useState } from "react";
import { AppIcon } from "@/app/icons";
import { useLayout } from "@/store/layout";
import { useProject } from "@/store/project";
import {
  defaultTokens,
  tokensToCss,
  type ColorFamily,
  type Tokens,
} from "@/project/tokens";

/**
 * Which palette the Colors section is currently displaying / writing into.
 *
 * "light" edits land in `tokens.colors[family][variant]` — the base palette.
 * "dark"  edits land in `tokens.darkColors[family][variant]` as sparse
 *         overrides; unset shades inherit the light value at runtime via the
 *         `.dark { --color-* }` cascade (see `tokensToSandboxCss`).
 *
 * Structural ops (rename/add/delete families or shades) always target the
 * light structure because the shape is shared — there's no notion of a
 * "dark-only shade". Those controls are disabled when `mode === "dark"` to
 * keep the mental model honest.
 */
type ColorsMode = "light" | "dark";

// Roles the emitter relies on — we allow editing but not deletion.
const REQUIRED_FAMILIES = new Set(["primary", "neutral", "surface"]);

// Variant-key suggestions when adding a new shade to an existing family.
// Stable names first, numbered fallback after.
const SHADE_CANDIDATES = ["soft", "tint", "ink", "muted", "strong", "inverse"];
const RADIUS_CANDIDATES = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "full"];

export function TokensStudio() {
  const tokens = useProject((s) => s.tokens);
  const updateTokens = useProject((s) => s.updateTokens);
  const setCenterView = useLayout((s) => s.setCenterView);
  // Modal state lives in the layout store so the native Assistant menu can
  // open it without caring which panel is currently visible. Shell mounts
  // the modal — we just flip the flag.
  const openExtract = useLayout((s) => s.openExtractDesignSystem);

  // Live tokens.css preview. Recomputed on every token change — cheap since
  // tokensToCss is pure string assembly and the input is tiny.
  const generatedCss = useMemo(() => tokensToCss(tokens), [tokens]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <StudioHeader
        onClose={() => setCenterView("canvas")}
        onExtract={openExtract}
        onReset={() => updateTokens(defaultTokens())}
      />

      <div className="flex min-h-0 flex-1">
        {/* Scrollable visual editor — left 60% */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[900px] flex-col gap-8 px-8 py-8">
            <ColorsSection tokens={tokens} update={updateTokens} />
            <FontsSection tokens={tokens} update={updateTokens} />
            <RadiiSection tokens={tokens} update={updateTokens} />
          </div>
        </div>

        {/* Live CSS preview — right 40% */}
        <CssPreview css={generatedCss} />
      </div>

      {/* Modal is mounted once at the Shell level (see Shell.tsx) — no
          local portal here so menu + button share one stack. */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header bar
// ---------------------------------------------------------------------------

function StudioHeader({
  onClose,
  onExtract,
  onReset,
}: {
  onClose: () => void;
  onExtract: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-stroke bg-panel px-3">
      <button
        onClick={onClose}
        title="Back to canvas"
        className="grid size-7 place-items-center rounded-md text-ink-muted hover:bg-panel-soft hover:text-ink transition"
      >
        <AppIcon name="ArrowLeft" size={14} />
      </button>

      <div className="flex items-center gap-2 text-[12px]">
        <div className="grid size-5 place-items-center rounded-md bg-accent-tint text-accent">
          <AppIcon name="FileCode" size={12} />
        </div>
        <span className="font-medium text-ink">tailwind.config.ts</span>
        <span className="text-ink-faint">·</span>
        <span className="font-mono text-[11px] text-ink-faint">
          design/tokens.json
        </span>
      </div>

      <div className="flex-1" />

      <button
        onClick={onExtract}
        className="flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-tint px-2.5 py-1 text-[11px] font-medium text-accent-ink hover:bg-accent/15"
      >
        <AppIcon name="Sparkles" size={12} />
        Extract from components
      </button>
      <button
        onClick={onReset}
        title="Reset all tokens to Wonder defaults"
        className="flex items-center gap-1.5 rounded-md border border-stroke bg-panel px-2.5 py-1 text-[11px] text-ink-muted hover:text-ink hover:border-stroke-strong"
      >
        <AppIcon name="Rotate" size={11} />
        Reset
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section shell — shared header + content layout for Colors/Fonts/Radii.
// ---------------------------------------------------------------------------

function Section({
  title,
  description,
  headerRight,
  children,
}: {
  title: string;
  description: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between border-b border-stroke pb-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">
            {title}
          </h2>
          <p className="mt-0.5 text-[11.5px] text-ink-faint">{description}</p>
        </div>
        {headerRight}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Colors
//
// One card per family with the family name inline-renameable. Shades are
// rendered as big square swatches with a color picker overlay — click the
// swatch, pick a color, done. Below each swatch, a compact row holds the
// variant key + hex text input + CSS var hint.
// ---------------------------------------------------------------------------

function ColorsSection({
  tokens,
  update,
}: {
  tokens: Tokens;
  update: (fn: (prev: Tokens) => Tokens) => void;
}) {
  const families = Object.keys(tokens.colors);
  const [mode, setMode] = useState<ColorsMode>("light");
  const isDark = mode === "dark";

  const addFamily = () => {
    // Pick an unused generic name so the row appears immediately; user renames.
    const used = new Set(families);
    let name = "accent";
    let i = 2;
    while (used.has(name)) name = `accent${i++}`;
    update((prev) => ({
      ...prev,
      colors: { ...prev.colors, [name]: { DEFAULT: "#7c3aed" } },
    }));
  };

  // Rename a family across BOTH palettes — if the user renamed "primary" →
  // "brand" and we forgot to move the dark override, the dark block would
  // silently stop overriding anything (wrong key) and the user would have
  // no idea why the canvas stopped flipping. Keep the two palettes in sync.
  const renameFamily = (from: string, to: string) => {
    if (!to || to === from) return;
    if (tokens.colors[to]) return;
    update((prev) => {
      const { [from]: moving, ...rest } = prev.colors;
      const nextColors = {
        ...rest,
        [to]: moving,
      } as Tokens["colors"];
      let nextDark = prev.darkColors;
      if (nextDark && from in nextDark) {
        const { [from]: movingDark, ...restDark } = nextDark;
        nextDark = { ...restDark, [to]: movingDark };
      }
      return { ...prev, colors: nextColors, darkColors: nextDark };
    });
  };

  const deleteFamily = (family: string) => {
    update((prev) => {
      const { [family]: _, ...restColors } = prev.colors;
      let nextDark = prev.darkColors;
      if (nextDark && family in nextDark) {
        const { [family]: __, ...restDark } = nextDark;
        nextDark = restDark;
      }
      return {
        ...prev,
        colors: restColors as Tokens["colors"],
        darkColors: nextDark,
      };
    });
  };

  // Write a single dark override. Lazily materializes `darkColors` and the
  // family sub-object so callers don't have to care whether either existed.
  const setDarkShade = (family: string, variant: string, value: string) => {
    update((prev) => {
      const prevDark = prev.darkColors ?? {};
      const prevFamilyDark = prevDark[family] ?? {};
      return {
        ...prev,
        darkColors: {
          ...prevDark,
          [family]: { ...prevFamilyDark, [variant]: value },
        },
      };
    });
  };

  // Drop a single dark override (back to "inherit light"). Cleans up empty
  // families and the top-level `darkColors` key so the JSON stays tidy and
  // re-saves don't leave dangling `{}` shells.
  const clearDarkShade = (family: string, variant: string) => {
    update((prev) => {
      if (!prev.darkColors || !prev.darkColors[family]) return prev;
      const { [variant]: _, ...restShades } = prev.darkColors[family];
      const { [family]: __, ...restFamilies } = prev.darkColors;
      let nextDark: Tokens["darkColors"];
      if (Object.keys(restShades).length > 0) {
        nextDark = { ...restFamilies, [family]: restShades };
      } else {
        nextDark = Object.keys(restFamilies).length > 0
          ? restFamilies
          : undefined;
      }
      return { ...prev, darkColors: nextDark };
    });
  };

  return (
    <Section
      title="Colors"
      description={
        isDark
          ? "Dark palette overrides. Unset shades inherit the light value at runtime via the .dark cascade."
          : "Color families become Tailwind utilities: bg-primary, text-primary-ink, border-neutral-soft…"
      }
      headerRight={
        <div className="flex items-center gap-2">
          <PaletteModeToggle mode={mode} onChange={setMode} />
          <button
            onClick={addFamily}
            disabled={isDark}
            title={isDark ? "Switch to Light to change structure" : undefined}
            className="flex items-center gap-1 rounded-md border border-stroke bg-panel px-2 py-1 text-[11px] text-ink-muted transition hover:text-ink hover:border-stroke-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-ink-muted disabled:hover:border-stroke"
          >
            <AppIcon name="Plus" size={11} /> Add family
          </button>
        </div>
      }
    >
      {families.map((family) => (
        <ColorFamilyCard
          key={family}
          name={family}
          family={tokens.colors[family]}
          darkFamily={tokens.darkColors?.[family]}
          mode={mode}
          onChange={(next) =>
            update((prev) => ({
              ...prev,
              colors: { ...prev.colors, [family]: next },
            }))
          }
          onDarkShadeChange={(variant, value) =>
            setDarkShade(family, variant, value)
          }
          onClearDarkShade={(variant) => clearDarkShade(family, variant)}
          onRename={(newName) => renameFamily(family, newName)}
          onDelete={
            REQUIRED_FAMILIES.has(family) ? undefined : () => deleteFamily(family)
          }
        />
      ))}
    </Section>
  );
}

/**
 * Two-pill toggle that flips the Colors editor between light and dark
 * palettes. Deliberately matches the `LibraryPanel` filter chips visually —
 * users already know "pill group = view switcher" from elsewhere in the app.
 */
function PaletteModeToggle({
  mode,
  onChange,
}: {
  mode: ColorsMode;
  onChange: (next: ColorsMode) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-stroke bg-panel p-0.5">
      {(
        [
          ["light", "Light", "Sun"],
          ["dark", "Dark", "Moon"],
        ] as const
      ).map(([key, label, icon]) => {
        const active = mode === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={
              "flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition " +
              (active
                ? "bg-ink text-panel"
                : "text-ink-muted hover:bg-panel-soft hover:text-ink")
            }
          >
            <AppIcon name={icon} size={11} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ColorFamilyCard({
  name,
  family,
  darkFamily,
  mode,
  onChange,
  onDarkShadeChange,
  onClearDarkShade,
  onRename,
  onDelete,
}: {
  name: string;
  family: ColorFamily;
  /** Sparse dark overrides for this family. May be undefined (no overrides). */
  darkFamily: { [variant: string]: string } | undefined;
  mode: ColorsMode;
  onChange: (next: ColorFamily) => void;
  onDarkShadeChange: (variant: string, value: string) => void;
  onClearDarkShade: (variant: string) => void;
  onRename: (next: string) => void;
  onDelete?: () => void;
}) {
  const isDark = mode === "dark";
  // Inline rename state — mirror pattern from DesignSystemPanel.
  const [localName, setLocalName] = useState(name);
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
    if (variant === "DEFAULT") return;
    const { [variant]: _, ...rest } = family;
    onChange(rest as ColorFamily);
  };

  const addShade = () => {
    const used = new Set(Object.keys(family));
    let next = SHADE_CANDIDATES.find((c) => !used.has(c));
    if (!next) {
      let i = 2;
      while (used.has(`var${i}`)) i++;
      next = `var${i}`;
    }
    onChange({ ...family, [next]: family.DEFAULT });
  };

  const shadeKeys = Object.keys(family).sort((a, b) => {
    if (a === "DEFAULT") return -1;
    if (b === "DEFAULT") return 1;
    return a.localeCompare(b);
  });

  // Swatch color on the family row header: in dark mode, prefer the dark
  // DEFAULT override if the user set one — so the header color reflects
  // what the canvas is actually painting. Falls back to light DEFAULT
  // otherwise.
  const headerSwatch =
    isDark && darkFamily?.DEFAULT ? darkFamily.DEFAULT : family.DEFAULT;

  // Structural controls (rename, add shade, remove family) edit the light
  // STRUCTURE, which is shared across both palettes. Freezing them in dark
  // mode keeps the mental model honest: "Dark is a value overlay, not a
  // separate schema." If the user wants to rename or add a shade, they
  // flip back to Light.
  const structuralDisabledTitle = isDark
    ? "Switch to Light to change structure"
    : undefined;

  return (
    <div className="rounded-xl border border-stroke bg-panel p-4 shadow-[0_1px_0_0_rgba(0,0,0,0.02)]">
      <div className="mb-4 flex items-center gap-2">
        <span
          className="size-6 shrink-0 rounded-md border border-stroke"
          style={{ backgroundColor: headerSwatch }}
        />
        <input
          value={localName}
          readOnly={isDark}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={() => {
            if (isDark) return;
            const trimmed = localName.trim();
            if (!trimmed || trimmed === name) {
              setLocalName(name);
              return;
            }
            onRename(trimmed);
          }}
          onKeyDown={(e) => {
            if (isDark) return;
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setLocalName(name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          title={structuralDisabledTitle}
          className={
            "min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none " +
            (isDark
              ? "cursor-not-allowed text-ink-muted"
              : "text-ink focus:text-accent-ink")
          }
        />
        <span className="font-mono text-[10.5px] text-ink-faint">
          {shadeKeys.length} shade{shadeKeys.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={addShade}
          disabled={isDark}
          title={structuralDisabledTitle}
          className="flex items-center gap-1 rounded-md border border-stroke bg-panel-soft px-2 py-1 text-[10.5px] text-ink-muted transition hover:text-ink hover:border-stroke-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-ink-muted disabled:hover:border-stroke"
        >
          <AppIcon name="Plus" size={10} /> Shade
        </button>
        {onDelete ? (
          <button
            onClick={onDelete}
            disabled={isDark}
            title={isDark ? structuralDisabledTitle : "Remove family"}
            className="grid size-6 place-items-center rounded-md text-ink-faint transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
          >
            <AppIcon name="Trash" size={11} />
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {shadeKeys.map((variant) => {
          const lightValue = family[variant];
          const darkOverride = darkFamily?.[variant];
          // In dark mode the tile DISPLAYS the effective dark value (the
          // override if set, otherwise the inherited light value). Edits go
          // to `onDarkShadeChange` — the first edit materializes an
          // override even if the user was just staring at the inherited
          // color a moment ago.
          const effectiveValue = isDark
            ? darkOverride ?? lightValue
            : lightValue;
          return (
            <ShadeTile
              key={variant}
              family={name}
              variant={variant}
              value={effectiveValue}
              mode={mode}
              hasDarkOverride={darkOverride !== undefined}
              inheritedLightValue={isDark ? lightValue : undefined}
              onValueChange={(v) => {
                if (isDark) onDarkShadeChange(variant, v);
                else setShade(variant, v);
              }}
              onClearDarkOverride={
                isDark && darkOverride !== undefined
                  ? () => onClearDarkShade(variant)
                  : undefined
              }
              onRename={
                isDark || variant === "DEFAULT"
                  ? undefined
                  : (newKey) => renameShade(variant, newKey)
              }
              onRemove={
                isDark || variant === "DEFAULT"
                  ? undefined
                  : () => removeShade(variant)
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function ShadeTile({
  family,
  variant,
  value,
  mode,
  hasDarkOverride,
  inheritedLightValue,
  onValueChange,
  onClearDarkOverride,
  onRename,
  onRemove,
}: {
  family: string;
  variant: string;
  value: string;
  mode: ColorsMode;
  /**
   * Dark mode: does this shade have a user-set override? Drives the
   * "inherited from light" badge (when false) and the clear button
   * (when true).
   *
   * Ignored in light mode.
   */
  hasDarkOverride: boolean;
  /** Light value shown as a tooltip on the inherit badge. Dark mode only. */
  inheritedLightValue: string | undefined;
  onValueChange: (next: string) => void;
  /** Only supplied in dark mode when an override exists. */
  onClearDarkOverride?: () => void;
  onRename?: (next: string) => void;
  onRemove?: () => void;
}) {
  const isDark = mode === "dark";
  const isInheritedInDark = isDark && !hasDarkOverride;
  const [localKey, setLocalKey] = useState(variant);
  const [localValue, setLocalValue] = useState(value);
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

  // Native <input type="color"> wants "#rrggbb". Anything else (hsl/oklch/
  // shorthand) we fall back to black — the text input still carries the
  // canonical value the user typed.
  const colorInputValue = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  const cssVar =
    variant === "DEFAULT"
      ? `--color-${family}`
      : `--color-${family}-${variant}`;
  const baseUtility =
    variant === "DEFAULT" ? `bg-${family}` : `bg-${family}-${variant}`;
  // Dark mode hints the `dark:` Tailwind variant — that's what a user
  // would actually type to target this shade. In light mode the bare
  // utility is correct. Keeping the hint honest matters: it's the most
  // common thing users copy out of the studio.
  const utility = isDark ? `dark:${baseUtility}` : baseUtility;

  return (
    <div
      className={
        "group relative flex flex-col gap-1.5 rounded-lg border p-2 transition " +
        (isDark
          ? "border-stroke bg-panel-soft/70 hover:border-accent/40"
          : "border-stroke bg-panel-soft hover:border-stroke-strong")
      }
    >
      {/* Big swatch — the color picker lives on top so clicks-to-edit just work. */}
      <label
        className="relative block h-[72px] cursor-pointer overflow-hidden rounded-md border border-stroke"
        style={{ backgroundColor: value }}
        title={
          isInheritedInDark
            ? `Inherits light — ${value}. Click to set a dark override.`
            : `Click to pick — ${value}`
        }
      >
        <input
          type="color"
          value={colorInputValue}
          onChange={(e) => {
            setLocalValue(e.target.value);
            onValueChange(e.target.value);
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
        {/* Diagonal hatching: makes "inherited" visually unmistakable even
            when the underlying color is similar to an override. Purely
            decorative — doesn't block the color picker underneath. */}
        {isInheritedInDark ? (
          <div
            className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(0,0,0,0.35) 0 6px, transparent 6px 12px)",
            }}
          />
        ) : null}
        {/* Top-left corner badge: either "inherit" (dark mode, no override)
            or an accent dot (dark mode, override exists). Light mode: no
            badge — there's only one palette there. */}
        {isDark ? (
          isInheritedInDark ? (
            <span
              title={
                inheritedLightValue
                  ? `Inheriting light (${inheritedLightValue})`
                  : "Inheriting light"
              }
              className="pointer-events-none absolute left-1 top-1 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[9px] font-medium text-white backdrop-blur-sm"
            >
              inherit
            </span>
          ) : (
            <span
              title="Dark override set"
              className="pointer-events-none absolute left-1 top-1 grid size-4 place-items-center rounded-full bg-accent text-[8px] text-panel shadow"
            >
              <AppIcon name="Moon" size={9} />
            </span>
          )
        ) : null}
        {/* Clear dark override — reverts to inheriting light. Only shown in
            dark mode when an override exists. */}
        {onClearDarkOverride ? (
          <button
            onClick={(e) => {
              e.preventDefault();
              onClearDarkOverride();
            }}
            title="Clear dark override (inherit light)"
            className="absolute right-1 top-1 grid size-5 place-items-center rounded bg-white/80 text-ink-faint opacity-0 backdrop-blur-sm transition hover:text-ink group-hover:opacity-100"
          >
            <AppIcon name="Rotate" size={10} />
          </button>
        ) : null}
        {onRemove ? (
          <button
            onClick={(e) => {
              e.preventDefault();
              onRemove();
            }}
            title="Remove shade"
            className="absolute right-1 top-1 grid size-5 place-items-center rounded bg-white/80 text-ink-faint opacity-0 backdrop-blur-sm transition hover:text-rose-600 group-hover:opacity-100"
          >
            <AppIcon name="X" size={10} />
          </button>
        ) : null}
      </label>

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
        title={onRename ? "Rename shade" : "DEFAULT shade cannot be renamed"}
        className={
          "rounded border border-stroke bg-panel px-1.5 py-1 font-mono text-[11px] outline-none focus:border-accent " +
          (onRename ? "text-ink" : "text-ink-faint")
        }
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
        title={
          isInheritedInDark
            ? "Inheriting light — edits here create a dark override"
            : undefined
        }
        className={
          "rounded border bg-panel px-1.5 py-1 font-mono text-[11px] outline-none focus:border-accent " +
          (isInheritedInDark
            ? "border-dashed border-stroke text-ink-muted italic"
            : "border-stroke text-ink")
        }
      />

      <div className="flex flex-col gap-0.5 pt-0.5">
        <span
          title="Tailwind v4 CSS variable"
          className="truncate font-mono text-[10px] text-ink-faint"
        >
          {cssVar}
        </span>
        <span
          title="Example utility class"
          className="truncate font-mono text-[10px] text-accent-ink/80"
        >
          {utility}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typography — each stack gets a big live preview using its own font-family.
// Displaying sample text in the declared font gives the user an instant
// "did my stack load?" signal without having to preview a component.
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
        fonts: { ...prev.fonts, display: prev.fonts.sans },
      };
    });
  };

  return (
    <Section
      title="Typography"
      description="Font stacks map to --font-* variables. Tailwind picks up font-sans, font-mono, and (optionally) font-display."
      headerRight={
        <button
          onClick={toggleDisplay}
          className="flex items-center gap-1 rounded-md border border-stroke bg-panel px-2 py-1 text-[11px] text-ink-muted hover:text-ink hover:border-stroke-strong"
        >
          {tokens.fonts.display !== undefined ? (
            <>
              <AppIcon name="Trash" size={10} /> Remove display
            </>
          ) : (
            <>
              <AppIcon name="Plus" size={11} /> Add display
            </>
          )}
        </button>
      }
    >
      <FontCard
        label="Sans"
        cssVar="--font-sans"
        utility="font-sans"
        value={tokens.fonts.sans}
        onCommit={(v) =>
          update((prev) => ({ ...prev, fonts: { ...prev.fonts, sans: v } }))
        }
      />
      <FontCard
        label="Mono"
        cssVar="--font-mono"
        utility="font-mono"
        sampleText="const tokens = { primary: '#10b981' };"
        value={tokens.fonts.mono}
        onCommit={(v) =>
          update((prev) => ({ ...prev, fonts: { ...prev.fonts, mono: v } }))
        }
      />
      {tokens.fonts.display !== undefined ? (
        <FontCard
          label="Display"
          cssVar="--font-display"
          utility="font-display"
          sampleText="Design systems, live."
          sampleSize={40}
          value={tokens.fonts.display}
          onCommit={(v) =>
            update((prev) => ({
              ...prev,
              fonts: { ...prev.fonts, display: v },
            }))
          }
        />
      ) : null}
    </Section>
  );
}

function FontCard({
  label,
  cssVar,
  utility,
  value,
  onCommit,
  sampleText = "The quick brown fox jumps over the lazy dog — 0123456789",
  sampleSize = 22,
}: {
  label: string;
  cssVar: string;
  utility: string;
  value: string;
  onCommit: (v: string) => void;
  sampleText?: string;
  sampleSize?: number;
}) {
  const [local, setLocal] = useState(value);
  const lastProp = useRef(value);
  if (lastProp.current !== value) {
    lastProp.current = value;
    setLocal(value);
  }

  return (
    <div className="rounded-xl border border-stroke bg-panel p-4">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        <span className="font-mono text-[10.5px] text-ink-faint">{cssVar}</span>
        <div className="flex-1" />
        <span className="font-mono text-[10.5px] text-accent-ink/80">
          {utility}
        </span>
      </div>

      <div
        className="mt-3 rounded-lg border border-stroke bg-panel-soft/60 px-4 py-5 text-ink"
        style={{ fontFamily: value, fontSize: sampleSize, lineHeight: 1.25 }}
      >
        {sampleText}
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
        className="mt-3 w-full resize-none rounded-md border border-stroke bg-panel px-2.5 py-2 font-mono text-[11px] text-ink outline-none focus:border-accent"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radii — each entry renders a square preview at the declared radius so the
// value is immediately visual. Hand-edit value next to it.
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
    let next = RADIUS_CANDIDATES.find((c) => !used.has(c));
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
    <Section
      title="Radii"
      description="Border-radius scale. Keys become utilities: rounded-sm, rounded-md, rounded-full…"
      headerRight={
        <button
          onClick={addRadius}
          className="flex items-center gap-1 rounded-md border border-stroke bg-panel px-2 py-1 text-[11px] text-ink-muted hover:text-ink hover:border-stroke-strong"
        >
          <AppIcon name="Plus" size={11} /> Add radius
        </button>
      }
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {Object.entries(tokens.radii).map(([key, value]) => (
          <RadiusTile
            key={key}
            name={key}
            value={value}
            onRename={(newName) => {
              if (!newName || newName === key) return;
              if (tokens.radii[newName]) return;
              update((prev) => {
                const { [key]: v, ...rest } = prev.radii;
                return { ...prev, radii: { ...rest, [newName]: v! } };
              });
            }}
            onChange={(v) =>
              update((prev) => ({
                ...prev,
                radii: { ...prev.radii, [key]: v },
              }))
            }
            onDelete={() =>
              update((prev) => {
                const { [key]: _, ...rest } = prev.radii;
                return { ...prev, radii: rest };
              })
            }
          />
        ))}
      </div>
    </Section>
  );
}

function RadiusTile({
  name,
  value,
  onRename,
  onChange,
  onDelete,
}: {
  name: string;
  value: string;
  onRename: (next: string) => void;
  onChange: (next: string) => void;
  onDelete: () => void;
}) {
  const [localName, setLocalName] = useState(name);
  const [localValue, setLocalValue] = useState(value);
  const lastName = useRef(name);
  const lastValue = useRef(value);
  if (lastName.current !== name) {
    lastName.current = name;
    setLocalName(name);
  }
  if (lastValue.current !== value) {
    lastValue.current = value;
    setLocalValue(value);
  }

  return (
    <div className="group relative flex flex-col gap-2 rounded-lg border border-stroke bg-panel p-3">
      {/* Preview — a large square with the declared radius applied. Accent tint
          fill so the shape reads even on white page backgrounds. */}
      <div
        className="grid h-20 place-items-center border border-accent/20 bg-accent-tint"
        style={{ borderRadius: value }}
      >
        <span className="font-mono text-[10.5px] text-accent-ink/70">
          rounded-{name}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <input
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
          className="h-7 w-[68px] shrink-0 rounded border border-stroke bg-panel px-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent"
        />
        <input
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => {
            if (localValue !== value) onChange(localValue);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="0.5rem"
          className="h-7 min-w-0 flex-1 rounded border border-stroke bg-panel px-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent"
        />
        <button
          onClick={onDelete}
          title="Remove"
          className="grid size-6 place-items-center rounded-md text-ink-faint opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
        >
          <AppIcon name="Trash" size={11} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live CSS preview — read-only Monaco pane showing the exact contents Wonder
// will write to `design/tokens.css` on save. Updates on every edit so the
// user has immediate feedback on how their changes land in Tailwind.
// ---------------------------------------------------------------------------

function CssPreview({ css }: { css: string }) {
  const beforeMount: BeforeMount = (monaco) => {
    // Light theme tuned to match the editor chrome. Registered once per
    // Monaco instance — re-registering is a no-op.
    monaco.editor.defineTheme("wonder-tokens", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#ffffff",
        "editor.lineHighlightBackground": "#f6f6f6",
        "editorGutter.background": "#ffffff",
      },
    });
  };

  return (
    <div className="flex w-[40%] min-w-[360px] max-w-[560px] flex-col border-l border-stroke bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-stroke px-3">
        <AppIcon name="FileCode" size={12} className="text-ink-faint" />
        <span className="font-mono text-[11px] text-ink">
          design/tokens.css
        </span>
        <span className="text-ink-faint">·</span>
        <span className="text-[10.5px] text-ink-faint">generated · read-only</span>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          value={css}
          language="css"
          theme="wonder-tokens"
          beforeMount={beforeMount}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            renderLineHighlight: "line",
            padding: { top: 10, bottom: 10 },
          }}
        />
      </div>
    </div>
  );
}
