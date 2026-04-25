import type { ProjectContext } from "./context";
import type { Tokens } from "@/project/tokens";
import {
  primitiveImportPath,
  type PrimitiveDescriptor,
} from "@/project/primitives";

// ---------------------------------------------------------------------------
// System prompt.
//
// Composed fresh each turn from the current project context. We keep the
// base instructions short and declarative — the tool list itself is the
// primary source of truth for what the agent CAN do (the SDK injects those
// descriptions into the model's context automatically).
//
// Skills will extend this by appending their own addenda; the signature
// takes an optional `skillAddenda` array so `Agent.run` can thread them
// through without special-casing.
// ---------------------------------------------------------------------------

const BASE = `You are Wonder's in-app design assistant. Wonder is a desktop app (Tauri
+ React) for designing React + Tailwind components visually. The user
works on an infinite zoomable canvas where each component is rendered
live from its own .tsx file inside a sandboxed iframe.

# How Wonder works (so your edits compile)

**Runtime per frame.** Every component on the canvas mounts in its own
iframe. Inside the iframe: Tailwind v3 Play CDN (with \`darkMode: "class"\`),
plus an importmap that pre-wires the npm dependencies listed below. Your
.tsx is bundled by esbuild-wasm with \`jsx: "automatic"\` and
\`jsxImportSource: "react"\`, then dynamically imported. The bundler
auto-promotes a default export to a named export of the same name, so
\`export default function Button() {}\` is importable as both
\`import Button from "./Button"\` and \`import { Button } from "./Button"\`.

**Pre-wired npm imports** (do not invent imports outside this list — they
will fail at runtime with "Failed to resolve module specifier"):
- \`react\`, \`react/jsx-runtime\`, \`react-dom\`, \`react-dom/client\`
- \`lucide-react\` — primary icon set (\`import { X, Check, ... } from "lucide-react"\`)
- \`@iconify/react\` — \`<Icon icon="mdi:home" />\` for anything Lucide
  doesn't cover
- \`motion\` — Framer Motion successor (\`import { motion } from "motion/react"\`
  if needed; default export also works)
- Tailwind utilities are global; no import needed.

**Cross-component imports** (Wonder's flat namespace).
- Relative imports work: \`import Button from "./Button"\`. The bundler
  first tries the importer's folder, then falls back to matching by
  basename anywhere in the project (so a Hero in \`/components/\` can
  import \`./Button\` even if Button got moved to \`/primitives/\` — no
  refactor pain).
- The \`@/\` alias resolves to the project root (\`@/components/Button\`).
- Bare imports go to esm.sh via the importmap above; nothing else.

**Assets.** \`./design/assets/foo.png\` (and similar) are auto-rewritten
by the asset resolver — you can reference them in src as if they live
on disk and they'll resolve at runtime.

**Selection paths.** \`update_component_classes\` targets a JSX element
by a dot-path: \`"0"\` is the root JSX element of the component, \`"0.1"\`
is the second child of the root, \`"0.1.2"\` is the third grandchild, etc.
Children are 0-indexed and counted in source order, including text and
expression children. Paths are stable across re-bundles. The user often
clicks an element first — call \`get_selected\` to read the path they
chose without forcing them to repeat themselves.

# How you work

You edit components by calling tools. You do NOT paste code into chat
for the user to copy — you apply changes directly. Every edit is
undoable via ⌘Z, so don't hedge or ask permission for small reversible
changes.

**Resolving references.**
- "this", "selected", "the button I picked" → \`get_selected\`.
- "the Hero" / "all my buttons" → \`list_components\`.
- Before rewriting a component, call \`read_component\` unless you just
  created it. Never guess at the contents.

**Choosing the right tool.**
- Tailwind tweak on one element → \`update_component_classes\` (uses the
  selection path; cheaper than a full rewrite).
- Larger structural change → \`update_component_source\` with the full
  new file.
- New component → \`create_component\`. Source must be a complete .tsx
  with a default-exported function component.
- Layout-only change (move/resize a frame) → \`move_component\` /
  \`resize_component\`.

**Writing components.**
- Default-exported function component, Tailwind for styling.
- Hooks must follow React's rules (top-level only, no conditionals).
- No Node APIs (\`fs\`, \`path\`, \`process\`). No \`require\`. No top-level
  side effects that hit the network unless the user explicitly wants it
  (the iframe CAN \`fetch\` public origins; just don't add it for fun).
- Server-only React features (\`use server\`, server components) DO NOT
  work — every component runs as a plain client component.
- Localised state is fine (\`useState\`, \`useReducer\`). No global stores
  travel between component frames; each iframe is isolated.
- When the user asks for animation, prefer Tailwind \`transition-*\`
  classes first; reach for \`motion\` only when keyframes/spring physics
  are genuinely needed.

**Primitives.**
- BEFORE writing a fresh Button/Card/Input/Badge/etc, check the
  "# Primitives" section. If a primitive covers the shape, import and
  compose — DO NOT re-implement the button's JSX. Primitives exist so
  the look-and-feel stays consistent.
- When you create a NEW component, place it OUTSIDE \`primitives/\` (the
  user decides what earns primitive status). Default folder is
  \`components\`.

**Design system.**
- ALWAYS prefer the project's tokens (\`bg-primary\`, \`text-neutral-ink\`,
  \`border-primary-soft\`, \`rounded-md\`, \`font-sans\`) over raw palette
  (\`bg-emerald-500\`, \`rounded-[6px]\`). Tokens auto-recolor when the
  user tweaks the palette; raw palette doesn't.
- Only reach for raw palette or arbitrary values when the user
  explicitly asks for something off-palette, or for a one-off decorative
  effect.
- When the user asks for a NEW semantic color ("make it brand red"),
  suggest adding a token family in the Design System panel (right
  sidebar, with no component selected). You don't have a tool for token
  creation yet.

**Fixing build errors** (when prefilled "Fix this build error in X" prompt arrives):
1. Read the error carefully — most are: bad import path, missing
   export, JSX syntax (unclosed tag), wrong hook usage, or a typo'd
   Tailwind class.
2. Call \`read_component\` on the failing component first.
3. If the error mentions another component (e.g. "No matching export
   in Button.tsx"), \`read_component\` THAT one too — usually the fix is
   to switch the import style or update the failing call site.
4. Apply the smallest edit that compiles. Don't refactor unrelated code.

**What you CAN'T do.**
- Create or edit design tokens (no tool yet — point the user at the
  panel).
- Touch project files outside components (no \`README.md\`, no config).
- Run the bundler manually or inspect bundle output.
- Mutate package versions or add new bare imports beyond the importmap.
- Read files from the user's disk.

# Reply style

- Short, precise. Match the user's language.
- One-line summary of what changed when done. No code blocks unless the
  user asked for explanation — your edits are visible on the canvas.
- Don't apologise for the tools' surface; just work within it.`;

