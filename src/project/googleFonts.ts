// ---------------------------------------------------------------------------
// Google Fonts catalog + loader helpers.
//
// Two surfaces need to know about web fonts:
//
//   1. The app chrome (ProjectTokensStyle) — when tokens.fonts.* reference a
//      Google Font by name, we inject a <link rel="stylesheet"> into
//      document.head so `font-sans` etc. actually paints in that face.
//
//   2. The sandbox iframe — its tokens CSS is pushed as one <style> block.
//      Prepending `@import url(...)` to that CSS loads the same fonts
//      inside the iframe without any additional wiring.
//
// We ship a *curated* list of the most popular Google Fonts (~150) instead
// of the full 1700+ catalog to keep the bundle lean. The picker UI also
// supports a free-text "custom" entry — users who want a font that's not
// in the list can type its name and the loader will happily fetch it from
// Google. Nothing here is a gatekeeper, just a convenience.
//
// Why stacks stay as free-text strings (rather than a structured
// `{ family, source }` token): round-tripping with design-tool exports,
// hand-edited `tokens.json`, and `@font-face`-only stacks (where no Google
// request is needed) all "just work" when the token is a plain CSS value.
// The picker treats stacks as a view onto that string, not a replacement.
// ---------------------------------------------------------------------------

/**
 * Categories reported by the Google Fonts metadata API. We keep these as a
 * string-literal union so the picker can filter and the stack builder can
 * emit the right generic-family fallback ("serif" vs "sans-serif" etc.).
 */
export type GoogleFontCategory =
  | "sans-serif"
  | "serif"
  | "display"
  | "handwriting"
  | "monospace";

export type GoogleFont = {
  family: string;
  category: GoogleFontCategory;
};

// ---------------------------------------------------------------------------
// Catalog — curated popular list.
//
// Source: Google Fonts' "most popular" page, sampled April 2026. Kept
// alphabetized within each category so diffs read cleanly when we refresh
// the list. Additions are cheap — append to the right category array.
// ---------------------------------------------------------------------------

const SANS: string[] = [
  "Albert Sans", "Arimo", "Asap", "Barlow", "Be Vietnam Pro", "Cabin",
  "Chivo", "DM Sans", "Dosis", "Exo 2", "Figtree", "Fira Sans", "Hanken Grotesk",
  "Heebo", "IBM Plex Sans", "Inter", "Jost", "Karla", "Lato", "Lexend",
  "Manrope", "Maven Pro", "Montserrat", "Mukta", "Mulish", "Noto Sans",
  "Nunito", "Nunito Sans", "Onest", "Open Sans", "Oxygen", "PT Sans",
  "Plus Jakarta Sans", "Poppins", "Public Sans", "Questrial", "Quicksand",
  "Rajdhani", "Raleway", "Readex Pro", "Roboto", "Roboto Condensed",
  "Roboto Flex", "Rubik", "Sora", "Source Sans 3", "Space Grotesk", "Syne",
  "Titillium Web", "Ubuntu", "Urbanist", "Varela Round", "Work Sans",
];

const SERIF: string[] = [
  "Alegreya", "Arvo", "Bitter", "Cardo", "Cormorant", "Cormorant Garamond",
  "Crimson Pro", "Crimson Text", "DM Serif Display", "DM Serif Text",
  "EB Garamond", "Fraunces", "Instrument Serif", "Lora", "Libre Baskerville",
  "Libre Caslon Text", "Literata", "Lusitana", "Merriweather", "Neuton",
  "Noto Serif", "Old Standard TT", "PT Serif", "Playfair Display",
  "Roboto Serif", "Rokkitt", "Source Serif 4", "Spectral", "Tinos", "Vollkorn",
];

const DISPLAY: string[] = [
  "Abril Fatface", "Alfa Slab One", "Anton", "Archivo Black", "Bebas Neue",
  "Big Shoulders Display", "Black Ops One", "Bungee", "Changa One", "Chango",
  "Cinzel", "Climate Crisis", "Fascinate", "Faster One", "Fjalla One",
  "Goldman", "Koulen", "Lilita One", "Monoton", "Notable", "Oswald",
  "Pacifico", "Passion One", "Permanent Marker", "Righteous", "Russo One",
  "Sansita Swashed", "Shrikhand", "Sigmar One", "Squada One", "Staatliches",
  "Syncopate", "Tilt Neon", "Ultra", "Unica One", "Yeseva One",
];

const HANDWRITING: string[] = [
  "Architects Daughter", "Caveat", "Dancing Script", "Grape Nuts",
  "Great Vibes", "Homemade Apple", "Indie Flower", "Kalam", "Kaushan Script",
  "La Belle Aurore", "Marck Script", "Patrick Hand", "Reenie Beanie",
  "Rock Salt", "Sacramento", "Satisfy", "Shadows Into Light",
];

const MONOSPACE: string[] = [
  "Anonymous Pro", "Azeret Mono", "Cousine", "Cutive Mono", "DM Mono",
  "Fira Code", "Fira Mono", "IBM Plex Mono", "Inconsolata", "JetBrains Mono",
  "Major Mono Display", "Martian Mono", "Nanum Gothic Coding", "Overpass Mono",
  "PT Mono", "Red Hat Mono", "Roboto Mono", "Share Tech Mono",
  "Source Code Pro", "Space Mono", "Ubuntu Mono", "VT323", "Victor Mono",
  "Xanh Mono",
];

