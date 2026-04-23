// ---------------------------------------------------------------------------
// Design system tokens.
//
// Source of truth for a project's visual language. Persisted to
// `<project>/design/tokens.json` and mirrored to `design/tokens.css` so a
// Tailwind v4 `@theme` block reflects the same values the editor sees.
//
// Why two files:
//   - `tokens.json` is authoritative — what Wonder reads/writes.
//   - `tokens.css` is a generated, human-readable derivative that Tailwind
//     v4 consumes via `@import "./design/tokens.css"` in the project's
//     entry CSS. Editing `tokens.css` by hand does nothing — it's
//     regenerated on every save.
//
// Scope (v1): colors, fonts, radii. Spacing and shadows land later if the
// demand shows up — keeping the surface small now avoids over-designing
// around conventions we don't have yet.
// ---------------------------------------------------------------------------

export const TOKENS_SCHEMA_VERSION = "wonder.tokens/v1";
export type TokensSchemaVersion = typeof TOKENS_SCHEMA_VERSION;

/**
 * A color family. `DEFAULT` is the base shade; optional variants compose
 * into Tailwind v4 CSS custom properties with a dash separator:
 *
 *   colors.primary.DEFAULT → --color-primary  → `bg-primary`
 *   colors.primary.soft    → --color-primary-soft → `bg-primary-soft`
 *
 * Extra variants beyond the "named" ones are preserved — users who want a
 * full 50-950 scale can add `50`, `100`, …, `950` keys and the CSS emitter
 * handles them uniformly.
 */
export type ColorFamily = {
  DEFAULT: string;
  [variant: string]: string;
};

