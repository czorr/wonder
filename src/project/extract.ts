// ---------------------------------------------------------------------------
// Design system extraction.
//
// Walks every component's JSX, collects Tailwind palette classes from
// `className` strings, and returns a ranked list of colors present in the
// project. The UI pairs each extracted color with a "target" (a token
// family.shade), and `applyExtraction` performs the combined mutation:
//
//   1. Write the extracted hex into the target token slot (creating the
//      family if it's new).
//   2. Rewrite every matching class in every source to the new utility —
//      `bg-emerald-500` → `bg-primary`, `hover:text-zinc-900` →
//      `hover:text-neutral-ink`, etc.
//
// Not covered in v1 (intentional):
//   - Arbitrary color values (`bg-[#ff0000]`). Adding support means we also
//     need to come up with a palette name, which is a UX rabbit hole.
//   - Fonts. Most projects inherit from the root stylesheet; per-element
//     `font-*` classes are too rare to justify the code.
//   - Radii. Trivial to add later (same structural pattern) but adds modal
//     complexity for marginal benefit.
//   - Dynamic classes (`cn(...)`, template interpolations). We only read
//     string-literal className values; anything we can't parse is silently
//     skipped during extraction AND during the rewrite.
// ---------------------------------------------------------------------------

import * as t from "@babel/types";
import { parseSource, printSource } from "@/ast/parse";
import { findRootJSXElement, walkJSX, getJSXAttr } from "@/ast/selectors";
import { PALETTE_BY_NAME } from "@/ast/palette";
import type { WonderComponent } from "@/store/project";
import type { Tokens } from "@/project/tokens";

// Tailwind utility prefixes that accept a color argument. We cover the common
// set — rarer ones (`placeholder`, `marker`, `selection`) can be added if a
// project surfaces them.
const COLOR_PREFIXES = new Set([
  "bg",
  "text",
  "border",
  "ring",
  "outline",
  "divide",
  "fill",
  "stroke",
  "from",
  "via",
  "to",
  "accent",
  "caret",
  "shadow",
  "decoration",
  "placeholder",
]);

export type ExtractedColor = {
  /** Tailwind palette name like "emerald-500" or "white". */
  paletteName: string;
  /** Resolved hex (or "transparent"). */
  hex: string;
  /** Total class-occurrences across all components. */
  count: number;
  /** Component ids that reference this color at least once. */
  componentIds: string[];
};

export type ExtractionResult = {
  colors: ExtractedColor[];
  /** Components where AST parsing failed. Surfaced so the UI can warn. */
  unparseableIds: string[];
};

// ---------------------------------------------------------------------------
// Parse a class token into (prefix, palette-name). Handles variant chains
// like `hover:bg-zinc-900` or `dark:md:text-white`.
// ---------------------------------------------------------------------------

