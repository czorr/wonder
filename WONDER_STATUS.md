# Wonder — Estado del proyecto

Checklist vivo del MVP vs. lo que realmente está implementado. Palomeado = hecho y probado. 🟡 = parcial. ❌ = falta.

Última actualización: 2026-04-22

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

- [x] Undo / Redo funcionales con pilas `past[]`/`future[]` en `src/store/project.ts` (MAX 100, coalescing 500ms para typing continuo)
- [x] Botones Topbar wired + disabled states reactivos — `Topbar.tsx`
- [x] Atajos ⌘Z / ⌘⇧Z / ⌘Y — capturados en fase capture antes de que Monaco los consuma; el buffer del editor se re-sincroniza vía el `useEffect` de `CodePanel` cuando `active.source` cambia
- [ ] Snapshots — "50 snapshots" hardcoded, sin storage ni timeline — `StatusBar.tsx:23`

## 7. Persistencia

Proyecto = **carpeta en disco** con `wonder.json` + `components/<folder>/<Name>.tsx`. Los sources viven en los `.tsx` reales (legibles fuera de Wonder, diff-friendly en Git, AI-friendly). `wonder.json` guarda sólo meta (ids, posiciones, selección, canvas).

- [x] Plugins Tauri `fs` + `dialog` wireados (`src-tauri/Cargo.toml`, `lib.rs`, `capabilities/default.json`)
- [x] Serialización + esquema versionado (v1) con `migrateProjectFile` — `src/persistence/types.ts`, `migrate.ts`, `projectFile.ts`
- [x] Atomic write (`path.tmp` → `rename`) + `pruneOrphans` para cleanup de `.tsx` huérfanos — `fs.ts`
- [x] Store `projectMeta` { path, name, dirty, lastSavedAt, loading } + acciones `newProject` / `replaceProject` / `markClean` / `setProjectPath` / `setLoading` — `src/store/project.ts`
- [x] Flag `dirty` se enciende desde `pushHistory`, se apaga en `markClean` tras save/load
- [x] Actions con dialogs nativos: New, Open, Save, Save As con confirmación "descartar cambios?" — `src/persistence/actions.ts`
- [x] TitleStrip con menú dropdown (File menu) + recientes + atajos ⌘N / ⌘O / ⌘S / ⌘⇧S (capture phase para ganarle a Monaco)
- [x] Bootstrap en launch: si hay `lastOpenedPath` válido, lo abre; si falla silently fall-back al seed — `Shell.tsx`
- [x] `beforeunload` guard cuando hay `dirty`
- [x] App state en `$APPDATA/app.json` (máximo 10 recientes; se autolimpia si un path ya no existe) — `src/persistence/appState.ts`
- [ ] **Fase 2**: Autosave debounced (1.5s) a `path.autosave`, con atomic rename en el save explícito
- [ ] **Fase 2**: Recovery prompt al abrir si existe `.autosave` más nuevo que `wonder.json`
- [ ] **Fase 2**: Autosave para proyectos untitled en `$APPDATA/untitled.autosave.wonder`
- [ ] SQLite dropped — plugin removido (`@tauri-apps/plugin-sql`)

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

**2026-04-22 — Persistencia local (folder-based):**

- Plugins Tauri `fs` + `dialog` instalados y wireados; `plugin-sql` JS removido
- Nuevo módulo `src/persistence/` — types + serialize + fs atomic + actions + appState + index
- Esquema `wonder.json` v1 con `migrateProjectFile`; sources viven en archivos `.tsx` reales bajo `components/`
- Store: `projectMeta` slice + `newProject` / `replaceProject` / `markClean` / `setProjectPath` / `setLoading`; `pushHistory` marca `dirty`
- TitleStrip: botón con nombre del proyecto abre File menu (New / Open / Recentes / Save / Save As / Export .tsx); indicador de dirty como dot; muestra filename del tab activo
- Atajos ⌘N / ⌘O / ⌘S / ⌘⇧S en fase capture
- Bootstrap: `loadAppState()` en `Shell.tsx` → si hay `lastOpenedPath`, `loadProjectFromPath()` automáticamente
- `beforeunload` warning si hay cambios sin guardar
- Recentes persistidos en `$APPDATA/app.json` con auto-cleanup cuando un path deja de existir

**2026-04-22 — Undo/Redo + Prettify en editor:**

- `src/store/project.ts` — pilas `past[]` / `future[]` con snapshots del doc (components, order, propValues). Cada mutación de contenido hace `pushHistory(kind)` con coalescing (setSource rápido colapsa en 1 entry). MAX_HISTORY=100.
- `src/app/shell/Topbar.tsx` — botones Undo/Redo con estados reactivos (subscribe a `past.length` / `future.length`), atajos ⌘Z / ⌘⇧Z (suprimidos cuando el foco está en Monaco, para no chocar con su undo interno de buffer).
- `src/app/shell/CodePanel.tsx` — botón Prettify usa `prettier/standalone` + `estree` + `babel` + `typescript` plugins (parser TS, maneja JSX). Reverti highlight custom de Monaco al tema minimalista de 4 reglas.

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
1. **Persistencia fase 2** — Autosave debounced + recovery de crash (`.autosave` shadow + rename atómico; recovery prompt al abrir)
2. AI chat para generación de componentes (tool interface = `addComponent` / `setSource` / `deleteComponent` del store; persistencia queda cubierta por save del usuario)
3. Drag de elemento existente dentro del sandbox para reordenar (reparent)
4. Drag de un componente entero del canvas DENTRO de otro (nesting de componentes)
5. Breakpoints/estados wirings reales (prefijos `sm:`/`hover:` en mutaciones)
6. Snapshots / timeline real en StatusBar