export type Tokens = {
  $schema: TokensSchemaVersion;
  colors: {
    /** CTAs, active states, brand. `bg-primary`, `text-primary-ink`. */
    primary: ColorFamily;
    /** Body text, borders, muted chrome. `text-neutral-ink`, `border-neutral-soft`. */
    neutral: ColorFamily;
    /** Panels, raised surfaces, backgrounds. `bg-surface`. */
    surface: ColorFamily;
    /** Users can add `success`, `danger`, `accent2`, etc. */
    [family: string]: ColorFamily;
  };
  fonts: {
    sans: string;
    mono: string;
    /** Optional display/heading stack. Only emitted if set. */
    display?: string;
  };
  /** Keyed by size label (sm/md/lg/…); value is any valid CSS length. */
  radii: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Defaults
//
// Seeded into a brand-new project and also used as the fallback when
// `design/tokens.json` is missing or partially invalid. Matches the visual
// identity of the Wonder app itself (emerald accent + zinc neutrals) so new
// projects feel cohesive out of the box. Users extract-from-code or
// hand-edit to make it their own.
// ---------------------------------------------------------------------------

export function defaultTokens(): Tokens {
  return {
    $schema: TOKENS_SCHEMA_VERSION,
    colors: {
      primary: {
        DEFAULT: "#10b981",
        soft: "#d1fae5",
        tint: "#ecfdf5",
        ink: "#047857",
      },
      neutral: {
        DEFAULT: "#71717a",
        soft: "#f4f4f5",
        ink: "#18181b",
      },
      surface: {
        DEFAULT: "#ffffff",
        raised: "#ffffff",
        sunken: "#fafaf9",
      },
    },
    fonts: {
      sans: `"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
      mono: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`,
    },
    radii: {
      sm: "0.25rem",
      md: "0.5rem",
      lg: "0.75rem",
      xl: "1rem",
      full: "9999px",
    },
  };
}

// ---------------------------------------------------------------------------
// Parse
//
// A forgiving parser: unknown top-level keys are dropped, unknown variant
// keys within a family are preserved, missing required pieces are filled
// from defaults. Rationale: "user hand-edited tokens.json and made a typo"
// should degrade gracefully — not block opening the project.
//
// Families without a DEFAULT shade are dropped (can't emit CSS without a
// base). Families with only a DEFAULT survive fine.
// ---------------------------------------------------------------------------

export function parseTokens(raw: unknown): Tokens {
  const def = defaultTokens();
  if (!raw || typeof raw !== "object") return def;
  const obj = raw as Record<string, unknown>;
  return {
    $schema: TOKENS_SCHEMA_VERSION,
    colors: mergeColors(obj.colors, def.colors),
    fonts: mergeFonts(obj.fonts, def.fonts),
    radii: mergeStringRecord(obj.radii, def.radii),
  };
}

function mergeColors(
  raw: unknown,
  fallback: Tokens["colors"],
): Tokens["colors"] {
  if (!raw || typeof raw !== "object") return fallback;
  // Start from the fallback so the three required roles (primary/neutral/
  // surface) survive even if the file only defines one of them.
  const out: Tokens["colors"] = {
    primary: fallback.primary,
    neutral: fallback.neutral,
    surface: fallback.surface,
  };
  for (const [family, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const shades = value as Record<string, unknown>;
    const entries: Record<string, string> = {};
    for (const [variant, shade] of Object.entries(shades)) {
      if (typeof shade === "string") entries[variant] = shade;
    }
    if (typeof entries.DEFAULT !== "string") {
      // No base shade — can't form a valid CSS family. Fall back if it's
      // a required role, drop otherwise.
      if (family in fallback) out[family] = fallback[family];
      continue;
    }
    out[family] = entries as ColorFamily;
  }
  return out;
}

function mergeFonts(raw: unknown, fallback: Tokens["fonts"]): Tokens["fonts"] {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  return {
    sans: typeof o.sans === "string" ? o.sans : fallback.sans,
    mono: typeof o.mono === "string" ? o.mono : fallback.mono,
    display:
      typeof o.display === "string" ? o.display : fallback.display,
  };
}

function mergeStringRecord(
  raw: unknown,
  fallback: Record<string, string>,
): Record<string, string> {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const out: Record<string, string> = { ...fallback };
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// CSS emitter
//
// Produces the contents of `design/tokens.css` — a single `@theme { … }`
// block compatible with Tailwind v4's CSS-based config. Variable naming
// follows Tailwind v4 conventions so utilities compose automatically:
//
//   colors.primary.DEFAULT → --color-primary      → `bg-primary`
//   colors.primary.soft    → --color-primary-soft → `bg-primary-soft`
//   fonts.sans             → --font-sans          → `font-sans`
//   radii.md               → --radius-md          → `rounded-md`
//
// The generated header explicitly warns against hand-editing so users don't
// spend 20 minutes tweaking values that get blown away on next save.
// ---------------------------------------------------------------------------

export function tokensToCss(tokens: Tokens): string {
  const lines: string[] = [
    "/* -----------------------------------------------------------------",
    " * Auto-generated by Wonder. Do NOT edit by hand —",
    " * this file is overwritten every save.",
    " * Source of truth: design/tokens.json",
    " * ----------------------------------------------------------------- */",
    "",
    "@theme {",
  ];

  // Colors — emit DEFAULT first within each family so the file reads
  // top-down like a design reference.
  for (const [family, shades] of Object.entries(tokens.colors)) {
    const keys = Object.keys(shades).sort((a, b) => {
      if (a === "DEFAULT") return -1;
      if (b === "DEFAULT") return 1;
      return a.localeCompare(b);
    });
    for (const variant of keys) {
      const value = shades[variant];
      const name =
        variant === "DEFAULT"
          ? `--color-${family}`
          : `--color-${family}-${variant}`;
      lines.push(`  ${name}: ${value};`);
    }
  }
  lines.push("");

  // Fonts
  lines.push(`  --font-sans: ${tokens.fonts.sans};`);
  lines.push(`  --font-mono: ${tokens.fonts.mono};`);
  if (tokens.fonts.display) {
    lines.push(`  --font-display: ${tokens.fonts.display};`);
  }
  lines.push("");

  // Radii
  for (const [k, v] of Object.entries(tokens.radii)) {
    lines.push(`  --radius-${k}: ${v};`);
  }

  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Sandbox utility CSS.
//
// The component preview renders inside an iframe that pulls Tailwind v3 Play
// CDN — that build doesn't know about our `@theme` block and has no idea
// `bg-primary` or `bg-surface` exist. So `ProjectTokensStyle`-style custom
// properties in the parent document don't help the iframe paint anything.
//
// Fix: generate plain CSS rules (`:root { --color-… }` + one declaration
// per utility class) and inject them as a <style> tag inside the iframe.
// The generated utilities cover every family×variant combination plus
// radii and font stacks, so any token class the user writes JUST WORKS.
//
// Intentionally narrow scope:
//   - No hover/focus variants. Add if demand shows up; the plain utility
//     covers static styling which is ~all a designer surface needs.
//   - No dark mode. Same reason.
//   - `rounded-*` only overrides keys that exist in `tokens.radii`. Keys
//     Tailwind already ships (`rounded-2xl`, `rounded-3xl`) stay with
//     Tailwind's defaults so existing components don't suddenly change.
// ---------------------------------------------------------------------------

export function tokensToSandboxCss(tokens: Tokens): string {
  const lines: string[] = [];

  // :root custom properties — so rules can reference var(--color-*) and
  // users eyeballing devtools see the token values.
  lines.push(":root {");
  for (const [family, shades] of Object.entries(tokens.colors)) {
    for (const [variant, value] of Object.entries(shades)) {
      const name =
        variant === "DEFAULT"
          ? `--color-${family}`
          : `--color-${family}-${variant}`;
      lines.push(`  ${name}: ${value};`);
    }
  }
  lines.push(`  --font-sans: ${tokens.fonts.sans};`);
  lines.push(`  --font-mono: ${tokens.fonts.mono};`);
  if (tokens.fonts.display) {
    lines.push(`  --font-display: ${tokens.fonts.display};`);
  }
  for (const [k, v] of Object.entries(tokens.radii)) {
    lines.push(`  --radius-${k}: ${v};`);
  }
  lines.push("}");

  // Color utilities — bg / text / border for every family×variant.
  for (const [family, shades] of Object.entries(tokens.colors)) {
    for (const variant of Object.keys(shades)) {
      const suffix =
        variant === "DEFAULT" ? family : `${family}-${variant}`;
      const varName =
        variant === "DEFAULT"
          ? `--color-${family}`
          : `--color-${family}-${variant}`;
      lines.push(
        `.bg-${suffix} { background-color: var(${varName}); }`,
        `.text-${suffix} { color: var(${varName}); }`,
        `.border-${suffix} { border-color: var(${varName}); }`,
      );
    }
  }

  // Radius utilities — only for token keys (leaves Tailwind defaults like
  // `rounded-2xl` alone).
  for (const k of Object.keys(tokens.radii)) {
    lines.push(`.rounded-${k} { border-radius: var(--radius-${k}); }`);
  }

  // Font utilities — override `font-sans` / `font-mono` / `font-display`
  // so users feel token changes in the preview. Tailwind v3 Play generates
  // these with its own defaults; ours win by source order.
  lines.push(`.font-sans { font-family: var(--font-sans); }`);
  lines.push(`.font-mono { font-family: var(--font-mono); }`);
  if (tokens.fonts.display) {
    lines.push(`.font-display { font-family: var(--font-display); }`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Structural equality — cheap deep compare for `updateTokens` no-op short
// circuit in the store. Keyed-by-reference would miss same-shape updates;
// full JSON.stringify is the boring, correct choice at this scope.
// ---------------------------------------------------------------------------

export function tokensEqual(a: Tokens, b: Tokens): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}