function parseColorClass(
  token: string,
): { prefix: string; paletteName: string } | null {
  // Split variants; colors live in the final segment only. `dark:hover:` etc.
  const colonIdx = token.lastIndexOf(":");
  const leaf = colonIdx >= 0 ? token.slice(colonIdx + 1) : token;

  // <prefix>-<family>-<shade>, e.g. `bg-emerald-500`
  const numbered = leaf.match(/^([a-z]+)-([a-z]+-\d+)$/);
  if (numbered) {
    if (!COLOR_PREFIXES.has(numbered[1])) return null;
    return { prefix: numbered[1], paletteName: numbered[2] };
  }

  // <prefix>-(white|black|transparent), e.g. `bg-white`
  const special = leaf.match(/^([a-z]+)-(white|black|transparent)$/);
  if (special) {
    if (!COLOR_PREFIXES.has(special[1])) return null;
    return { prefix: special[1], paletteName: special[2] };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export function extractFromSources(
  components: Record<string, WonderComponent>,
  order: string[],
): ExtractionResult {
  type Agg = { count: number; componentIds: Set<string> };
  const byPalette = new Map<string, Agg>();
  const unparseableIds: string[] = [];

  for (const id of order) {
    const c = components[id];
    if (!c) continue;
    let ast;
    try {
      ast = parseSource(c.source);
    } catch {
      unparseableIds.push(id);
      continue;
    }
    const root = findRootJSXElement(ast);
    if (!root) continue;

    walkJSX(root, (el) => {
      const attr = getJSXAttr(el, "className");
      if (!attr) return;
      const classString = readStaticClassName(attr);
      if (classString === null) return;
      for (const token of classString.split(/\s+/).filter(Boolean)) {
        const parsed = parseColorClass(token);
        if (!parsed) continue;
        if (!PALETTE_BY_NAME.has(parsed.paletteName)) continue;
        const agg = byPalette.get(parsed.paletteName) ?? {
          count: 0,
          componentIds: new Set<string>(),
        };
        agg.count++;
        agg.componentIds.add(id);
        byPalette.set(parsed.paletteName, agg);
      }
    });
  }

  const colors: ExtractedColor[] = [];
  for (const [paletteName, agg] of byPalette.entries()) {
    const pal = PALETTE_BY_NAME.get(paletteName)!;
    colors.push({
      paletteName,
      hex: pal.hex,
      count: agg.count,
      componentIds: Array.from(agg.componentIds),
    });
  }
  // Most-used first. The auto-suggester picks target roles greedily in this
  // order, which lines up with users' intuition ("the color I use most IS the
  // primary").
  colors.sort((a, b) => b.count - a.count);

  return { colors, unparseableIds };
}

function readStaticClassName(attr: t.JSXAttribute): string | null {
  const v = attr.value;
  if (t.isStringLiteral(v)) return v.value;
  if (t.isJSXExpressionContainer(v) && t.isStringLiteral(v.expression)) {
    return v.expression.value;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Suggestion engine.
//
// Greedy first-fit: sort extracted colors by count desc, for each one pick
// the best-matching unclaimed role based on family kind (chromatic / neutral
// / white/black) + shade tier (light / mid / dark). If nothing fits, leave
// it unassigned — the user decides.
//
// The ROLE_SLOTS list doubles as the set of "recommended" targets. Users can
// still pick arbitrary family/shade combos in the modal dropdown.
// ---------------------------------------------------------------------------

export type ShadeTier = "light" | "mid" | "dark" | "extreme";
export type FamilyKind = "chromatic" | "neutral" | "white" | "black" | "transparent";

const NEUTRAL_FAMILIES = new Set(["slate", "gray", "zinc", "neutral", "stone"]);

export function familyKind(paletteName: string): FamilyKind {
  if (paletteName === "white") return "white";
  if (paletteName === "black") return "black";
  if (paletteName === "transparent") return "transparent";
  const fam = paletteName.split("-")[0];
  if (NEUTRAL_FAMILIES.has(fam)) return "neutral";
  return "chromatic";
}

export function shadeTier(paletteName: string): ShadeTier {
  if (paletteName === "white" || paletteName === "transparent") return "extreme";
  if (paletteName === "black") return "extreme";
  const m = paletteName.match(/-(\d+)$/);
  if (!m) return "mid";
  const n = parseInt(m[1], 10);
  if (n <= 200) return "light";
  if (n <= 500) return "mid";
  return "dark";
}

export type Assignment = {
  paletteName: string;
  target: { family: string; shade: string } | null; // null = skip
};

type Role = { family: string; shade: string };

/**
 * Build a first-cut mapping. The modal displays this as pre-filled state
 * that the user can override per-row. Never returns a conflicting double-
 * assignment (no two colors targeting the same family.shade).
 */
export function suggestAssignments(
  colors: ExtractedColor[],
  currentTokens: Tokens,
): Assignment[] {
  const claimed = new Set<string>();
  const keyOf = (r: Role) => `${r.family}.${r.shade}`;

  // Pre-claim any role whose current token value is hand-edited AWAY from
  // defaults — we don't want to auto-overwrite a value the user set on
  // purpose. We approximate "hand-edited" by comparing against the default
  // token seed hexes; a near-match means the user probably hasn't touched
  // it, so we can auto-fill.
  // Actually the simpler rule: only auto-claim slots whose current hex
  // matches an extracted color — then the suggestion is a no-op anyway
  // (we're just promoting the class name, the value doesn't move). This
  // feels safest.

  const assignments: Assignment[] = [];

  // Greedy slot allocation. The order below encodes priority — we fill
  // DEFAULTs first (they're the most structurally important), then
  // supporting shades.
  for (const c of colors) {
    const kind = familyKind(c.paletteName);
    const tier = shadeTier(c.paletteName);
    const role = pickRole(kind, tier, claimed);
    if (!role) {
      assignments.push({ paletteName: c.paletteName, target: null });
      continue;
    }
    claimed.add(keyOf(role));
    assignments.push({ paletteName: c.paletteName, target: role });
  }
  // currentTokens is unused for now — future heuristics can lean on it
  // (e.g. "this color is already assigned to primary, lock it in"). Keep
  // the parameter so callers don't churn when we add that.
  void currentTokens;
  return assignments;
}

function pickRole(
  kind: FamilyKind,
  tier: ShadeTier,
  claimed: Set<string>,
): Role | null {
  const tryClaim = (family: string, shade: string): Role | null => {
    const key = `${family}.${shade}`;
    if (claimed.has(key)) return null;
    return { family, shade };
  };

  if (kind === "chromatic") {
    if (tier === "mid") return tryClaim("primary", "DEFAULT");
    if (tier === "dark") return tryClaim("primary", "ink");
    if (tier === "light") return tryClaim("primary", "soft");
  }
  if (kind === "neutral") {
    if (tier === "dark") return tryClaim("neutral", "ink");
    if (tier === "mid") return tryClaim("neutral", "DEFAULT");
    if (tier === "light") return tryClaim("neutral", "soft");
  }
  if (kind === "white") {
    return (
      tryClaim("surface", "DEFAULT") ?? tryClaim("surface", "raised")
    );
  }
  if (kind === "black") {
    return tryClaim("neutral", "ink");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Apply — one pure function that takes the current doc + assignments and
// returns the new tokens + per-component rewrites. The store action wraps
// this in a single history entry so undo rolls back tokens AND sources.
// ---------------------------------------------------------------------------

export type ApplyArgs = {
  components: Record<string, WonderComponent>;
  order: string[];
  tokens: Tokens;
  assignments: Assignment[];
};

export type ApplyResult = {
  tokens: Tokens;
  /** Only entries for components whose source actually changed. */
  sources: Record<string, string>;
  /** Total class occurrences rewritten. For toast/summary UI. */
  rewriteCount: number;
  /** Families created (didn't exist before). For toast/summary UI. */
  familiesCreated: string[];
};

export function applyExtraction(args: ApplyArgs): ApplyResult {
  // 1. New tokens with extracted hex values written into their slots.
  //    We clone-then-mutate so the input `tokens` stays untouched
  //    (store actions rely on `tokensEqual` short-circuit checks).
  const newTokens: Tokens = {
    ...args.tokens,
    colors: { ...args.tokens.colors },
  };
  const familiesCreated: string[] = [];

  // Deep-ish clone each family we touch.
  const touchedFamilies = new Set<string>();

  for (const asn of args.assignments) {
    if (!asn.target) continue;
    const pal = PALETTE_BY_NAME.get(asn.paletteName);
    if (!pal) continue;
    const { family, shade } = asn.target;

    if (!newTokens.colors[family]) {
      newTokens.colors[family] = { DEFAULT: pal.hex };
      familiesCreated.push(family);
      touchedFamilies.add(family);
    }
    if (!touchedFamilies.has(family)) {
      newTokens.colors[family] = { ...newTokens.colors[family] };
      touchedFamilies.add(family);
    }
    newTokens.colors[family][shade] = pal.hex;
  }

  // 2. Build palette-name → token-suffix map for the codemod.
  //    `emerald-500` → `primary`, `emerald-100` → `primary-soft`, etc.
  const replacement = new Map<string, string>();
  for (const asn of args.assignments) {
    if (!asn.target) continue;
    const suffix =
      asn.target.shade === "DEFAULT"
        ? asn.target.family
        : `${asn.target.family}-${asn.target.shade}`;
    replacement.set(asn.paletteName, suffix);
  }

  // 3. Codemod each source that contains at least one of the mapped palettes.
  //    Skipping unchanged sources keeps the history snapshot small and makes
  //    "what actually changed" trivial for the summary toast.
  const sources: Record<string, string> = {};
  let rewriteCount = 0;

  for (const id of args.order) {
    const c = args.components[id];
    if (!c) continue;
    try {
      const result = rewriteColorClassesInSource(c.source, replacement);
      if (result.rewrites > 0) {
        sources[id] = result.source;
        rewriteCount += result.rewrites;
      }
    } catch {
      // Component fails to reparse — skip it. The original source stays as-is
      // so at worst the user's old classes survive alongside the new tokens
      // until they fix the parse error.
    }
  }

  return { tokens: newTokens, sources, rewriteCount, familiesCreated };
}

function rewriteColorClassesInSource(
  src: string,
  replacement: Map<string, string>,
): { source: string; rewrites: number } {
  const ast = parseSource(src);
  const root = findRootJSXElement(ast);
  if (!root) return { source: src, rewrites: 0 };
  let rewrites = 0;

  walkJSX(root, (el) => {
    const attr = getJSXAttr(el, "className");
    if (!attr) return;
    const v = attr.value;
    let literal: t.StringLiteral | null = null;
    if (t.isStringLiteral(v)) literal = v;
    else if (t.isJSXExpressionContainer(v) && t.isStringLiteral(v.expression)) {
      literal = v.expression;
    }
    if (!literal) return;

    const tokens = literal.value.split(/\s+/).filter(Boolean);
    let changed = false;
    const out = tokens.map((tok) => {
      const colonIdx = tok.lastIndexOf(":");
      const variants = colonIdx >= 0 ? tok.slice(0, colonIdx + 1) : "";
      const leaf = colonIdx >= 0 ? tok.slice(colonIdx + 1) : tok;

      const numbered = leaf.match(/^([a-z]+)-([a-z]+-\d+)$/);
      const special = numbered ? null : leaf.match(/^([a-z]+)-(white|black|transparent)$/);
      const m = numbered ?? special;
      if (!m) return tok;
      if (!COLOR_PREFIXES.has(m[1])) return tok;

      const suffix = replacement.get(m[2]);
      if (!suffix) return tok;
      rewrites++;
      changed = true;
      return `${variants}${m[1]}-${suffix}`;
    });

    if (changed) {
      // Preserve original whitespace between tokens minimally — Tailwind
      // classes are whitespace-separated, a single space is fine.
      literal.value = out.join(" ");
    }
  });

  return { source: rewrites > 0 ? printSource(ast) : src, rewrites };
}
