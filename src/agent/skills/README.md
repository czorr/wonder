# Skills

Skills are composable capability packs layered on top of the base agent.
A skill bundles three things:

- **System addendum** — extra instructions appended to the base prompt.
- **Tool subset / extensions** — extra tools, or overrides of defaults,
  merged via `mergeTools(defaultTools(), skill.tools)`.
- **Optional model preference** — e.g. route "extract design system" work
  to a stronger model even if the chat's default is a faster one.

The Agent class itself doesn't know about skills; composition happens at
the call site (chat store). That keeps the agent core tiny and lets us
experiment with skill shapes without churning the core.

Planned skills:

- `design-system.extract` — scan the project, infer a token palette
  (colors/spacing/radii), and write a `tokens.ts` or design system doc.
- `design-system.normalize` — rewrite ad-hoc Tailwind to reference a
  shared palette.
- `component.variants` — given a component, generate size/state variants
  as siblings on the canvas.
- `layout.autoarrange` — tidy the canvas frames into a grid.

Each skill will live in its own file here, exporting
`{ system: string; tools: ToolRegistry; model?: string }`.
