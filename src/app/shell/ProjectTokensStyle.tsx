// ---------------------------------------------------------------------------
// Live preview of project design tokens.
//
// Mounts a <style> tag at the document root whose body is a `:root { … }`
// declaration containing the user's current tokens. React keeps it in sync
// with the `useProject.tokens` store, so edits in DesignSystemPanel ripple
// into every Tailwind utility that references those custom properties
// (`bg-primary`, `text-neutral-ink`, `rounded-md`, etc.) on the next paint.
//
// Why `:root { … }` instead of `@theme { … }`: Tailwind v4 only processes
// `@theme` at build time. At runtime we're overriding the custom properties
// Tailwind's generated utilities dereference. Seeds live in globals.css —
// see the comment block there.
//
// Google Fonts loading: when the user's font stacks reference a web font
// from our catalog, we also install a <link rel="stylesheet"> tag per
// font into document.head. The link is keyed by font name so re-renders
// don't thrash — we diff the target set against what's already mounted
// and add/remove only the delta. Same mechanism the sandbox uses via
// `@import` inside its tokens CSS, but for the chrome side where the
// picker preview + TokensStudio samples need the font to paint.
// ---------------------------------------------------------------------------

import { useEffect, useMemo } from "react";
import { useProject } from "@/store/project";
import type { Tokens } from "@/project/tokens";
import {
  extractGoogleFontsFromStacks,
  googleFontsHref,
} from "@/project/googleFonts";

function tokensToRootRule(tokens: Tokens): string {
  const lines: string[] = [":root {"];

  for (const [family, shades] of Object.entries(tokens.colors)) {
    // DEFAULT first so the file reads like the authoritative source.
    const keys = Object.keys(shades).sort((a, b) => {
      if (a === "DEFAULT") return -1;
      if (b === "DEFAULT") return 1;
      return a.localeCompare(b);
    });
    for (const v of keys) {
      const name =
        v === "DEFAULT" ? `--color-${family}` : `--color-${family}-${v}`;
      lines.push(`  ${name}: ${shades[v]};`);
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
  return lines.join("\n");
}

// Tag that marks every <link> we own. Using a data-attribute rather than an
// id lets us query ALL of them with one selector when reconciling.
const GOOGLE_FONT_LINK_ATTR = "data-wonder-google-font";

function syncGoogleFontLinks(names: string[]) {
  if (typeof document === "undefined") return;
  const existing = new Map<string, HTMLLinkElement>();
  document
    .querySelectorAll<HTMLLinkElement>(`link[${GOOGLE_FONT_LINK_ATTR}]`)
    .forEach((el) => {
      const name = el.getAttribute(GOOGLE_FONT_LINK_ATTR);
      if (name) existing.set(name, el);
    });

  const target = new Set(names);

  // Remove <link>s whose fonts are no longer referenced — keeps devtools
  // tidy and stops stale requests from piling up as the user experiments.
  for (const [name, el] of existing) {
    if (!target.has(name)) el.remove();
  }

  // Add missing. We emit one <link> per font (rather than one combined
  // URL) so removing a font later cleanly detaches just its tag — a
  // combined URL would force the whole set to reload on every edit.
  for (const name of target) {
    if (existing.has(name)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = googleFontsHref([name]);
    link.setAttribute(GOOGLE_FONT_LINK_ATTR, name);
    // `crossorigin` is important for font CORS (the fetched CSS references
    // .woff2 files under the `fonts.gstatic.com` origin, which require
    // CORS for cross-origin <link> to work). Google's CDN sets the right
    // headers; we just need to declare the attribute.
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
}

export function ProjectTokensStyle() {
  const tokens = useProject((s) => s.tokens);
  // useMemo avoids re-serializing the token object when an unrelated store
  // slice updates (component source edits, selection changes, etc.).
  const css = useMemo(() => tokensToRootRule(tokens), [tokens]);

  const googleFonts = useMemo(
    () =>
      extractGoogleFontsFromStacks([
        tokens.fonts.sans,
        tokens.fonts.mono,
        ...(tokens.fonts.display ? [tokens.fonts.display] : []),
      ]),
    [tokens.fonts.sans, tokens.fonts.mono, tokens.fonts.display],
  );

  useEffect(() => {
    syncGoogleFontLinks(googleFonts);
  }, [googleFonts]);

  return <style data-wonder-tokens="">{css}</style>;
}
