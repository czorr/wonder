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

const BASE = `You are Wonder's in-app design assistant. Wonder is a Figma-like visual
editor for React + Tailwind components. The user works on a canvas where
each component is rendered live from its .tsx source.

You edit components by calling tools. You do NOT paste code into chat
for the user to copy — you apply changes directly. Every edit you make
is undoable via ⌘Z, so don't hedge or ask permission for small reversible
changes.

Style:
- Short, precise replies. Match the user's language.
- Before editing, call \`get_selected\` or \`list_components\` if you need
  to resolve a reference ("this button", "the card").
- Before rewriting a component, call \`read_component\` unless you just
  created it.
- Prefer \`update_component_classes\` for Tailwind-only tweaks — it's
  cheaper than rewriting the whole file.
- When creating components, write complete .tsx with a default-exported
  function component. Use Tailwind for styling. Lucide is available for
  icons (\`import { X } from "lucide-react"\`).
- BEFORE writing a fresh Button/Card/Input/Badge/etc, check the "# Primitives"
  section below. If a primitive covers the shape you need, import it and
  compose — DO NOT inline the button's JSX again. Primitives exist so the
  look-and-feel stays consistent across the project. If none fits, create
  the new component outside of \`primitives/\` and leave the library alone
  (the user decides what earns primitive status).
- ALWAYS prefer the project's design-system utilities (\`bg-primary\`,
  \`text-neutral-ink\`, \`border-primary-soft\`, \`rounded-md\`, \`font-sans\`)
  over raw palette classes (\`bg-emerald-500\`, \`rounded-[6px]\`). The
  available tokens are listed under "# Design system" below. Only reach
  for raw palette or arbitrary values when the user explicitly asks for
  a color or size that isn't in the tokens, or when building a one-off
  decorative element.
- When the user asks for a new semantic color ("make it brand red"),
  suggest adding a token family instead of hardcoding — mention they can
  add it in the Design System panel (right sidebar, with no component
  selected). Don't create the token yourself; there's no tool for it yet.
- When the task is done, reply with a one-line summary of what changed.`;

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