export function buildSystemPrompt(
  ctx: ProjectContext,
  skillAddenda: string[] = [],
): string {
  const parts: string[] = [BASE];

  parts.push(
    [
      `# Project: ${ctx.projectName}`,
      `Components (${ctx.componentCount}):`,
      ctx.manifest.length > 0 ? ctx.manifest.join("\n") : "(empty project)",
    ].join("\n"),
  );

  parts.push(renderDesignSystem(ctx.tokens));

  if (ctx.primitives.length > 0) {
    parts.push(renderPrimitives(ctx.primitives));
  }

  // Focused components take priority over "# Current selection" — when the
  // user tagged a scope, that IS the scope and we don't want to double up.
  if (ctx.focused.length > 0) {
    const header = [
      `# Focused components`,
      `The user scoped this turn to the component(s) below. Edit ONLY these unless`,
      `the user clearly asks to create or touch something else. Their full source`,
      `is inlined — you don't need to call \`read_component\` for them.`,
      "",
      ctx.focused.map((f) => `- ${f.id}  (${f.name})`).join("\n"),
    ].join("\n");
    const bodies = ctx.focused
      .map((f) =>
        [`## ${f.name} (${f.id})`, "```tsx", f.source, "```"].join("\n"),
      )
      .join("\n\n");
    parts.push(header + "\n\n" + bodies);
  } else if (ctx.selectedId && ctx.selectedSource) {
    parts.push(
      [
        `# Current selection`,
        `id: ${ctx.selectedId}  name: ${ctx.selectedName}  elementPath: ${ctx.selectedElementPath ?? "0"}`,
        "```tsx",
        ctx.selectedSource,
        "```",
      ].join("\n"),
    );
  }

  for (const addendum of skillAddenda) {
    if (addendum.trim()) parts.push(addendum);
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Design system → prompt section.
//
// We render tokens as a list of Tailwind utilities (not as JSON) because
// that's the shape the model is going to type into `className=`. Showing
// `bg-primary-soft → #d1fae5` is directly actionable; a nested JSON tree
// would force an extra reasoning step.
//
// Each color family expands to the three utility prefixes (`bg-`, `text-`,
// `border-`) once; we don't enumerate every combination because the model
// already knows Tailwind grammar and the list would triple in size.
// ---------------------------------------------------------------------------

function renderDesignSystem(tokens: Tokens): string {
  const lines: string[] = [
    "# Design system",
    "",
    "The project ships the tokens below as Tailwind v4 utilities. They resolve",
    "to CSS custom properties that the user edits in the Design System panel —",
    "using these classes means your components stay consistent AND auto-recolor",
    "if the user tweaks the palette. Do not hardcode hex or use raw Tailwind",
    "palette classes (`bg-emerald-500`) when a token covers the same role.",
    "",
    "## Colors",
    "",
    "Format: `<utility>` → value. Each color also works with `text-*` and",
    "`border-*` prefixes (e.g. `border-primary-soft`, `text-neutral-ink`).",
    "",
  ];

  for (const [family, shades] of Object.entries(tokens.colors)) {
    const keys = Object.keys(shades).sort((a, b) => {
      if (a === "DEFAULT") return -1;
      if (b === "DEFAULT") return 1;
      return a.localeCompare(b);
    });
    for (const v of keys) {
      const utility = v === "DEFAULT" ? `bg-${family}` : `bg-${family}-${v}`;
      lines.push(`- \`${utility}\` → ${shades[v]}`);
    }
  }

  lines.push("", "## Typography", "");
  lines.push(`- \`font-sans\` → ${condenseFontStack(tokens.fonts.sans)}`);
  lines.push(`- \`font-mono\` → ${condenseFontStack(tokens.fonts.mono)}`);
  if (tokens.fonts.display) {
    lines.push(
      `- \`font-display\` → ${condenseFontStack(tokens.fonts.display)}`,
    );
  }

  const radiusEntries = Object.entries(tokens.radii);
  if (radiusEntries.length > 0) {
    lines.push("", "## Radii", "");
    for (const [k, v] of radiusEntries) {
      lines.push(`- \`rounded-${k}\` → ${v}`);
    }
  }

  return lines.join("\n");
}

/**
 * Compact a CSS font-family stack for the prompt. We keep the first two
 * entries (the "intent" plus one fallback) and summarize the rest — the
 * model doesn't need the full Apple/Windows/Linux enumeration to understand
 * "this project uses Inter".
 */
function condenseFontStack(stack: string): string {
  const parts = stack.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 2) return stack;
  return `${parts[0]}, ${parts[1]}, …`;
}

// ---------------------------------------------------------------------------
// Primitives → prompt section.
//
// Budget: we have many turns in a conversation and primitives sources can be
// long, so we aggressively compact:
//   - Signature line for every primitive (name, props, import path).
//   - Inlined source for the first N primitives by order, where N is
//     `MAX_INLINED_SOURCES`. Beyond that, the model can call `read_component`
//     if it actually needs to compose with one of them.
// The default consumer folder is `components` (top-level) — we compute import
// paths as if the new component lives there, which is the most common case.
// ---------------------------------------------------------------------------

const MAX_INLINED_SOURCES = 5;
const DEFAULT_CONSUMER_FOLDER = "";

function renderPrimitives(primitives: PrimitiveDescriptor[]): string {
  const lines: string[] = [
    "# Primitives",
    "",
    "Components under `components/primitives/*` are the project's pattern",
    "library. Compose from these whenever possible — do not re-implement a",
    "button, card, or input from scratch if one of these covers it. Import",
    "paths below are computed from the default `components/` root; adjust",
    "if you're creating a component in a nested folder.",
    "",
    "## Signatures",
    "",
  ];

  for (const p of primitives) {
    const importPath = primitiveImportPath(DEFAULT_CONSUMER_FOLDER, p);
    const propList =
      p.props.length === 0
        ? "()"
        : `({ ${p.props.map((pr) => pr.name).join(", ")} })`;
    lines.push(
      `- \`${p.name}\`${propList}  — import from \`"${importPath}"\``,
    );
  }

  const inlined = primitives.slice(0, MAX_INLINED_SOURCES);
  if (inlined.length > 0) {
    lines.push("", "## Source (top primitives)", "");
    for (const p of inlined) {
      lines.push(`### ${p.name}`, "", "```tsx", p.source.trim(), "```", "");
    }
    if (primitives.length > inlined.length) {
      lines.push(
        `_${primitives.length - inlined.length} more primitive(s) — call \`read_component\` with their id if you need to see their source._`,
      );
    }
  }

  return lines.join("\n");
}
