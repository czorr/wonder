import { AppIcon, type AppIconName } from "@/app/icons";
import { useLayout } from "@/store/layout";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useProject } from "@/store/project";
import { useMetrics } from "@/store/metrics";
import { useTheme } from "@/store/theme";
import { useCanvas } from "@/store/canvas";
import { DesignSystemPanel } from "./DesignSystemPanel";
import {
  addClassesAtPath,
  getClassNameAtPath,
  removeClassesAtPath,
  setClassAtPath,
} from "@/ast/tailwind";
import { PALETTE, type PaletteColor } from "@/ast/palette";
import type { Tokens } from "@/project/tokens";
import { primaryFamily } from "@/project/googleFonts";
import { bindTextPropAtPath, listProps, unbindPropAtPath } from "@/ast/props";
import { getTextAtPath, isTextLeaf } from "@/ast/text";
import { parseSource } from "@/ast/parse";
import {
  findRootJSXElement,
  getJSXAttr,
  walkJSX,
  type WonderPath,
} from "@/ast/selectors";
import * as t from "@babel/types";

const TEXT_SIZES = [
  { value: "text-xs", px: 12, lh: "leading-4" },
  { value: "text-sm", px: 14, lh: "leading-5" },
  { value: "text-base", px: 16, lh: "leading-6" },
  { value: "text-lg", px: 18, lh: "leading-7" },
  { value: "text-xl", px: 20, lh: "leading-7" },
  { value: "text-2xl", px: 24, lh: "leading-8" },
  { value: "text-3xl", px: 30, lh: "leading-9" },
  { value: "text-4xl", px: 36, lh: "leading-10" },
];
const TEXT_SIZE_VALUES = new Set(TEXT_SIZES.map((s) => s.value));

const FONT_WEIGHTS = [
  { value: "font-thin", n: 100 },
  { value: "font-light", n: 300 },
  { value: "font-normal", n: 400 },
  { value: "font-medium", n: 500 },
  { value: "font-semibold", n: 600 },
  { value: "font-bold", n: 700 },
  { value: "font-extrabold", n: 800 },
];
const FONT_WEIGHT_VALUES = new Set(FONT_WEIGHTS.map((f) => f.value));

const TEXT_ALIGNS: { value: string; icon: AppIconName }[] = [
  { value: "text-left", icon: "AlignLeft" },
  { value: "text-center", icon: "AlignCenter" },
  { value: "text-right", icon: "AlignRight" },
  { value: "text-justify", icon: "AlignJustify" },
];
const TEXT_ALIGN_VALUES = new Set(TEXT_ALIGNS.map((a) => a.value));

const SPACING_SCALE = [
  { n: "0", px: 0 },
  { n: "0.5", px: 2 },
  { n: "1", px: 4 },
  { n: "1.5", px: 6 },
  { n: "2", px: 8 },
  { n: "2.5", px: 10 },
  { n: "3", px: 12 },
  { n: "4", px: 16 },
  { n: "5", px: 20 },
  { n: "6", px: 24 },
  { n: "8", px: 32 },
  { n: "10", px: 40 },
  { n: "12", px: 48 },
  { n: "16", px: 64 },
  { n: "20", px: 80 },
  { n: "24", px: 96 },
];

const RADIUS_OPTIONS = [
  { value: "rounded-none", px: 0 },
  { value: "rounded-sm", px: 2 },
  { value: "rounded", px: 4 },
  { value: "rounded-md", px: 6 },
  { value: "rounded-lg", px: 8 },
  { value: "rounded-xl", px: 12 },
  { value: "rounded-2xl", px: 16 },
  { value: "rounded-3xl", px: 24 },
  { value: "rounded-full", px: 9999 },
];
const RADIUS_VALUES = new Set(RADIUS_OPTIONS.map((r) => r.value));

const BORDER_WIDTHS = [
  { value: "border-0", px: 0 },
  { value: "border", px: 1 },
  { value: "border-2", px: 2 },
  { value: "border-4", px: 4 },
  { value: "border-8", px: 8 },
];
const BORDER_WIDTH_VALUES = new Set(BORDER_WIDTHS.map((b) => b.value));

// Border line style — Tailwind's `border-solid/dashed/dotted/double/none`.
// Default is `border-solid` when a width is set, so a missing class here
// reads as "solid" in the UI even though no class is emitted.
const BORDER_STYLES = [
  { value: "border-solid", label: "solid", css: "solid" },
  { value: "border-dashed", label: "dashed", css: "dashed" },
  { value: "border-dotted", label: "dotted", css: "dotted" },
  { value: "border-double", label: "double", css: "double" },
] as const;
const BORDER_STYLE_VALUES: Set<string> = new Set(
  BORDER_STYLES.map((s) => s.value),
);

// Per-corner radius corners. Tailwind has short axis-shortcuts
// (`rounded-t-*` = top-left + top-right) too, but we resolve those at read
// time into the four individual corners so the UI always deals with a
// concrete 4-tuple.
const RADIUS_CORNERS = [
  { key: "tl", label: "TL", tailwindBase: "rounded-tl", shortAxis: ["t", "l"] },
  { key: "tr", label: "TR", tailwindBase: "rounded-tr", shortAxis: ["t", "r"] },
  { key: "br", label: "BR", tailwindBase: "rounded-br", shortAxis: ["b", "r"] },
  { key: "bl", label: "BL", tailwindBase: "rounded-bl", shortAxis: ["b", "l"] },
] as const;
type CornerKey = (typeof RADIUS_CORNERS)[number]["key"];

// Suffix of a `rounded-*` class → px value, so the corner panel can render
// its hint next to each select the same way the unified radius does.
function radiusSuffixPx(suffix: string | undefined): number | null {
  if (suffix === undefined) return null;
  if (suffix === "") return 4; // `rounded` with no suffix = 4px
  const match = RADIUS_OPTIONS.find((r) => r.value === `rounded-${suffix}` || r.value === `rounded${suffix ? `-${suffix}` : ""}`);
  return match?.px ?? null;
}

// ---------------------------------------------------------------------------
// Variant prefixes (Tailwind class-name prefixes).
//
// Every write this inspector emits is scoped by a `VariantKey` composed of
// three independent dimensions:
//
//   • state  — base | hover | focus | active   (state-tab row inside panel)
//   • dark   — boolean                         (theme store / Topbar toggle)
//   • bp     — base | sm | md | lg | xl | 2xl  (breakpoint picker in Topbar)
//
// Picking `hover` on the state tabs while the theme is dark and the Topbar
// says `md` produces writes like `dark:md:hover:bg-red-500` — and reads
// filter to classes that live in exactly that slot. Three independent axes
// × four/two/six values = 48 possible slots per element, but the user only
// ever sees the single slot they've dialed into. Flipping any of the three
// pickers moves every read/write in this panel to a new slot without
// rewriting any of the downstream logic.
//
// A few Tailwind variants we chose NOT to surface yet:
//   - `group-hover:` / `peer-*` — cross-element state, more complex to
//     explain in a flat inspector.
//   - Arbitrary prefixes (`[&:has(…)]:` etc.) — power-user territory.
// ---------------------------------------------------------------------------

const STATE_TABS = ["base", "hover", "focus", "active"] as const;
type StateVariant = (typeof STATE_TABS)[number];
const STATE_PREFIXES = new Set<string>(STATE_TABS.filter((s) => s !== "base"));

/**
 * Per-state visual style used to tie the three state-axis surfaces together:
 *
 *   1. The segmented state-tab row (active tab picks up the state's fill)
 *   2. The per-field override dots shown on base mode
 *   3. The per-field override accent on inputs in a non-base state
 *
 * Keeping hex + Tailwind utility names in one table means picking a new
 * palette (or flipping to a darker tint in dark mode later) is a single-row
 * edit that updates all three surfaces in lockstep.
 *
 * Why these three colors:
 *   hover  = amber   — warm "attention" signal, matches native hover affordances.
 *   focus  = sky     — canonical focus color across OS-level AX guidance.
 *   active = violet  — press/engaged; distinct from hover without reading as error.
 *
 * The `fieldClasses` block uses arbitrary-descendant selectors to re-theme
 * the .wnd-field shell any control in a DualRow wraps with — it's the
 * surface we need to tint to signal "this field owns its value in state X".
 * Pre-declaring the full class strings here (not interpolating `${color}`)
 * keeps Tailwind's JIT detection happy.
 */
const STATE_PIP_COLOR: Record<Exclude<StateVariant, "base">, string> = {
  hover: "#f59e0b", // amber-500
  focus: "#0ea5e9", // sky-500
  active: "#8b5cf6", // violet-500
};

const STATE_STYLE: Record<
  Exclude<StateVariant, "base">,
  {
    /** Active-tab treatment — solid fill + readable text. */
    tabActive: string;
    /** Small trailing dot on the INactive tab when that state has edits. */
    tabDot: string;
    /** Descendant selectors that tint the `.wnd-field` shells inside a
     *  DualRow that owns an override in this state. */
    fieldClasses: string;
  }
> = {
  hover: {
    tabActive: "bg-amber-500 text-white shadow-sm",
    tabDot: "bg-amber-500",
    fieldClasses:
      "[&_.wnd-field]:border-amber-500/60 [&_.wnd-field]:shadow-[inset_0_0_0_1px_rgba(245,158,11,0.18)]",
  },
  focus: {
    tabActive: "bg-sky-500 text-white shadow-sm",
    tabDot: "bg-sky-500",
    fieldClasses:
      "[&_.wnd-field]:border-sky-500/60 [&_.wnd-field]:shadow-[inset_0_0_0_1px_rgba(14,165,233,0.18)]",
  },
  active: {
    tabActive: "bg-violet-500 text-white shadow-sm",
    tabDot: "bg-violet-500",
    fieldClasses:
      "[&_.wnd-field]:border-violet-500/60 [&_.wnd-field]:shadow-[inset_0_0_0_1px_rgba(139,92,246,0.18)]",
  },
};

const BREAKPOINT_PREFIXES = new Set<string>(["sm", "md", "lg", "xl", "2xl"]);
type BreakpointVariant = "base" | "sm" | "md" | "lg" | "xl" | "2xl";

/**
 * A class in Wonder can live in any combination of the three variant axes.
 * Examples:
 *
 *     bare:                    bg-red-500
 *     hover:                   hover:bg-red-500
 *     dark:                    dark:bg-red-500
 *     md:                      md:bg-red-500
 *     dark + hover:            dark:hover:bg-red-500
 *     md + hover:              md:hover:bg-red-500
 *     dark + md + hover:       dark:md:hover:bg-red-500
 *
 * `VariantKey` packs all three dimensions into one object so every
 * reader/writer in the inspector can speak the same language. Flipping any
 * axis moves every read/write to a different slot without downstream
 * changes.
 */
type VariantKey = {
  dark: boolean;
  state: StateVariant;
  bp: BreakpointVariant;
};

