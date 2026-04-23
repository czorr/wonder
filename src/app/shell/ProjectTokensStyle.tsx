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
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { useProject } from "@/store/project";
import type { Tokens } from "@/project/tokens";

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

export function ProjectTokensStyle() {
  const tokens = useProject((s) => s.tokens);
  // useMemo avoids re-serializing the token object when an unrelated store
  // slice updates (component source edits, selection changes, etc.).
  const css = useMemo(() => tokensToRootRule(tokens), [tokens]);
  return <style data-wonder-tokens="">{css}</style>;
}
