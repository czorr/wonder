# Wonder — Estado del proyecto

Checklist vivo del MVP vs. lo que realmente está implementado. Palomeado = hecho y probado. 🟡 = parcial. ❌ = falta.

Última actualización: 2026-04-21

---

## 1. Core — canvas + sandbox + editor

- [x] Canvas infinito con pan/zoom (wheel + space-drag + Cmd+=/-/0) — `src/app/shell/CanvasArea.tsx:28-51`
- [x] Sandbox iframe con render vivo de React — `src/sandbox/Sandbox.tsx` + `public/sandbox-runtime.html`
- [x] Monaco editor sincronizado bidireccional — `src/app/shell/CodePanel.tsx`
- [x] Hot reload con debounce (80ms, más rápido que el plan) — `src/constants.ts`
- [x] Bundler esbuild-wasm — `src/sandbox/bundler.ts`
- [x] AST parsing + mutación preservando formato (@babel/parser + recast) — `src/ast/*`
- [x] Atributo `data-wonder-path` para mapear DOM ↔ AST

## 2. Creación de componentes

- [x] Paste de código JSX → nuevo frame — `src/ast/paste.ts` + `src/app/shell/Shell.tsx:24-43`
- [x] Spawn desde sidebar (click en primitivo) — `src/app/shell/LeftSidebar.tsx:56-71`
- [x] Drop de primitivo sobre canvas vacío → nuevo frame — `src/app/shell/CanvasArea.tsx:163-187`
- [x] Export a archivo `.tsx` — `src/app/shell/Topbar.tsx:67-78`

## 3. Nesting / drag & drop de primitivos dentro de componentes ⭐

- [x] Primitivos draggables desde sidebar (mime `application/x-wonder-primitive`) — `LeftSidebar.tsx:301-310`
- [x] Drop dentro del iframe con mensaje `sandbox:drop` — `public/sandbox-runtime.html:377-393`
- [x] Insert-as-child con AST (`insertChildAtPath`) — `src/ast/insert.ts`
- [x] Highlight del parent durante dragover
- [x] Click en primitivo con un hijo seleccionado → inserta como sibling después de él — `LeftSidebar.tsx:onPrimitiveClick`
- [ ] **Drop de primitivos con preview visual correcto** ⚠️ *SKIP por ahora — en pausa*
  - Code ya existente: `insertChildAtPath(code, path, snippet, index?)` en `src/ast/insert.ts`
  - Code ya existente: `computeDropHint` + `findDropContainer` + ghost/marker rects en `public/sandbox-runtime.html`
  - Code ya existente: overlay de ghost + línea de inserción en `src/canvas/ComponentFrame.tsx`
  - Broadcasting de `wonder:dragStart` con `size` en `src/app/shell/LeftSidebar.tsx`
  - No está funcionando como se espera (reportado 2026-04-21). Regresar aquí con más tiempo y probablemente repensar el approach.
- [ ] Auto-scroll del canvas cuando arrastras cerca del borde
- [ ] Drag de elemento existente dentro del sandbox para reordenar/re-parentear
- [ ] Drag de un componente del canvas DENTRO de otro componente (nesting de componentes enteros)

## 4. Inspector (panel derecho)

- [x] Selección visual click → path AST → panel muestra clases — `RightPanel.tsx`
- [x] 7 grupos Tailwind: Layout, Spacing, Sizing, Typography, Colors, Borders, Effects
- [x] Props editor (string/number/enum) — `RightPanel.tsx:1357-1490` + `src/ast/props.ts`
- [x] Layers panel (árbol DOM con click-to-select) — `RightPanel.tsx:1491-1569`
- [x] Overlay visual + resize handles — `ComponentFrame.tsx:199-213`

## 5. Breakpoints + estados

- 🟡 Breakpoints UI existe pero NO inyecta prefijos (`sm:`/`md:`) en las mutaciones — `Topbar.tsx:103-119`
- 🟡 Estados (hover/focus/active) tabs cambian highlighting pero NO prefijan (`hover:`) en mutaciones — `RightPanel.tsx:131,322-339`

## 6. Undo / redo / snapshots

- [ ] Botones undo/redo renderizados pero sin handler — `Topbar.tsx:85-86`
- [ ] Store `history.ts` no existe
- [ ] Snapshots — "50 snapshots" hardcoded, sin storage ni timeline — `StatusBar.tsx:23`

## 7. Persistencia

- [ ] SQLite vía Tauri SQL plugin — `src/db/` vacío, `src-tauri/src/lib.rs` solo builder base
- [ ] Al cerrar la app se pierde todo

## 8. Settings

- [ ] Editor de `tailwind.config` global — `src/settings/` no existe
- [ ] Fake item `tailwind.config.ts` en sidebar sin handler

## 9. Features nuevas pendientes

- [ ] **AI chat para generación de componentes** (prompt → JSX → frame nuevo en canvas)
- [ ] Drag & drop de primitivas (ya casi) + reparenting de elementos existentes
- [ ] tldraw real o bendecir canvas custom y sacar tldraw del plan

## 10. Calidad

- [ ] Tests unitarios de `ast/` (objetivo ≥80%)
- [ ] Tests e2e con WebDriver Tauri
- [ ] Firma + notarización macOS

---

## Cambios recientes

**2026-04-21 — Figma-like nesting (fase 1 + fase 2):**

Fase 1:
- `src/ast/insert.ts` — `insertChildAtPath` acepta `index` opcional
- `public/sandbox-runtime.html` — `computeDropHint()` con detección de eje
- `src/sandbox/messaging.ts` — `sandbox:dragOver` / `sandbox:drop` con `index`, `markerRect`, `mode`
- `src/canvas/ComponentFrame.tsx` — overlay de línea azul
- `src/app/shell/LeftSidebar.tsx` — click inserta como sibling después del seleccionado

Fase 2 (arreglos + ghost preview):
- `public/sandbox-runtime.html` — `findDropContainer()` sube al padre real cuando hovereas un leaf (span, button, img...); antes intentaba insertar dentro de la hoja. Ahora siempre resuelve al contenedor flex/grid/block que realmente tiene hijos.
- `public/sandbox-runtime.html` — se añade cálculo de `ghostRect` (rectángulo con el tamaño del primitivo en el punto exacto de caída)
- `src/app/shell/LeftSidebar.tsx` — al iniciar drag broadcastea `wonder:dragStart` con `size` a TODOS los sandboxes para que renderen el ghost correcto; `wonder:dragEnd` al soltar
- `src/canvas/ComponentFrame.tsx` — añade overlay de ghost (rect dashed con tinte accent) encima de la línea de inserción
- `src/sandbox/messaging.ts` — `sandbox:dragOver` ahora incluye `ghostRect`

## Siguiente

Pendiente por prioridad:
1. Drag de elemento existente dentro del sandbox para reordenar (reparent)
2. Drag de un componente entero del canvas DENTRO de otro (nesting de componentes)
3. Undo/redo con historial real
4. Persistencia SQLite
5. AI chat para generación de componentes
6. Breakpoints/estados wirings reales (prefijos `sm:`/`hover:` en mutaciones)