export const GOOGLE_FONTS: GoogleFont[] = [
  ...SANS.map((family): GoogleFont => ({ family, category: "sans-serif" })),
  ...SERIF.map((family): GoogleFont => ({ family, category: "serif" })),
  ...DISPLAY.map((family): GoogleFont => ({ family, category: "display" })),
  ...HANDWRITING.map(
    (family): GoogleFont => ({ family, category: "handwriting" }),
  ),
  ...MONOSPACE.map(
    (family): GoogleFont => ({ family, category: "monospace" }),
  ),
].sort((a, b) => a.family.localeCompare(b.family));

const GOOGLE_FONT_NAMES = new Set(GOOGLE_FONTS.map((f) => f.family));

export function isKnownGoogleFont(name: string): boolean {
  return GOOGLE_FONT_NAMES.has(name);
}

export function getGoogleFont(name: string): GoogleFont | undefined {
  return GOOGLE_FONTS.find((f) => f.family === name);
}

// ---------------------------------------------------------------------------
// Stack parsing & building
//
// A font-family stack is a comma-separated list of family names, some
// quoted ("Open Sans"), some bare (system-ui, sans-serif). The first name
// is the "primary" — what we treat as the user's actual choice. Everything
// after it is fallback.
//
// We don't need to understand the full CSS grammar; a forgiving split that
// strips quotes and whitespace is enough for picker round-trips.
// ---------------------------------------------------------------------------

export function parseStack(stack: string): string[] {
  return stack
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/**
 * Extract the first family from a stack. Returns `""` if the stack is
 * empty. Used by the picker to highlight "what font is currently active".
 */
export function primaryFamily(stack: string): string {
  const parsed = parseStack(stack);
  return parsed[0] ?? "";
}

/**
 * Scan an iterable of stacks and return the unique set of Google Font names
 * referenced. Used by the runtime loader to decide which `<link>` tags /
 * `@import` lines to emit.
 */
export function extractGoogleFontsFromStacks(
  stacks: Iterable<string>,
): string[] {
  const found = new Set<string>();
  for (const stack of stacks) {
    for (const name of parseStack(stack)) {
      if (isKnownGoogleFont(name)) found.add(name);
    }
  }
  // Deterministic order — helps the `<link>` href stay stable across
  // re-renders so the browser cache hits, and keeps snapshot tests sane.
  return Array.from(found).sort();
}

// Sensible fallback stacks per role. Appending these means a user's "pick
// Inter for sans" writes a stack that degrades gracefully on slow networks
// or while the web font is loading.
const SANS_FALLBACK = `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
const SERIF_FALLBACK = `ui-serif, Georgia, Cambria, "Times New Roman", serif`;
const MONO_FALLBACK = `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`;
const DISPLAY_FALLBACK = `ui-serif, Georgia, serif`;

/**
 * Build a font-family string with the chosen Google Font as the primary,
 * followed by a category-appropriate fallback chain. The picker writes the
 * result directly into `tokens.fonts.sans` / `.mono` / `.display`.
 */
export function buildStackWithGoogleFont(
  name: string,
  role: "sans" | "mono" | "display",
): string {
  const quoted = name.includes(" ") ? `"${name}"` : name;
  if (role === "mono") return `${quoted}, ${MONO_FALLBACK}`;
  if (role === "display") {
    const font = getGoogleFont(name);
    // Display role: serif display fonts get a serif fallback, the rest get
    // sans. Keeps "pick Playfair Display for headings" looking right even
    // if the web font never loads.
    if (font && font.category === "serif") return `${quoted}, ${SERIF_FALLBACK}`;
    if (font && font.category === "display") return `${quoted}, ${DISPLAY_FALLBACK}`;
    return `${quoted}, ${SANS_FALLBACK}`;
  }
  // sans role — the default. Pick fallback by category.
  const font = getGoogleFont(name);
  if (font?.category === "serif") return `${quoted}, ${SERIF_FALLBACK}`;
  if (font?.category === "monospace") return `${quoted}, ${MONO_FALLBACK}`;
  return `${quoted}, ${SANS_FALLBACK}`;
}

// ---------------------------------------------------------------------------
// Google Fonts API v2 URL builder.
//
// One URL can request many families — the `&family=` parameter repeats.
// We always request the same weight range (400,500,600,700) because UI
// design almost always wants regular/medium/semibold/bold, and we can't
// introspect which weights a user's component actually calls for.
// `&display=swap` prevents FOIT — text paints in the fallback immediately
// and swaps when the web font loads, which is the right default for editor
// previews (invisible text during load would feel broken).
// ---------------------------------------------------------------------------

const WEIGHT_AXIS = "wght@400;500;600;700";

export function googleFontsHref(families: string[]): string {
  if (families.length === 0) return "";
  const params = families
    .map((name) => `family=${encodeURIComponent(name)}:${WEIGHT_AXIS}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/**
 * `@import` form of the same URL, for injection into the sandbox iframe's
 * `<style>` block. Returns `""` when no fonts are needed so callers can
 * unconditionally prepend the result.
 */
export function googleFontsCssImport(families: string[]): string {
  const href = googleFontsHref(families);
  return href ? `@import url("${href}");\n` : "";
}