/** Peel leading `dark:` / breakpoint: / state: prefixes off a class in any
 *  order. Tailwind is permissive about order, and components hand-edited in
 *  code won't always follow the convention we emit — so we keep pulling
 *  recognized prefixes until we hit something that isn't one of ours.
 *
 *  The loop cap (6) is defensive: a Tailwind class has at most a handful of
 *  stacked prefixes before the utility body; an unbounded loop here would
 *  be a footgun if we ever added a prefix that could also appear inside a
 *  utility name. */
function parseVariant(cls: string): { key: VariantKey; bare: string } {
  let dark = false;
  let state: StateVariant = "base";
  let bp: BreakpointVariant = "base";
  let rest = cls;
  for (let i = 0; i < 6; i++) {
    const idx = rest.indexOf(":");
    if (idx < 0) break;
    const p = rest.slice(0, idx);
    if (p === "dark") {
      dark = true;
      rest = rest.slice(idx + 1);
    } else if (STATE_PREFIXES.has(p)) {
      state = p as StateVariant;
      rest = rest.slice(idx + 1);
    } else if (BREAKPOINT_PREFIXES.has(p)) {
      bp = p as BreakpointVariant;
      rest = rest.slice(idx + 1);
    } else {
      break;
    }
  }
  return { key: { dark, state, bp }, bare: rest };
}

/** Strip every known prefix (dark + bp + state). Safe on bare classes. */
function stripVariant(cls: string): string {
  return parseVariant(cls).bare;
}

/** Compose the canonical `dark:bp:state:class` form for a write. We always
 *  emit the prefixes in a fixed order — Tailwind accepts any order when
 *  reading, but picking one keeps diffs stable and makes round-trips (edit
 *  → parse → write) idempotent.
 *
 *  Order matches Tailwind's recommendation (responsive outer, then dark,
 *  then state — but we put `dark` outermost as our house convention since
 *  dark is the theme-wide axis; see globals.css for the same layering). */
function withVariant(key: VariantKey, cls: string): string {
  let out = cls;
  if (key.state !== "base") out = `${key.state}:${out}`;
  if (key.bp !== "base") out = `${key.bp}:${out}`;
  if (key.dark) out = `dark:${out}`;
  return out;
}

/** True when `cls` belongs to the given slot. Drives both the filtered
 *  class list the inspector shows AND the scoped "clear before write"
 *  passes in color / gap / corner writers so an edit in one slot never
 *  stomps on another slot's values. */
function clsBelongsTo(cls: string, key: VariantKey): boolean {
  const v = parseVariant(cls).key;
  return v.dark === key.dark && v.state === key.state && v.bp === key.bp;
}

/**
 * Per-field variant metadata the inspector passes to `DualRow` so each
 * property row can signal its relationship to the base state.
 *
 * Three mutually-expressive flags (all false = "nothing to say"):
 *
 *   • inherited: non-base state is displaying a value that actually lives
 *     on the base variant — editing here creates a first-time override.
 *     The label picks up an "↳" indicator and the input drops into a
 *     dashed/muted treatment so the user reads "what you see is borrowed".
 *
 *   • overrides: non-base state owns its own class for this property. The
 *     input picks up an accent-colored frame so users can tell at a glance
 *     "this field is contributing its own value, not inheriting".
 *
 *   • overriddenBy: base state, OTHER states (hover/focus/active within the
 *     same dark+bp slot) that have their own class for this property.
 *     Renders as a tight row of colored pips under the label so the user
 *     can scan "which fields already have non-base variants" without
 *     tabbing through every state.
 *
 * All three are computed relative to the CURRENT dark+bp slot — mixing
 * across dark or across breakpoints would mislead the indicator.
 */
type FieldMeta = {
  inherited: boolean;
  overrides: boolean;
  overriddenBy: Array<Exclude<StateVariant, "base">>;
  /**
   * The state the meta was computed against. Carried here (rather than
   * threaded as a separate DualRow prop) so field styling can pick the
   * matching `STATE_STYLE` entry when `overrides` is true — the tint
   * color should echo the currently-active tab, not a generic accent.
   */
  currentState: StateVariant;
};

/**
 * Bucket the element's raw classes by state within the current dark+bp
 * slot, stripping variant prefixes. Other dark/bp slots are ignored —
 * overrides and inherits are per-slot concepts (an `md:hover:bg-red-500`
 * should not show as "overrides" when the user is editing the `lg` slot).
 *
 * The result is a 4-key map: { base, hover, focus, active } → bare
 * classes. Reused by `makeMetaFor` for every DualRow in the panel.
 */
function classesByState(
  rawClasses: string[],
  dark: boolean,
  bp: BreakpointVariant,
): Record<StateVariant, string[]> {
  const out: Record<StateVariant, string[]> = {
    base: [],
    hover: [],
    focus: [],
    active: [],
  };
  for (const c of rawClasses) {
    const v = parseVariant(c);
    if (v.key.dark !== dark) continue;
    if (v.key.bp !== bp) continue;
    out[v.key.state].push(v.bare);
  }
  return out;
}

/**
 * Build a `FieldMeta` closure bound to a specific slot. Callers pass a
 * predicate that recognizes "this class belongs to field X" (e.g.
 * `DISPLAY_VALUES.has(c)` for the Display row) and get back a meta record
 * describing how that field relates to the base state.
 *
 * Factored out of the component render so the same machinery can be used
 * by any future inspector section without reaching into React state.
 */
function makeMetaFor(
  byState: Record<StateVariant, string[]>,
  state: StateVariant,
): (pred: (bare: string) => boolean) => FieldMeta {
  return (pred) => {
    const owned = byState[state].some(pred);
    const baseHas = byState.base.some(pred);
    const inherited = state !== "base" && !owned && baseHas;
    const overrides = state !== "base" && owned;
    const overriddenBy: Array<Exclude<StateVariant, "base">> = [];
    if (state === "base") {
      for (const s of ["hover", "focus", "active"] as const) {
        if (byState[s].some(pred)) overriddenBy.push(s);
      }
    }
    return { inherited, overrides, overriddenBy, currentState: state };
  };
}

const DISPLAY_OPTIONS: { value: string; icon: AppIconName; label: string }[] = [
  { value: "block", icon: "Square", label: "block" },
  { value: "flex", icon: "Rows", label: "flex" },
  { value: "grid", icon: "Columns", label: "grid" },
  { value: "inline", icon: "Minus", label: "inline" },
  { value: "hidden", icon: "EyeOff", label: "hidden" },
];
const DISPLAY_VALUES = new Set(DISPLAY_OPTIONS.map((d) => d.value));

const DIRECTION_OPTIONS: { value: string; icon: AppIconName }[] = [
  { value: "flex-row", icon: "ArrowRight" },
  { value: "flex-col", icon: "ArrowDown" },
  { value: "flex-row-reverse", icon: "ArrowLeft" },
  { value: "flex-col-reverse", icon: "ArrowUp" },
];
const DIRECTION_VALUES = new Set(DIRECTION_OPTIONS.map((d) => d.value));

const JUSTIFY_OPTIONS: { value: string; icon: AppIconName; label: string }[] = [
  { value: "justify-start", icon: "AlignHorizontalStart", label: "start" },
  { value: "justify-center", icon: "AlignHorizontalCenter", label: "center" },
  { value: "justify-end", icon: "AlignHorizontalEnd", label: "end" },
  { value: "justify-between", icon: "AlignHorizontalSpaceBetween", label: "between" },
  { value: "justify-around", icon: "AlignHorizontalSpaceAround", label: "around" },
];
const JUSTIFY_VALUES = new Set(JUSTIFY_OPTIONS.map((j) => j.value));

const ALIGN_OPTIONS: { value: string; icon: AppIconName; label: string }[] = [
  { value: "items-start", icon: "AlignVerticalStart", label: "start" },
  { value: "items-center", icon: "AlignVerticalCenter", label: "center" },
  { value: "items-end", icon: "AlignVerticalEnd", label: "end" },
  { value: "items-baseline", icon: "AlignStretch", label: "baseline" },
  { value: "items-stretch", icon: "StretchHorizontal", label: "stretch" },
];
const ALIGN_VALUES = new Set(ALIGN_OPTIONS.map((a) => a.value));

const SPACING_SIDES = ["t", "r", "b", "l"] as const;
type Side = (typeof SPACING_SIDES)[number];

function readSideSpacing(
  classes: string[],
  prefix: "p" | "m",
  side: Side,
): { cls: string | undefined; px: number } {
  const axis: "x" | "y" = side === "t" || side === "b" ? "y" : "x";
  const specific = classes.find((c) => new RegExp(`^${prefix}${side}-[\\d.]+$`).test(c));
  const axisC = classes.find((c) => new RegExp(`^${prefix}${axis}-[\\d.]+$`).test(c));
  const allC = classes.find((c) => new RegExp(`^${prefix}-[\\d.]+$`).test(c));
  const chosen = specific ?? axisC ?? allC;
  const num = chosen?.match(/-([\d.]+)$/)?.[1];
  const entry = SPACING_SCALE.find((s) => s.n === num);
  return { cls: chosen, px: entry?.px ?? 0 };
}

function pxToScale(px: number): string {
  let best = SPACING_SCALE[0];
  let bestDiff = Infinity;
  for (const s of SPACING_SCALE) {
    const d = Math.abs(s.px - px);
    if (d < bestDiff) {
      bestDiff = d;
      best = s;
    }
  }
  return best.n;
}

// ---------------------------------------------------------------------------
// Token-aware color palette.
//
// The ColorDropdown used to resolve class names against the static Tailwind
// palette only — so `bg-primary` (a project-token class) never lit up in the
// selected-color chip. Now we build a merged palette where:
//
//   1. Token families come FIRST so they win on both lookup (map)
//      and display (list). Users who rename a token and then open the
//      dropdown see the new name + new hex immediately.
//   2. Static Tailwind colors come second as a reference library.
//
// The merged structure keeps `kind` on each entry so the dropdown can
// render a "Project tokens" section header and group them separately.
// ---------------------------------------------------------------------------

type ExtPaletteColor = PaletteColor & { kind: "token" | "static" };

