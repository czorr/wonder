import type { ProjectContext } from "./context";

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
- Use semantic Tailwind (e.g. \`text-emerald-700\`) not arbitrary values
  unless the user asks.
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

  if (ctx.selectedId && ctx.selectedSource) {
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
