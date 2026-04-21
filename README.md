# Wonder

Visual editor for React + Tailwind on an infinite canvas. See [`WONDER_PLAN.md`](./WONDER_PLAN.md).

## Prereqs

- Node 20+, pnpm 10+
- Rust stable (via `rustup`)
- macOS (primary target)

## Dev

```bash
pnpm install
pnpm tauri dev     # native window
pnpm dev           # web only (port 1420)
```

## Layout

```
src/
  app/         shell + layout
  canvas/      tldraw integration (Sprint 1)
  editor/      Monaco + sync (Sprint 1)
  sandbox/     iframe runtime + esbuild-wasm (Sprint 0)
  ast/         parse / mutate / selectors (Sprint 0)
  inspector/   right panel (Sprint 2)
  library/     left sidebar
  store/       Zustand
  db/          SQLite client (Sprint 1)
src-tauri/     Rust shell
```

## Current state

Sprint 0 — shell boots, Tailwind 4 wired, Tauri window opens. Next: esbuild-wasm bundle + iframe sandbox.