function buildTokenPalette(tokens: Tokens): ExtPaletteColor[] {
  const out: ExtPaletteColor[] = [];
  for (const [family, shades] of Object.entries(tokens.colors)) {
    // DEFAULT first so the chip preview matches the family's base shade,
    // then variants sorted alphabetically (matches the emitter's order
    // and how DesignSystemPanel lists them).
    const keys = Object.keys(shades).sort((a, b) => {
      if (a === "DEFAULT") return -1;
      if (b === "DEFAULT") return 1;
      return a.localeCompare(b);
    });
    for (const v of keys) {
      const name = v === "DEFAULT" ? family : `${family}-${v}`;
      out.push({ name, hex: shades[v], kind: "token" });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Gap helpers.
//
// Tailwind has three gap variants:
//   - `gap-N`    both axes (the original single-input)
//   - `gap-x-N`  column gap only (horizontal space between columns)
//   - `gap-y-N`  row gap only    (vertical space between rows)
//
// The inspector surfaces this as two inputs (X + Y). When the user sets
// both to the same value we collapse back to the unified `gap-N` for a
// cleaner class list. When they diverge we emit the split pair. Reading
// resolves `gap-N` into both axes so the initial view always has values
// to render.
// ---------------------------------------------------------------------------

function readGapClasses(classes: string[]): {
  unified: string | undefined;
  x: string | undefined;
  y: string | undefined;
} {
  return {
    unified: classes.find((c) => /^gap-[\d.]+$/.test(c)),
    x: classes.find((c) => /^gap-x-[\d.]+$/.test(c)),
    y: classes.find((c) => /^gap-y-[\d.]+$/.test(c)),
  };
}

function readGapN(classes: string[]): { x: string; y: string } {
  const { unified, x, y } = readGapClasses(classes);
  const uN = unified?.match(/^gap-([\d.]+)$/)?.[1];
  const xN = x?.match(/^gap-x-([\d.]+)$/)?.[1] ?? uN ?? "0";
  const yN = y?.match(/^gap-y-([\d.]+)$/)?.[1] ?? uN ?? "0";
  return { x: xN, y: yN };
}

// ---------------------------------------------------------------------------
// Per-corner radius helpers.
//
// Tailwind has four corner classes (`rounded-tl-*`, etc.), two axis
// shortcuts (`rounded-t-*` = tl+tr, `rounded-b-*` = bl+br, `rounded-l-*` =
// tl+bl, `rounded-r-*` = tr+br), and the unified `rounded-*`. We resolve
// the effective per-corner value by checking most-specific → least-specific
// (corner > axis > unified), matching CSS cascade intent.
// ---------------------------------------------------------------------------

const RADIUS_SUFFIXES = [
  "none",
  "sm",
  "",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "full",
] as const; // "" = `rounded` (4px base)

function matchRadius(cls: string, prefix: string): string | null {
  // e.g. prefix="rounded-tl" → matches "rounded-tl", "rounded-tl-md", etc.
  if (cls === prefix) return "";
  const m = new RegExp(`^${prefix}-(none|sm|md|lg|xl|2xl|3xl|full)$`).exec(cls);
  return m ? m[1] : null;
}

function readCornerRadius(
  classes: string[],
  corner: (typeof RADIUS_CORNERS)[number],
): string | null {
  // Most specific wins: corner → axis → unified.
  for (const c of classes) {
    const m = matchRadius(c, corner.tailwindBase);
    if (m !== null) return m;
  }
  for (const axis of corner.shortAxis) {
    for (const c of classes) {
      const m = matchRadius(c, `rounded-${axis}`);
      if (m !== null) return m;
    }
  }
  for (const c of classes) {
    const m = matchRadius(c, "rounded");
    if (m !== null) return m;
  }
  return null;
}

function cornersAllEqual(map: Record<CornerKey, string | null>): boolean {
  const { tl, tr, br, bl } = map;
  return tl === tr && tr === br && br === bl;
}

export function RightPanel() {
  const components = useProject((s) => s.components);
  const selectedId = useProject((s) => s.selectedComponentId);
  const selectedPath = useProject((s) => s.selectedElementPath);
  const selectElement = useProject((s) => s.selectElement);
  const setSource = useProject((s) => s.setSource);

  const [state, setState] = useState<StateVariant>("base");
  // Theme + breakpoint are the OTHER two dimensions of the variant key.
  // Flipping dark mode in the Topbar instantly redirects every read/write to
  // the `dark:` slot; flipping the breakpoint redirects to `md:`/`lg:`/etc.
  // Both are global pickers (not per-element) so the user stays in a
  // consistent "what am I editing?" mental state while moving between
  // components. Light + base bp = the canonical unprefixed slot.
  const theme = useTheme((s) => s.theme);
  const isDark = theme === "dark";
  const breakpoint = useCanvas((s) => s.breakpoint) as BreakpointVariant;
  const currentKey: VariantKey = useMemo(
    () => ({ dark: isDark, state, bp: breakpoint }),
    [isDark, state, breakpoint],
  );
  // Layers tab is deliberately not here — removed for now until the AST-based
  // tree view can be built properly (needs delete-node + move-node helpers).
  const [panel, setPanel] = useState<"design" | "props">("design");
  const collapseRight = useLayout((s) => s.toggleRight);
  const propValuesByComp = useProject((s) => s.propValues);
  const setPropValue = useProject((s) => s.setPropValue);

  const component = selectedId ? components[selectedId] : null;
  const path = selectedPath ?? "0";

  const rootSize = useMetrics((s) => (selectedId ? s.rootSizes[selectedId] : undefined));
  const selRect = useMetrics((s) => (selectedId ? s.selectedRects[selectedId] : undefined));
  const measured = path === "0"
    ? rootSize
    : selRect && selRect.path === path
      ? { w: selRect.w, h: selRect.h }
      : undefined;

  // `rawClasses` is the unfiltered list as written on the element (e.g. may
  // contain `bg-red-500 hover:bg-red-600 focus:ring-2`). `classes` is scoped
  // to the current state tab — filtered to the selected variant and with the
  // variant prefix stripped — so the rest of the panel can read/write in the
  // user's mental model ("the hover background is red-600") without having
  // to think about prefixes. All mutation helpers below re-apply the prefix
  // via `withVariant(currentKey, ...)` before writing.
  const rawClasses = useMemo(() => {
    if (!component) return [];
    try {
      return getClassNameAtPath(component.source, path);
    } catch {
      return [];
    }
  }, [component, path]);

  const classes = useMemo(
    () =>
      rawClasses
        .filter((c) => clsBelongsTo(c, currentKey))
        .map(stripVariant),
    [rawClasses, currentKey],
  );

  // Classes grouped by state within the current dark+bp slot. Everything
  // else in this component — variant counts, per-field inherit/override
  // meta — is derived from this. Cheaper to build once and read from
  // than to re-scan `rawClasses` per property row.
  const byState = useMemo(
    () => classesByState(rawClasses, isDark, breakpoint),
    [rawClasses, isDark, breakpoint],
  );

  // How many overrides each state has *in the current dark+bp slot*.
  // Mixing counts across dark or breakpoint would mislead the pip — a tab
  // saying "3 edits" when two of them only live in the other theme or at a
  // different breakpoint would make the user expect changes they don't see.
  const variantCounts = useMemo(() => {
    const counts: Record<StateVariant, number> = { base: 0, hover: 0, focus: 0, active: 0 };
    for (const s of STATE_TABS) counts[s] = byState[s].length;
    return counts;
  }, [byState]);

  // Per-field inheritance/override metadata — lets each DualRow signal
  // whether it's showing an inherited base value, a state-owned override,
  // or which other states override this property (for base-state pips).
  // Closure over `byState + state` so callers just pass the predicate.
  const metaFor = useMemo(() => makeMetaFor(byState, state), [byState, state]);

  const find = (pred: (c: string) => boolean) => classes.find(pred);

  // Palette is built FIRST so class-detection can use it to tell a real color
  // class (bg-primary-soft, bg-emerald-500, border-surface-ink) apart from
  // Tailwind's many other prefix-sharing utilities (bg-opacity-50,
  // bg-gradient-to-r, border-solid, border-0). Previous regex-only checks
  // either missed token-named classes or false-matched non-colors.
  const tokens = useProject((s) => s.tokens);
  const tokenPalette = useMemo(() => buildTokenPalette(tokens), [tokens]);
  const mergedPalette = useMemo<ExtPaletteColor[]>(
    () => [
      ...tokenPalette,
      ...PALETTE.map<ExtPaletteColor>((p) => ({ ...p, kind: "static" })),
    ],
    [tokenPalette],
  );
  const mergedByName = useMemo(() => {
    const m = new Map<string, ExtPaletteColor>();
    // Static first so tokens override any name collision (e.g., user names
    // a family `blue` — their blue wins over the hardcoded Tailwind `blue`).
    for (const p of PALETTE) m.set(p.name, { ...p, kind: "static" });
    for (const t of tokenPalette) m.set(t.name, t);
    return m;
  }, [tokenPalette]);

  // Is this a color class we understand? A class like "bg-primary-soft"
  // or "border-neutral-ink" passes; "bg-opacity-50" or "border-solid"
  // doesn't. Looked up against the merged palette so project tokens Just
  // Work™ alongside the Tailwind reference palette.
  const findColorClass = (prefix: string): string | undefined =>
    classes.find(
      (c) =>
        c.startsWith(`${prefix}-`) &&
        mergedByName.has(c.slice(prefix.length + 1)),
    );

  // Color-class predicate factory for `metaFor`. Mirrors `findColorClass`
  // but as a boolean check — used to tell whether a hover/focus/active
  // slot owns a bg/text/border color for the pip indicators.
  const colorPred = (prefix: string) => (bare: string) =>
    bare.startsWith(`${prefix}-`) &&
    mergedByName.has(bare.slice(prefix.length + 1));

  const currentGap = find((c) => /^gap-/.test(c));
  const currentDisplay = find((c) => DISPLAY_VALUES.has(c));
  const currentDirection = find((c) => DIRECTION_VALUES.has(c));
  const currentJustify = find((c) => JUSTIFY_VALUES.has(c));
  const currentAlignItems = find((c) => ALIGN_VALUES.has(c));
  const currentWidth = find((c) => /^w-/.test(c));
  const currentHeight = find((c) => /^h-/.test(c));

  const currentSize = find((c) => TEXT_SIZE_VALUES.has(c));
  const currentWeight = find((c) => FONT_WEIGHT_VALUES.has(c));
  const currentAlign = find((c) => TEXT_ALIGN_VALUES.has(c));

  // Font family utilities available to this project. `font-sans` / `font-mono`
  // are always present; `font-display` only when the user defined it. We
  // show the primary family from each stack as the label ("Inter", "JetBrains
  // Mono", …) so the dropdown reads as "which font am I picking" rather than
  // "which CSS variable" — the utility name stays in the right-aligned hint
  // to keep the Tailwind mental model honest.
  const fontFamilyOptions = useMemo(() => {
    const opts: { value: string; label: string; right?: string }[] = [
      {
        value: "font-sans",
        label: primaryFamily(tokens.fonts.sans) || "sans",
        right: "font-sans",
      },
      {
        value: "font-mono",
        label: primaryFamily(tokens.fonts.mono) || "mono",
        right: "font-mono",
      },
    ];
    if (tokens.fonts.display) {
      opts.push({
        value: "font-display",
        label: primaryFamily(tokens.fonts.display) || "display",
        right: "font-display",
      });
    }
    return opts;
  }, [tokens.fonts.sans, tokens.fonts.mono, tokens.fonts.display]);
  const FONT_FAMILY_VALUES = useMemo(
    () => new Set(fontFamilyOptions.map((o) => o.value)),
    [fontFamilyOptions],
  );
  const currentFamily = find((c) => FONT_FAMILY_VALUES.has(c));
  const currentFamilyLabel = currentFamily
    ? fontFamilyOptions.find((o) => o.value === currentFamily)?.label ??
      currentFamily
    : // No explicit utility on the element → it inherits `font-sans` from
      // the document root (tokens.fonts.sans). Show that family's name so
      // the field never reads as blank/"Inter-forever".
      primaryFamily(tokens.fonts.sans) || "sans";

  const currentBg = findColorClass("bg");
  const currentTextColor = findColorClass("text");
  const currentBorderColor = findColorClass("border");

  const currentRadius = find((c) => RADIUS_VALUES.has(c));
  const currentBorderW = find((c) => BORDER_WIDTH_VALUES.has(c)) ?? "border-0";
  const currentBorderStyle = find((c) => BORDER_STYLE_VALUES.has(c));

  // Per-corner radius map — if any corner or axis class is set, the UI
  // auto-reveals the 4-corner editor. Users can also toggle manually via
  // the header chip; `radiusSplit` captures that manual intent.
  const cornerMap = useMemo(() => {
    return {
      tl: readCornerRadius(classes, RADIUS_CORNERS[0]),
      tr: readCornerRadius(classes, RADIUS_CORNERS[1]),
      br: readCornerRadius(classes, RADIUS_CORNERS[2]),
      bl: readCornerRadius(classes, RADIUS_CORNERS[3]),
    } as Record<CornerKey, string | null>;
  }, [classes]);
  const hasPerCornerClass = useMemo(
    () =>
      classes.some((c) =>
        /^rounded-(?:tl|tr|br|bl|t|b|l|r)(?:-(?:none|sm|md|lg|xl|2xl|3xl|full))?$/.test(c),
      ),
    [classes],
  );
  const [radiusSplit, setRadiusSplit] = useState(false);
  const radiusSplitOpen = radiusSplit || hasPerCornerClass;

  // Gap: decoupled X/Y. Unified `gap-N` is resolved into both axes so the
  // initial render isn't blank when the file uses the old single-class form.
  // (Writes go through `writeGapBoth`, which clears by regex rather than by
  // reading the old classes — so we only need `gapN` here.)
  const gapN = useMemo(() => readGapN(classes), [classes]);

  const baselineRef = useRef<string | null>(null);

  const captureBaseline = () => {
    if (component) baselineRef.current = component.source;
  };
  const clearBaseline = () => {
    baselineRef.current = null;
  };
  const cancelPreview = () => {
    if (component && baselineRef.current != null) {
      setSource(component.id, baselineRef.current);
    }
    baselineRef.current = null;
  };

  // `swap` receives *bare* classes (e.g. "bg-red-500", "flex") in the user's
  // current variant frame. We re-apply the active state prefix before writing
  // so edits made while the hover tab is active produce `hover:bg-red-500`,
  // leaving other variants untouched.
  const swap = (oldClass: string | undefined, next: string) => {
    if (!component) return;
    try {
      const base = baselineRef.current ?? component.source;
      const oldRaw = oldClass ? withVariant(currentKey, oldClass) : null;
      const nextRaw = next ? withVariant(currentKey, next) : "";
      const updated = setClassAtPath(base, path, oldRaw ?? nextRaw, nextRaw);
      setSource(component.id, updated);
    } catch (e) {
      console.error(e);
    }
  };

  const preview = (oldClass: string | undefined) => ({
    onOpen: captureBaseline,
    onHover: (v: string) => swap(oldClass, v),
    onCancel: cancelPreview,
  });
  const commit = (oldClass: string | undefined, next: string) => {
    swap(oldClass, next);
    clearBaseline();
  };
  // Color writer — unlike `swap`, this first *clears* every color class with
  // the given prefix (stale `bg-neutral-soft` from a previous tweak etc.)
  // before emitting the new one. Required because Tailwind's cascade makes
  // duplicate `bg-*` classes silently pick the last one at render time
  // while the inspector still reads the first — yielding the classic
  // "the dropdown says surface but the background is gray" bug.
  const writeColor = (prefix: string, nextName: string) => {
    if (!component) return;
    try {
      const base = baselineRef.current ?? component.source;
      // Clear only the color classes that belong to the currently-selected
      // variant. `bg-red-500` at base is left intact when the user is
      // editing the hover state — so tabbing back to base still shows the
      // original base color.
      const cleared = removeClassesAtPath(base, path, (c) => {
        if (!clsBelongsTo(c, currentKey)) return false;
        const bare = stripVariant(c);
        return (
          bare.startsWith(`${prefix}-`) &&
          mergedByName.has(bare.slice(prefix.length + 1))
        );
      });
      const updated = nextName
        ? addClassesAtPath(cleared, path, [
            withVariant(currentKey, `${prefix}-${nextName}`),
          ])
        : cleared;
      setSource(component.id, updated);
    } catch (e) {
      console.error(e);
    }
  };
  const previewColor = (_oldClass: string | undefined, prefix: string) => ({
    onOpen: captureBaseline,
    onHover: (name: string) => name && writeColor(prefix, name),
    onCancel: cancelPreview,
  });

  const colorName = (
    cls: string | undefined,
    prefix: string,
  ): ExtPaletteColor | undefined => {
    if (!cls) return undefined;
    const name = cls.replace(new RegExp(`^${prefix}-`), "");
    return mergedByName.get(name);
  };

  const bgColor = colorName(currentBg, "bg");
  const textColor = colorName(currentTextColor, "text");
  const borderColor = colorName(currentBorderColor, "border");

  // Batched writer for gap — remove ALL existing gap-* classes, then emit
  // either the unified form or the split pair. All mutations share one
  // baseline string so we don't lose intermediate edits to parse errors.
  const writeGapBoth = (nextX: string, nextY: string) => {
    if (!component) return;
    try {
      let src = component.source;
      // Scoped clear — only gap-* classes that belong to the current
      // variant are stripped. Anything on other states survives.
      src = removeClassesAtPath(src, path, (c) => {
        if (!clsBelongsTo(c, currentKey)) return false;
        return /^gap(?:-[xy])?-/.test(stripVariant(c));
      });
      const toAdd: string[] =
        nextX === nextY
          ? [withVariant(currentKey, `gap-${nextX}`)]
          : [
              withVariant(currentKey, `gap-x-${nextX}`),
              withVariant(currentKey, `gap-y-${nextY}`),
            ];
      src = addClassesAtPath(src, path, toAdd);
      setSource(component.id, src);
    } catch (e) {
      console.error(e);
    }
  };

  // Batched writer for per-corner radius. Similar shape: clear every
  // rounded-* (corner, axis, unified), then emit four corners — or the
  // unified form when all four corners match.
  const writeCornerRadius = (corner: CornerKey, suffix: string) => {
    if (!component) return;
    try {
      const next: Record<CornerKey, string> = {
        tl: cornerMap.tl ?? "none",
        tr: cornerMap.tr ?? "none",
        br: cornerMap.br ?? "none",
        bl: cornerMap.bl ?? "none",
      };
      next[corner] = suffix;

      let src = component.source;
      // Clear every rounded-* class that belongs to the current variant.
      // Other variants' radii are preserved.
      src = removeClassesAtPath(src, path, (c) => {
        if (!clsBelongsTo(c, currentKey)) return false;
        return /^rounded(?:-(?:tl|tr|br|bl|t|b|l|r))?(?:-(?:none|sm|md|lg|xl|2xl|3xl|full))?$/.test(
          stripVariant(c),
        );
      });

      const allEqual =
        next.tl === next.tr && next.tr === next.br && next.br === next.bl;
      const toAdd: string[] = [];
      if (allEqual) {
        const cls = next.tl === "" ? "rounded" : `rounded-${next.tl}`;
        toAdd.push(withVariant(currentKey, cls));
      } else {
        for (const c of RADIUS_CORNERS) {
          const s = next[c.key];
          if (s === "none") continue; // `rounded-X-none` is rarely needed; omit → inherits 0
          const cls = s === "" ? c.tailwindBase : `${c.tailwindBase}-${s}`;
          toAdd.push(withVariant(currentKey, cls));
        }
      }
      if (toAdd.length) src = addClassesAtPath(src, path, toAdd);
      setSource(component.id, src);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <aside className="flex h-full w-full min-w-0 flex-1 flex-col overflow-x-hidden border-l border-stroke bg-panel text-[12px]">
      <div className="flex h-9 items-center gap-4 border-b border-stroke px-3 text-[11px] font-medium">
        {/* Collapse chevron — mirror of the one in LeftSidebar. Sits before
            the tabs so the two sidebars feel symmetric (chevron always on
            the "outside" edge of its panel). */}
        <button
          onClick={collapseRight}
          title="Collapse panel (⌘⇧\)"
          className="grid size-6 place-items-center rounded-md text-ink-faint hover:bg-panel-soft hover:text-ink-muted transition"
        >
          <AppIcon name="ChevronRight" size={13} />
        </button>
        <PanelTab icon="PaintBrush" label="Design" active={panel === "design"} onClick={() => setPanel("design")} />
        <PanelTab icon="Code" label="Props" active={panel === "props"} onClick={() => setPanel("props")} />
      </div>

      {component ? (
      <div className="flex items-center gap-1 border-b border-stroke px-3 py-2 text-[10.5px] text-ink-muted">
        <span>{component.name}</span>
        <AppIcon name="ChevronRight" size={10} className="text-ink-faint" />
        <span className="font-mono text-[10px] text-ink-faint">{path}</span>
      </div>
      ) : null}

      {component ? (
      <div className="flex items-center justify-between gap-2 border-b border-stroke px-3 py-1.5">
        {/* Segmented state selector. Same visual language as the breakpoint
            picker in the Topbar, but each non-base segment picks up the
            same hue used for its base-mode override dot and its field
            tint — amber for hover, sky for focus, violet for active. This
            makes the three surfaces (tabs, dots, field frames) read as
            one color language: a pip on the base row says "there's edits
            in that state"; tapping the matching tab tints the inputs the
            same way; glancing back shows them in base as the same color.
            Base stays ink-filled — it's the neutral, default slot. */}
        <div className="inline-flex items-center rounded-md border border-stroke bg-panel-soft/60 p-0.5">
          {STATE_TABS.map((s) => {
            const active = s === state;
            const hasEdits = variantCounts[s] > 0;
            const activeClass =
              s === "base"
                ? "bg-ink text-panel shadow-sm"
                : STATE_STYLE[s].tabActive;
            const dotClass =
              s === "base" ? "bg-accent" : STATE_STYLE[s].tabDot;
            return (
              <button
                key={s}
                onClick={() => setState(s)}
                title={hasEdits && !active ? `${variantCounts[s]} override${variantCounts[s] === 1 ? "" : "s"}` : undefined}
                className={
                  "relative flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[10.5px] font-medium transition " +
                  (active ? activeClass : "text-ink-muted hover:text-ink")
                }
              >
                {s}
                {hasEdits && !active ? (
                  <span
                    className={"size-1 rounded-full " + dotClass}
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        {/* Axis chips — read-only indicators that make it impossible to miss
            which dark/breakpoint slot the writes are landing in. The user
            flips each from the Topbar (theme toggle + breakpoint picker),
            which keeps "editing X" and "viewing X" from ever drifting apart.
            We render them in the same row as the state tabs because all
            three are facets of the same question: "which slot am I
            editing?". */}
        <div className="flex items-center gap-1">
          {breakpoint !== "base" ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-stroke bg-panel-soft/60 px-2 py-0.5 font-mono text-[9.5px] text-ink-muted"
              title={`Edits are being written with the ${breakpoint}: prefix. Change the breakpoint in the Topbar to edit another slot.`}
            >
              {breakpoint}:
            </span>
          ) : null}
          {isDark ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-stroke bg-panel-soft/60 px-2 py-0.5 font-mono text-[9.5px] text-ink-muted"
              title="Edits are being written with the dark: prefix. Toggle the theme in the Topbar to edit light styles."
            >
              <AppIcon name="Moon" size={9} className="text-ink-muted" />
              dark:
            </span>
          ) : null}
        </div>
      </div>
      ) : null}

      <div className="flex-1 overflow-auto">
        {panel === "props" && component ? (
          <PropsPanel
            component={component}
            path={path}
            values={propValuesByComp[component.id] ?? {}}
            setValue={(name, val) => setPropValue(component.id, name, val)}
          />
        ) : null}
        {panel === "design" && !component ? <DesignSystemPanel /> : null}
        {panel === "design" && component ? (
        <>
        <Group
          title="Layout"
          headerRight={
            <ResetButton
              onReset={() => {
                const toRemove = [currentDisplay, currentDirection, currentJustify, currentAlignItems, currentGap].filter(Boolean) as string[];
                if (!component || toRemove.length === 0) return;
                let src = component.source;
                // `currentX` values are bare (variant-stripped); re-prefix
                // before deleting so we only clear the current state's entries.
                for (const cls of toRemove) {
                  try { src = setClassAtPath(src, path, withVariant(currentKey, cls), ""); } catch {}
                }
                setSource(component.id, src);
              }}
            />
          }
        >
          <DualRow
            label="Display"
            meta={metaFor((c) => DISPLAY_VALUES.has(c))}
          >
            <IconToggleGroup
              options={DISPLAY_OPTIONS}
              current={currentDisplay}
              onChange={(v) => swap(currentDisplay, v)}
              span={2}
            />
          </DualRow>
          <DualRow
            label="Direction"
            meta={metaFor((c) => DIRECTION_VALUES.has(c))}
          >
            <IconToggleGroup
              options={DIRECTION_OPTIONS}
              current={currentDirection}
              onChange={(v) => swap(currentDirection, v)}
              span={2}
            />
          </DualRow>
          <DualRow
            label="Justify"
            meta={metaFor((c) => JUSTIFY_VALUES.has(c))}
          >
            <IconToggleGroup
              options={JUSTIFY_OPTIONS}
              current={currentJustify}
              onChange={(v) => swap(currentJustify, v)}
              span={2}
              showLabel
            />
          </DualRow>
          <DualRow
            label="Align"
            meta={metaFor((c) => ALIGN_VALUES.has(c))}
          >
            <IconToggleGroup
              options={ALIGN_OPTIONS}
              current={currentAlignItems}
              onChange={(v) => swap(currentAlignItems, v)}
              span={2}
              showLabel
            />
          </DualRow>
          {/* Gap is two independent inputs — horizontal (gap-x, space between
              columns) and vertical (gap-y, space between rows). Setting both
              to the same value collapses back to the tidy `gap-N` unified
              form in the class list. Arrows on the hint are a lightweight
              axis marker so users don't need to remember x/y. */}
          <DualRow
            label="Gap"
            meta={metaFor((c) => /^gap(?:-[xy])?-/.test(c))}
          >
            <SpacingAxisSelect
              n={gapN.x}
              axisHint="↔"
              onChange={(n) => writeGapBoth(n, gapN.y)}
              onStart={captureBaseline}
              onCommit={clearBaseline}
              onCancel={cancelPreview}
              onHover={(n) => writeGapBoth(n, gapN.y)}
            />
            <SpacingAxisSelect
              n={gapN.y}
              axisHint="↕"
              onChange={(n) => writeGapBoth(gapN.x, n)}
              onStart={captureBaseline}
              onCommit={clearBaseline}
              onCancel={cancelPreview}
              onHover={(n) => writeGapBoth(gapN.x, n)}
            />
          </DualRow>
        </Group>

        <Group title="Sizing">
          <DualRow
            label="Width"
            meta={metaFor((c) => /^w-/.test(c))}
          >
            <InputBox
              value={stripPrefix(currentWidth, "w-") ?? ""}
              placeholder={!currentWidth && measured ? `${Math.round(measured.w)}px` : "auto"}
              hint={currentWidth ?? (measured ? "measured" : "—")}
              onCommit={(v) => swap(currentWidth, `w-${v}`)}
            />
            <InputBox value="100" hint="%" readOnly />
          </DualRow>
          <DualRow
            label="Height"
            meta={metaFor((c) => /^h-/.test(c))}
          >
            <InputBox
              value={stripPrefix(currentHeight, "h-") ?? ""}
              placeholder={!currentHeight && measured ? `${Math.round(measured.h)}px` : "auto"}
              hint={currentHeight ?? (measured ? "measured" : "—")}
              onCommit={(v) => swap(currentHeight, `h-${v}`)}
            />
            <InputBox value="—" hint="" readOnly />
          </DualRow>
        </Group>

        <Group
          title="Spacing"
          headerRight={
            <ResetButton
              onReset={() => {
                if (!component) return;
                const toRemove = classes.filter((c) => /^(?:p|m)[trblxy]?-[\d.]+$/.test(c));
                if (toRemove.length === 0) return;
                let src = component.source;
                for (const cls of toRemove) {
                  try { src = setClassAtPath(src, path, withVariant(currentKey, cls), ""); } catch {}
                }
                setSource(component.id, src);
              }}
            />
          }
        >
          <BoxModel
            classes={classes}
            onStart={captureBaseline}
            onEnd={clearBaseline}
            onWrite={(prefix, side, px) => {
              const { cls } = readSideSpacing(classes, prefix, side);
              const n = pxToScale(px);
              swap(cls, `${prefix}${side}-${n}`);
            }}
          />
        </Group>

        <Group title="Typography">
          <DualRow
            label="Family"
            meta={metaFor((c) => FONT_FAMILY_VALUES.has(c))}
          >
            <div className="col-span-2">
              <SelectBox
                value={currentFamily ?? "font-sans"}
                hint={currentFamilyLabel}
                options={fontFamilyOptions}
                onChange={(v) => commit(currentFamily, v)}
                {...preview(currentFamily)}
              />
            </div>
          </DualRow>
          <DualRow
            label="Size"
            meta={metaFor((c) => TEXT_SIZE_VALUES.has(c))}
            scrub={{
              current: currentSize ?? "text-base",
              values: TEXT_SIZES.map((s) => s.value),
              onChange: (v) => swap(currentSize, v),
              onCommit: clearBaseline,
              onStart: captureBaseline,
            }}
          >
            <SelectBox
              value={currentSize ?? "text-base"}
              hint={String(TEXT_SIZES.find((s) => s.value === currentSize)?.px ?? 16)}
              options={TEXT_SIZES.map((s) => ({
                value: s.value,
                label: s.value.replace("text-", ""),
                right: `${s.px}px`,
              }))}
              onChange={(v) => commit(currentSize, v)}
              {...preview(currentSize)}
            />
            <InputBox
              value={String(TEXT_SIZES.find((s) => s.value === currentSize)?.px ?? 16)}
              hint={
                TEXT_SIZES.find((s) => s.value === currentSize)?.lh ?? "leading-6"
              }
              readOnly
            />
          </DualRow>
          <DualRow
            label="Weight"
            meta={metaFor((c) => FONT_WEIGHT_VALUES.has(c))}
            scrub={{
              current: currentWeight ?? "font-normal",
              values: FONT_WEIGHTS.map((f) => f.value),
              onChange: (v) => swap(currentWeight, v),
              onCommit: clearBaseline,
              onStart: captureBaseline,
            }}
          >
            <SelectBox
              value={currentWeight ?? "font-normal"}
              hint={String(
                FONT_WEIGHTS.find((f) => f.value === currentWeight)?.n ?? 400,
              )}
              options={FONT_WEIGHTS.map((f) => ({
                value: f.value,
                label: f.value.replace("font-", ""),
                right: String(f.n),
              }))}
              onChange={(v) => commit(currentWeight, v)}
              {...preview(currentWeight)}
            />
            <InputBox
              value={String(
                FONT_WEIGHTS.find((f) => f.value === currentWeight)?.n ?? 400,
              )}
              hint={currentWeight ?? "font-normal"}
              readOnly
            />
          </DualRow>
          <DualRow
            label="Align"
            meta={metaFor((c) => TEXT_ALIGN_VALUES.has(c))}
          >
            <div className="col-span-2 flex items-center rounded-md border border-stroke bg-panel-soft p-0.5">
              {TEXT_ALIGNS.map((a) => {
                const active = currentAlign === a.value;
                return (
                  <button
                    key={a.value}
                    onClick={() => swap(currentAlign, a.value)}
                    className={
                      "flex flex-1 items-center justify-center h-6 rounded-[4px] transition " +
                      (active
                        ? "bg-panel shadow-sm text-ink"
                        : "text-ink-muted hover:text-ink")
                    }
                  >
                    <AppIcon name={a.icon} size={13} />
                  </button>
                );
              })}
            </div>
          </DualRow>
        </Group>

        <Group title="Colors">
          <DualRow label="Fill" meta={metaFor(colorPred("bg"))}>
            <ColorDropdown
              color={bgColor}
              palette={mergedPalette}
              onChange={(name) => {
                writeColor("bg", name);
                clearBaseline();
              }}
              full
              {...previewColor(currentBg, "bg")}
            />
          </DualRow>
          <DualRow label="Text" meta={metaFor(colorPred("text"))}>
            <ColorDropdown
              color={textColor}
              palette={mergedPalette}
              onChange={(name) => {
                writeColor("text", name);
                clearBaseline();
              }}
              full
              {...previewColor(currentTextColor, "text")}
            />
          </DualRow>
          <DualRow label="Border" meta={metaFor(colorPred("border"))}>
            <ColorDropdown
              color={borderColor}
              palette={mergedPalette}
              placeholder="none"
              onChange={(name) => {
                writeColor("border", name);
                clearBaseline();
              }}
              full
              {...previewColor(currentBorderColor, "border")}
            />
          </DualRow>
        </Group>

        <Group
          title="Borders"
          headerRight={
            <button
              onClick={() => setRadiusSplit((v) => !v)}
              title={
                radiusSplitOpen
                  ? "Unify radius — set all corners together"
                  : "Per-corner radius — TL / TR / BR / BL"
              }
              className={
                "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition " +
                (radiusSplitOpen
                  ? "bg-accent-tint text-accent-ink"
                  : "text-ink-muted hover:bg-panel-soft hover:text-ink")
              }
            >
              <AppIcon name={radiusSplitOpen ? "LayoutGrid" : "Square"} size={11} />
              {radiusSplitOpen ? "corners" : "unified"}
            </button>
          }
        >
          {/* Unified radius — still editable even in per-corner mode,
              where it acts as "set all four at once". */}
          <DualRow
            label="Radius"
            meta={metaFor(
              (c) =>
                RADIUS_VALUES.has(c) ||
                /^rounded(?:-(?:tl|tr|br|bl|t|b|l|r))?(?:-(?:none|sm|md|lg|xl|2xl|3xl|full))?$/.test(
                  c,
                ),
            )}
            scrub={{
              current: currentRadius ?? "rounded-none",
              values: RADIUS_OPTIONS.map((r) => r.value),
              onChange: (v) => swap(currentRadius, v),
              onCommit: clearBaseline,
              onStart: captureBaseline,
            }}
          >
            <SelectBox
              value={currentRadius ?? "rounded-none"}
              hint={String(
                RADIUS_OPTIONS.find((r) => r.value === currentRadius)?.px ?? 0,
              )}
              options={RADIUS_OPTIONS.map((r) => ({
                value: r.value,
                label: r.value.replace("rounded", "rounded") || "rounded",
                right: `${r.px}px`,
              }))}
              onChange={(v) => commit(currentRadius, v)}
              {...preview(currentRadius)}
            />
            {/* Live preview of the effective radius. In unified mode this is
                the selected size; in per-corner mode it shows an outlined
                rectangle with the four corner values applied — so the class
                list's net shape is immediately visible. */}
            <RadiusPreview
              unifiedPx={
                RADIUS_OPTIONS.find((r) => r.value === currentRadius)?.px ?? 0
              }
              perCorner={
                radiusSplitOpen
                  ? {
                      tl: radiusSuffixPx(cornerMap.tl ?? undefined) ?? 0,
                      tr: radiusSuffixPx(cornerMap.tr ?? undefined) ?? 0,
                      br: radiusSuffixPx(cornerMap.br ?? undefined) ?? 0,
                      bl: radiusSuffixPx(cornerMap.bl ?? undefined) ?? 0,
                    }
                  : null
              }
            />
          </DualRow>
          {radiusSplitOpen ? (
            <CornerRadiusGrid
              cornerMap={cornerMap}
              onChange={writeCornerRadius}
              allEqual={cornersAllEqual(cornerMap)}
            />
          ) : null}
          <DualRow
            label="Width"
            meta={metaFor((c) => BORDER_WIDTH_VALUES.has(c))}
            scrub={{
              current: currentBorderW,
              values: BORDER_WIDTHS.map((b) => b.value),
              onChange: (v) => swap(currentBorderW, v),
              onCommit: clearBaseline,
              onStart: captureBaseline,
            }}
          >
            <SelectBox
              value={currentBorderW}
              hint={String(
                BORDER_WIDTHS.find((b) => b.value === currentBorderW)?.px ?? 0,
              )}
              options={BORDER_WIDTHS.map((b) => ({
                value: b.value,
                label: b.value,
                right: `${b.px}px`,
              }))}
              onChange={(v) => commit(currentBorderW, v)}
              {...preview(currentBorderW)}
            />
            <InputBox
              value={String(
                BORDER_WIDTHS.find((b) => b.value === currentBorderW)?.px ?? 0,
              )}
              hint={currentBorderW}
              readOnly
            />
          </DualRow>
          <DualRow
            label="Style"
            meta={metaFor((c) => BORDER_STYLE_VALUES.has(c))}
          >
            <SelectBox
              value={currentBorderStyle ?? "border-solid"}
              hint={(currentBorderStyle ?? "border-solid").replace(
                "border-",
                "",
              )}
              options={BORDER_STYLES.map((s) => ({
                value: s.value,
                label: s.label,
                right: s.label,
              }))}
              onChange={(v) => commit(currentBorderStyle, v)}
              {...preview(currentBorderStyle)}
            />
            {/* Visual hint: a thin sample line with the chosen style so the
                user sees dashed vs dotted vs double without committing. */}
            <div className="flex h-7 items-center rounded-md border border-stroke bg-panel px-2">
              <span
                className="h-0 w-full"
                style={{
                  borderTopWidth: 3,
                  borderTopStyle:
                    (BORDER_STYLES.find(
                      (s) => s.value === (currentBorderStyle ?? "border-solid"),
                    )?.css as React.CSSProperties["borderTopStyle"]) ?? "solid",
                  borderTopColor: "#64748b",
                }}
              />
            </div>
          </DualRow>
        </Group>

        <Group title="Effects" headerRight={<AddButton />}>
          <div className="text-[10.5px] text-ink-faint">No effects</div>
        </Group>

        <LayersGroup
          source={component?.source ?? ""}
          selectedPath={path}
          onSelect={(p) => selectElement(p)}
        />
        </>
        ) : null}
      </div>
    </aside>
  );
}

function stripPrefix(value: string | undefined, prefix: string): string | null {
  if (!value) return null;
  if (!value.startsWith(prefix)) return null;
  return value.slice(prefix.length);
}

function PanelTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: AppIconName;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center gap-1.5 h-9 border-b-2 transition -mb-px " +
        (active
          ? "border-ink text-ink"
          : "border-transparent text-ink-muted hover:text-ink")
      }
    >
      <AppIcon name={icon} size={12} />
      {label}
    </button>
  );
}

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
  return (
    <div className="border-b border-stroke">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-[11px] font-normal text-ink-soft"
        >
          <AppIcon name={open ? "ChevronDown" : "ChevronRight"} size={11} className="text-ink-faint" />
          {title}
        </button>
        {headerRight}
      </div>
      {open ? (
        <div className="flex flex-col gap-1.5 px-3 pb-3">{children}</div>
      ) : null}
    </div>
  );
}

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      onClick={onReset}
      className="text-[10px] text-ink-muted hover:text-ink"
    >
      Reset
    </button>
  );
}

function IconToggleGroup<T extends { value: string; icon: AppIconName; label?: string }>(
  { options, current, onChange, span, showLabel }: {
    options: T[];
    current: string | undefined;
    onChange: (v: string) => void;
    span?: 1 | 2;
    showLabel?: boolean;
  },
) {
  const activeLabel = options.find((o) => o.value === current)?.label;
  return (
    <div className={(span === 2 ? "col-span-2 " : "") + "flex flex-col gap-0.5"}>
      <div className="flex items-center rounded-md border border-stroke bg-panel-soft p-0.5">
        {options.map((o) => {
          const active = current === o.value;
          return (
            <button
              key={o.value}
              title={o.value}
              onClick={() => onChange(o.value)}
              className={
                "flex flex-1 items-center justify-center h-6 rounded-[4px] transition " +
                (active
                  ? "bg-panel shadow-sm text-ink"
                  : "text-ink-muted hover:text-ink")
              }
            >
              <AppIcon name={o.icon} size={13} />
            </button>
          );
        })}
      </div>
      {showLabel ? (
        <span className="pl-1 text-[9.5px] text-ink-faint">{activeLabel ?? "—"}</span>
      ) : null}
    </div>
  );
}

function BoxModel({
  classes,
  onWrite,
  onStart,
  onEnd,
}: {
  classes: string[];
  onWrite: (prefix: "p" | "m", side: Side, px: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  const m = {
    t: readSideSpacing(classes, "m", "t"),
    r: readSideSpacing(classes, "m", "r"),
    b: readSideSpacing(classes, "m", "b"),
    l: readSideSpacing(classes, "m", "l"),
  };
  const p = {
    t: readSideSpacing(classes, "p", "t"),
    r: readSideSpacing(classes, "p", "r"),
    b: readSideSpacing(classes, "p", "b"),
    l: readSideSpacing(classes, "p", "l"),
  };
  return (
    <div className="col-span-full -mx-1 rounded-md border border-stroke bg-panel-soft px-2 py-3">
      <div className="relative">
        <span className="absolute left-1 top-1 text-[10px] font-normal text-ink-faint">
          Margin
        </span>
        <div className="mx-auto flex w-full flex-col items-center">
          <SideInput side="t" kind="m" value={m.t.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("m", "t", v)} />
          <div className="flex w-full items-center justify-between gap-1 py-1">
            <SideInput side="l" kind="m" value={m.l.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("m", "l", v)} />
            <div className="relative flex-1 rounded-sm bg-emerald-100/70 py-3">
              <div className="flex flex-col items-center">
                <SideInput side="t" kind="p" accent value={p.t.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("p", "t", v)} />
                <div className="flex w-full items-center justify-between gap-1 py-1">
                  <SideInput side="l" kind="p" accent value={p.l.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("p", "l", v)} />
                  <div className="h-6 flex-1" />
                  <SideInput side="r" kind="p" accent value={p.r.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("p", "r", v)} />
                </div>
                <SideInput side="b" kind="p" accent value={p.b.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("p", "b", v)} />
              </div>
            </div>
            <SideInput side="r" kind="m" value={m.r.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("m", "r", v)} />
          </div>
          <SideInput side="b" kind="m" value={m.b.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("m", "b", v)} />
        </div>
      </div>
    </div>
  );
}

const SIDE_ICON: Record<Side, AppIconName> = {
  t: "ArrowUp",
  r: "ArrowRight",
  b: "ArrowDown",
  l: "ArrowLeft",
};

function SideInput({
  value,
  accent,
  side,
  kind,
  onCommit,
  onStart,
  onEnd,
}: {
  value: number;
  accent?: boolean;
  side: Side;
  kind: "p" | "m";
  onCommit: (v: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  const [local, setLocal] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  useEffect(() => setLocal(String(value)), [value]);

  const beginScrub = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startVal = value;
    let moved = false;
    let lastVal = startVal;
    onStart?.();
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 2) {
        moved = true;
        setScrubbing(true);
      }
      const next = Math.max(0, Math.round(startVal + dx / 2));
      if (next !== lastVal) {
        lastVal = next;
        setLocal(String(next));
        onCommit(next);
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setScrubbing(false);
      onEnd?.();
      if (!moved) {
        // Treat as a plain click — focus the input for typing.
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const iconName = SIDE_ICON[side];
  const accentCls = accent ? "text-emerald-900" : "text-ink-muted";
  return (
    <div
      className={
        "group relative flex items-center justify-center rounded border border-transparent " +
        (scrubbing ? "border-accent bg-panel" : "hover:border-stroke ")
      }
    >
      <button
        onMouseDown={beginScrub}
        title={`Scrub ${kind}${side}`}
        className={
          "grid h-5 w-3 shrink-0 place-items-center cursor-ew-resize opacity-0 group-hover:opacity-60 hover:!opacity-100 " +
          accentCls
        }
      >
        <AppIcon name={iconName} size={9} />
      </button>
      <input
        ref={inputRef}
        value={local}
        onMouseDown={(e) => {
          // Allow the parent div drag to handle scrub; if the user actually
          // clicks without moving we re-focus in the mouseup handler.
          if (document.activeElement !== inputRef.current) beginScrub(e);
        }}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const n = Number(local);
          if (!Number.isNaN(n) && n !== value) onCommit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={
          "h-5 w-8 bg-transparent text-center text-[10.5px] outline-none focus:cursor-text " +
          accentCls
        }
      />
    </div>
  );
}

function AddButton() {
  return (
    <button className="flex items-center gap-0.5 text-[10px] text-ink-muted hover:text-ink">
      <AppIcon name="Plus" size={11} /> Add
    </button>
  );
}

type ScrubConfig = {
  current: string;
  values: string[];
  onChange: (v: string) => void;
  onStart?: () => void;
  onCommit?: () => void;
};

function DualRow({
  label,
  children,
  scrub,
  meta,
}: {
  label: string;
  children: React.ReactNode;
  scrub?: ScrubConfig;
  /** Per-field variant metadata — drives inherit indicator, override
   *  accent, and base-mode pips. Undefined = neutral styling. */
  meta?: FieldMeta;
}) {
  const inherited = meta?.inherited ?? false;
  const overrides = meta?.overrides ?? false;
  const overriddenBy = meta?.overriddenBy ?? [];
  const currentState = meta?.currentState ?? "base";

  // Tailwind's arbitrary-descendant selectors let us restyle the input
  // children without threading props through every control. `.wnd-field`
  // is the shared field-shell class set on InputBox / SelectBox / the
  // ColorDropdown trigger etc., so these rules hit the visible frame
  // without touching any control's own focus/hover styles.
  //
  //   inherited → dashed border + muted text: "this value isn't mine"
  //   overrides → state-colored border + subtle inset ring that matches
  //               the active state tab and the base-mode pips, so the
  //               whole three-surface system reads as one color language.
  //
  // No-op in base state or when meta is omitted.
  const descendantClasses = inherited
    ? "[&_.wnd-field]:border-dashed [&_.wnd-field]:text-ink-muted [&_.wnd-field]:italic"
    : overrides && currentState !== "base"
      ? STATE_STYLE[currentState as Exclude<StateVariant, "base">].fieldClasses
      : "";

  return (
    <div
      className={
        "grid min-w-0 grid-cols-[46px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5 " +
        descendantClasses
      }
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1">
          {inherited ? (
            // Unicode ↳ (U+21B3): reads as "fallback/inherited from above"
            // without pulling an icon import. Aligns with the dashed-border
            // treatment on the field next to it so the signal reads both
            // on the label and the input at once.
            <span
              aria-hidden
              title="Inherits from base — edit to override"
              className="shrink-0 font-mono text-[9px] leading-none text-ink-faint"
            >
              ↳
            </span>
          ) : null}
          {scrub ? (
            <ScrubLabel label={label} scrub={scrub} />
          ) : (
            <span
              className={
                "truncate text-[10.5px] " +
                (inherited ? "italic text-ink-faint" : "text-ink-muted")
              }
            >
              {label}
            </span>
          )}
        </span>
        {overriddenBy.length > 0 ? (
          <StateOverridePips states={overriddenBy} />
        ) : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Tight row of state-colored dots showing which non-base states override
 * the adjacent property. Lives under the field label when the current
 * state is base; invisible otherwise. Each pip's title attribute carries
 * the state name so hovering gives the attribution without adding text
 * that would bloat the 46px label column.
 */
function StateOverridePips({
  states,
}: {
  states: Array<Exclude<StateVariant, "base">>;
}) {
  return (
    <span
      className="flex items-center gap-0.5"
      title={`Also overridden in: ${states.join(", ")}`}
    >
      {states.map((s) => (
        <span
          key={s}
          aria-label={`override in ${s}`}
          className="size-1.5 rounded-full"
          style={{ backgroundColor: STATE_PIP_COLOR[s] }}
        />
      ))}
    </span>
  );
}

function ScrubLabel({ label, scrub }: { label: string; scrub: ScrubConfig }) {
  const [dragging, setDragging] = useState(false);
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startIdx = Math.max(0, scrub.values.indexOf(scrub.current));
    scrub.onStart?.();
    let moved = false;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 2) moved = true;
      const steps = Math.round(dx / 4);
      const idx = Math.min(
        scrub.values.length - 1,
        Math.max(0, startIdx + steps),
      );
      const next = scrub.values[idx];
      if (next && next !== scrub.current) scrub.onChange(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDragging(false);
      scrub.onCommit?.();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    setDragging(true);
    void moved;
  };
  return (
    <span
      onMouseDown={onMouseDown}
      title="Drag to scrub"
      className={
        "select-none truncate text-[10.5px] text-ink-muted cursor-ew-resize hover:text-ink " +
        (dragging ? "text-accent-ink" : "")
      }
    >
      {label}
    </span>
  );
}

function InputBox({
  value,
  hint,
  readOnly,
  full,
  placeholder,
  onCommit,
}: {
  value: string;
  hint: string;
  readOnly?: boolean;
  full?: boolean;
  placeholder?: string;
  onCommit?: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);
  return (
    <div
      className={
        "wnd-field flex h-7 items-center gap-1 rounded-md border border-stroke bg-panel px-2 " +
        (full ? "col-span-2 " : "") +
        (readOnly ? "opacity-100" : "focus-within:border-accent")
      }
    >
      <input
        value={local}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onCommit?.(local)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="min-w-0 flex-1 bg-transparent text-[11px] text-ink placeholder:text-ink-faint/70 outline-none"
      />
      {hint ? (
        <span className="shrink-0 text-[10px] font-mono text-ink-faint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function useOutsideClick<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);
  return ref;
}

function SelectBox({
  value,
  hint,
  options,
  onChange,
  onOpen,
  onHover,
  onCancel,
}: {
  value: string;
  hint: string;
  options: { value: string; label: string; right?: string }[];
  onChange: (v: string) => void;
  onOpen?: () => void;
  onHover?: (v: string) => void;
  onCancel?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const close = (cancel: boolean) => {
    setOpen(false);
    if (cancel) onCancel?.();
  };
  const ref = useOutsideClick<HTMLDivElement>(open, () => close(true));
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((o) => !o);
        }}
        className="flex h-7 w-full items-center gap-1 wnd-field rounded-md border border-stroke bg-panel px-2 hover:border-stroke-strong"
      >
        <span className="min-w-0 flex-1 truncate text-left text-[11px] text-ink">
          {hint}
        </span>
        <span className="shrink-0 text-[10px] font-mono text-ink-faint">
          {value.replace(/^text-|^font-|^rounded-?|^border-?/, "") || value}
        </span>
        <AppIcon name="ChevronDown" size={11} className="text-ink-faint" />
      </button>
      {open ? (
        <div
          onMouseLeave={() => onHover?.(value)}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 rounded-md border border-stroke bg-panel p-1 shadow-lg"
        >
          <div className="flex items-center gap-1 rounded border border-stroke bg-panel-soft px-1.5 py-1">
            <AppIcon name="Search" size={11} className="text-ink-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
            />
          </div>
          <div className="mt-1 max-h-56 overflow-auto">
            {filtered.map((o) => {
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  onMouseEnter={() => onHover?.(o.value)}
                  onClick={() => {
                    onChange(o.value);
                    close(false);
                  }}
                  className={
                    "flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] " +
                    (active
                      ? "bg-accent-tint text-accent-ink"
                      : "text-ink hover:bg-panel-soft")
                  }
                >
                  <span className="flex-1 truncate text-left font-mono">
                    {o.label}
                  </span>
                  {o.right ? (
                    <span className="text-[10px] text-ink-faint">{o.right}</span>
                  ) : null}
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-[10.5px] text-ink-faint">
                No match
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Live visual preview of the current radius, shown on the right of the
// Radius dropdown. In unified mode it renders a square with the uniform
// radius applied; in per-corner mode each corner uses its own value so you
// see the actual shape you're building.
function RadiusPreview({
  unifiedPx,
  perCorner,
}: {
  unifiedPx: number;
  perCorner: Record<CornerKey, number> | null;
}) {
  // Clamp preview sizes so rounded-full doesn't blow past the cell height.
  const cap = (v: number) => Math.min(v, 13);
  const style: React.CSSProperties = perCorner
    ? {
        borderTopLeftRadius: cap(perCorner.tl),
        borderTopRightRadius: cap(perCorner.tr),
        borderBottomRightRadius: cap(perCorner.br),
        borderBottomLeftRadius: cap(perCorner.bl),
      }
    : { borderRadius: cap(unifiedPx) };
  return (
    <div className="flex h-7 items-center justify-center rounded-md border border-stroke bg-panel px-2">
      <div
        className="h-5 w-8 border border-ink-faint/70 bg-accent-tint"
        style={style}
      />
    </div>
  );
}

// Per-corner radius grid — 2x2 of SelectBoxes, visually arranged as they
// appear on the shape (TL top-left, TR top-right, BL bottom-left, BR
// bottom-right). Compact because borders already take up a lot of the
// inspector.
function CornerRadiusGrid({
  cornerMap,
  onChange,
  allEqual,
}: {
  cornerMap: Record<CornerKey, string | null>;
  onChange: (corner: CornerKey, suffix: string) => void;
  allEqual: boolean;
}) {
  const options = RADIUS_SUFFIXES.map((s) => {
    const cls = s === "" ? "rounded" : `rounded-${s}`;
    const px = RADIUS_OPTIONS.find((r) => r.value === cls)?.px ?? 0;
    return {
      value: s,
      label: s === "" ? "4px" : s,
      right: `${px}px`,
    };
  });
  const render = (c: CornerKey, labelAlign: string) => {
    const cur = cornerMap[c] ?? "none";
    const px = radiusSuffixPx(cornerMap[c] ?? undefined) ?? 0;
    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className={
            "text-[9px] font-mono uppercase text-ink-faint " + labelAlign
          }
        >
          {c}
        </span>
        <SelectBox
          value={cur}
          hint={String(px)}
          options={options}
          onChange={(v) => onChange(c, v)}
        />
      </div>
    );
  };
  return (
    <div
      className={
        "grid grid-cols-2 gap-1.5 rounded-md border border-dashed p-2 transition " +
        (allEqual
          ? "border-stroke bg-panel-soft/30"
          : "border-accent/30 bg-accent-tint/40")
      }
      title={
        allEqual
          ? "All corners match — will save as the unified rounded-* class."
          : "Corners differ — each will save as rounded-tl/tr/br/bl-*."
      }
    >
      {render("tl", "text-left")}
      {render("tr", "text-right")}
      {render("bl", "text-left")}
      {render("br", "text-right")}
    </div>
  );
}

// Variant of SpacingSelect that works with raw scale numbers ("0", "1",
// "1.5"…) rather than full class names. Used by the split gap row where
// each axis needs its own value independent of the prefix (gap-x vs gap-y).
// The `axisHint` slot shows a tiny arrow so X/Y are obvious.
function SpacingAxisSelect({
  n,
  axisHint,
  onChange,
  onStart,
  onCommit,
  onCancel,
  onHover,
}: {
  n: string;
  axisHint: string;
  onChange: (n: string) => void;
  onStart?: () => void;
  onCommit?: () => void;
  onCancel?: () => void;
  onHover?: (n: string) => void;
}) {
  const options = SPACING_SCALE.map((s) => ({
    value: s.n,
    label: s.n,
    right: `${s.px}px`,
  }));
  return (
    <SelectBox
      value={n}
      hint={`${axisHint} ${n}`}
      options={options}
      onChange={(v) => {
        onStart?.();
        onChange(v);
        onCommit?.();
      }}
      onOpen={onStart}
      onHover={onHover}
      onCancel={onCancel}
    />
  );
}

function ColorDropdown({
  color,
  palette,
  onChange,
  placeholder,
  full,
  onOpen,
  onHover,
  onCancel,
}: {
  color: ExtPaletteColor | undefined;
  palette: ExtPaletteColor[];
  onChange: (name: string) => void;
  placeholder?: string;
  full?: boolean;
  onOpen?: () => void;
  onHover?: (name: string) => void;
  onCancel?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const close = (cancel: boolean) => {
    setOpen(false);
    if (cancel) onCancel?.();
  };
  const ref = useOutsideClick<HTMLDivElement>(open, () => close(true));
  // Partition the palette into project tokens (top, grouped under a
  // "Project tokens" header) and the Tailwind reference palette below.
  // Filter is case-insensitive substring over name.
  const { tokenRows, staticRows } = useMemo(() => {
    const filtered = q
      ? palette.filter((p) =>
          p.name.toLowerCase().includes(q.toLowerCase()),
        )
      : palette;
    return {
      tokenRows: filtered.filter((p) => p.kind === "token"),
      staticRows: filtered.filter((p) => p.kind === "static"),
    };
  }, [q, palette]);

  return (
    <div ref={ref} className={"relative " + (full ? "col-span-2" : "")}>
      <button
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((o) => !o);
        }}
        className="flex h-7 w-full items-center gap-2 rounded-md border border-stroke bg-panel px-1.5 hover:border-stroke-strong"
      >
        {color ? (
          <span
            className="size-4 shrink-0 rounded-[4px] border border-stroke"
            style={{
              backgroundColor: color.hex === "transparent" ? "#fff" : color.hex,
              backgroundImage:
                color.hex === "transparent"
                  ? "linear-gradient(45deg,#eee 25%,transparent 25%,transparent 75%,#eee 75%),linear-gradient(45deg,#eee 25%,transparent 25%,transparent 75%,#eee 75%)"
                  : undefined,
              backgroundSize: "6px 6px",
              backgroundPosition: "0 0, 3px 3px",
            }}
          />
        ) : (
          <span className="size-4 shrink-0 rounded-[4px] border border-stroke bg-[linear-gradient(135deg,transparent_calc(50%-1px),#ef4444_calc(50%-1px),#ef4444_calc(50%+1px),transparent_calc(50%+1px))]" />
        )}
        <span
          className={
            "min-w-0 flex-1 truncate text-left text-[11px] " +
            (color?.kind === "token" ? "text-accent-ink" : "text-ink")
          }
        >
          {color?.name ?? placeholder ?? "—"}
        </span>
        <span className="shrink-0 font-mono text-[10px] uppercase text-ink-faint">
          {color?.hex ?? "—"}
        </span>
      </button>
      {open ? (
        <div
          onMouseLeave={() => onHover?.(color?.name ?? "")}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 rounded-md border border-stroke bg-panel p-1 shadow-lg"
        >
          <div className="flex items-center gap-1 rounded border border-stroke bg-panel-soft px-1.5 py-1">
            <AppIcon name="Search" size={11} className="text-ink-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search color (e.g. primary, emerald-600)"
              className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
            />
          </div>
          <div className="mt-1 max-h-64 overflow-auto">
            {tokenRows.length > 0 ? (
              <>
                <ColorGroupHeader label="Project tokens" />
                {tokenRows.map((p) => (
                  <ColorRow
                    key={`t:${p.name}`}
                    p={p}
                    active={color?.name === p.name && color.kind === "token"}
                    onHover={onHover}
                    onPick={(name) => {
                      onChange(name);
                      close(false);
                    }}
                  />
                ))}
              </>
            ) : null}
            {staticRows.length > 0 ? (
              <>
                <ColorGroupHeader
                  label={tokenRows.length > 0 ? "Tailwind palette" : "Palette"}
                />
                {staticRows.map((p) => (
                  <ColorRow
                    key={`s:${p.name}`}
                    p={p}
                    active={color?.name === p.name && color.kind === "static"}
                    onHover={onHover}
                    onPick={(name) => {
                      onChange(name);
                      close(false);
                    }}
                  />
                ))}
              </>
            ) : null}
            {tokenRows.length === 0 && staticRows.length === 0 ? (
              <div className="px-2 py-2 text-[10.5px] text-ink-faint">
                No match
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ColorGroupHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 bg-panel px-1.5 pb-0.5 pt-1.5 text-[10px] font-normal text-ink-faint">
      {label}
    </div>
  );
}

function ColorRow({
  p,
  active,
  onHover,
  onPick,
}: {
  p: ExtPaletteColor;
  active: boolean;
  onHover?: (name: string) => void;
  onPick: (name: string) => void;
}) {
  return (
    <button
      onMouseEnter={() => onHover?.(p.name)}
      onClick={() => onPick(p.name)}
      className={
        "flex w-full items-center gap-2 rounded px-1.5 py-1 text-[11px] " +
        (active ? "bg-accent-tint" : "hover:bg-panel-soft")
      }
    >
      <span
        className="size-4 shrink-0 rounded-[4px] border border-stroke"
        style={{
          backgroundColor: p.hex === "transparent" ? "#fff" : p.hex,
        }}
      />
      <span
        className={
          "min-w-0 flex-1 truncate text-left font-mono " +
          (p.kind === "token" ? "text-accent-ink" : "text-ink")
        }
      >
        {p.name}
      </span>
      <span className="shrink-0 font-mono text-[10px] uppercase text-ink-faint">
        {p.hex}
      </span>
    </button>
  );
}

function PropsPanel({
  component,
  path,
  values,
  setValue,
}: {
  component: { id: string; source: string };
  path: string;
  values: Record<string, string>;
  setValue: (name: string, v: string) => void;
}) {
  const setSource = useProject((s) => s.setSource);
  const selectElement = useProject((s) => s.selectElement);
  const clearPropValue = useProject((s) => s.clearPropValue);

  const props = useMemo(() => {
    try {
      return listProps(component.source);
    } catch {
      return [];
    }
  }, [component.source]);

  const canBindHere = useMemo(() => {
    try {
      return isTextLeaf(component.source, path) && getTextAtPath(component.source, path) !== null;
    } catch {
      return false;
    }
  }, [component.source, path]);

  const selectionIsBound = useMemo(() => {
    return props.some((p) => p.usedAtPaths.includes(path));
  }, [props, path]);

  const [newName, setNewName] = useState("");

  const bind = () => {
    const text = getTextAtPath(component.source, path);
    if (text === null) return;
    const name = newName.trim() || "label";
    try {
      const { code } = bindTextPropAtPath(component.source, path, name, text);
      setSource(component.id, code);
      setNewName("");
    } catch (e) {
      console.error(e);
    }
  };

  const unbind = (propName: string) => {
    // Unbind at every usage path
    let code = component.source;
    try {
      const p = props.find((x) => x.name === propName);
      if (!p) return;
      for (const usage of p.usedAtPaths) {
        code = unbindPropAtPath(code, usage);
      }
      setSource(component.id, code);
      clearPropValue(component.id, propName);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Group title="Props" headerRight={null}>
      {canBindHere && !selectionIsBound ? (
        <div className="col-span-2 flex items-center gap-1.5 rounded-md border border-dashed border-stroke bg-panel-soft p-1.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="prop name"
            className="min-w-0 flex-1 rounded-md border border-stroke bg-panel px-2 py-1 text-[11px] text-ink outline-none focus:border-accent"
          />
          <button
            onClick={bind}
            className="rounded-md bg-accent px-2 py-1 text-[10.5px] font-semibold text-white hover:brightness-105"
          >
            Bind text
          </button>
        </div>
      ) : null}
      {props.length === 0 ? (
        <div className="col-span-2 text-[10.5px] text-ink-faint">
          {canBindHere ? "Name a prop and bind the selected text." : "Select a text element to bind it to a prop."}
        </div>
      ) : null}
      {props.map((p) => {
        const override = values[p.name];
        const current = override ?? p.default;
        const isSelection = p.usedAtPaths.includes(path);
        return (
          <div key={p.name} className="col-span-2 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 text-[10.5px] text-ink">
                <span className="font-mono text-[10px] text-accent-ink">{p.name}</span>
                {p.usedAtPaths[0] ? (
                  <button
                    onClick={() => selectElement(p.usedAtPaths[0])}
                    className={
                      "rounded-full px-1.5 py-0.5 text-[9.5px] " +
                      (isSelection ? "bg-accent-tint text-accent-ink" : "bg-panel-soft text-ink-muted hover:text-ink")
                    }
                    title="Jump to bound element"
                  >
                    {p.usedAtPaths.length} use{p.usedAtPaths.length === 1 ? "" : "s"}
                  </button>
                ) : null}
              </div>
              <button
                onClick={() => unbind(p.name)}
                className="text-[10px] text-ink-faint hover:text-ink"
                title="Unbind"
              >
                unbind
              </button>
            </div>
            <div className="flex items-center gap-1">
              <InputBox
                value={current}
                hint={override !== undefined ? "override" : "default"}
                onCommit={(v) => setValue(p.name, v)}
                full
              />
            </div>
          </div>
        );
      })}
    </Group>
  );
}

function LayersGroup({
  source,
  selectedPath,
  onSelect,
}: {
  source: string;
  selectedPath: string;
  onSelect: (p: WonderPath) => void;
}) {
  const layers = useMemo(() => {
    if (!source) return [];
    try {
      const ast = parseSource(source);
      const root = findRootJSXElement(ast);
      if (!root) return [];
      const out: { path: string; depth: number; tag: string; className: string }[] = [];
      walkJSX(root, (el, p) => {
        const depth = p.split(".").length - 1;
        const name = el.openingElement.name;
        let tag = "?";
        if (t.isJSXIdentifier(name)) tag = name.name;
        const attr = getJSXAttr(el, "className");
        let cls = "";
        if (attr) {
          const v = attr.value;
          if (t.isStringLiteral(v)) cls = v.value;
          else if (t.isJSXExpressionContainer(v) && t.isStringLiteral(v.expression)) {
            cls = v.expression.value;
          }
        }
        out.push({ path: p, depth, tag, className: cls });
      });
      return out;
    } catch {
      return [];
    }
  }, [source]);

  return (
    <Group title="Layers">
      <div className="flex flex-col">
        {layers.map((l) => {
          const active = l.path === selectedPath;
          const clsPreview = l.className
            .split(/\s+/)
            .filter(Boolean)
            .map((c) => `.${c}`)
            .join("");
          return (
            <button
              key={l.path}
              onClick={() => onSelect(l.path)}
              className={
                "group flex items-center gap-1 rounded px-1 py-0.5 text-left text-[10.5px] " +
                (active ? "bg-accent-tint" : "hover:bg-panel-soft")
              }
              style={{ paddingLeft: 4 + l.depth * 10 }}
            >
              <AppIcon
                name="ChevronDown"
                size={10}
                className="shrink-0 text-ink-faint"
              />
              <span className="font-mono text-pink-600">&lt;{l.tag}&gt;</span>
              <span className="min-w-0 flex-1 truncate font-mono text-ink-muted">
                {clsPreview}
              </span>
              <AppIcon
                name="Eye"
                size={10}
                className="shrink-0 text-ink-faint opacity-0 group-hover:opacity-100"
              />
            </button>
          );
        })}
      </div>
    </Group>
  );
}
