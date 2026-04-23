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
- [x] Serialización + esquema versionado (**v2**, 2026-04) con `migrateProjectFile` y upgrade-prompt Xcode-style — `src/persistence/types.ts`, `migrate.ts`, `projectFile.ts`, `actions.ts`. Layout `wonder.json` + `components/` + `design/` + `.wonder/`. Tokens en `design/tokens.json` (authoritative) + `design/tokens.css` (generado)
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

- [ ] Editor de `tailwind.config` global — `src/settings/` no existe (reemplazado por §12 Design system)
- [ ] Fake item `tailwind.config.ts` en sidebar sin handler

## 12. Design system ⭐ (nuevo — 2026-04-22)

Mitigar la inconsistencia que sufre el AI dándole al proyecto una identidad visual explícita (tokens) + convenciones extraídas del código real. Roadmap de 6+ fases (ver plan en el repo); v1 scope = colors + fonts + radii. Tailwind v4 only.

- [x] **Fase DS-0 — Project folder v2**: layout `wonder.json` (meta) + `components/` + `design/` + `.wonder/`. Migrator v1→v2 con modal "Upgrade project format" (Xcode-style) que se abre sólo al detectar v1 on disk, describe exactamente qué se añade, y auto-guarda en v2 tras confirmar. Nada es destructivo — sólo se crea `design/*` y se tira el campo `tailwindConfig` (que nunca tuvo consumidor). — `src/persistence/*`
- [x] **Fase DS-1 — Tokens schema + defaults + emisor CSS**: `src/project/tokens.ts` con schema `{colors: {primary, neutral, surface, …}, fonts: {sans, mono, display?}, radii}` + `defaultTokens()` (emerald/zinc seed) + `parseTokens(raw)` forgiving + `tokensToCss(tokens)` emite `@theme { --color-primary: …; --color-primary-soft: …; --font-sans: …; --radius-md: … }`. State `tokens: Tokens` en `useProject` + acción `updateTokens` que entra en history (undo funciona). Seed de nuevo proyecto y reloads de v1 arrancan con defaults.
- [x] **Fase DS-2 — Editor en RightPanel + preview live**: `DesignSystemPanel.tsx` se monta cuando `panel === "design" && !component`: secciones colapsables Colors / Typography / Radii con CRUD inline (add/rename/remove) de families, shades, radii; color pickers nativos + hex textbox; preview visual de radius; familias required (`primary`/`neutral`/`surface`) no se pueden borrar. Live preview: `ProjectTokensStyle` inyecta `<style>:root{…}</style>` a nivel de Shell, seeds en `globals.css @theme` hacen que Tailwind v4 genere las utilities a build time y los overrides runtime (via custom properties) ripplean al instante al canvas. Edits pasan por `updateTokens` → history → undo. Reset-to-defaults en el footer.
- [x] **Fase DS-Extract (v1) — Pipeline + modal de extracción de colores**: `src/project/extract.ts` analiza todas las sources (AST walk, no regex sobre texto), saca classes del palette Tailwind (incluyendo variantes `hover:`/`dark:`), agrega count por familia-shade. `suggestAssignments` hace greedy match por familia (chromatic → primary, neutral-gris → neutral, white → surface) × tier de shade (light/mid/dark). `applyExtraction` es pura: toma tokens + assignments → devuelve tokens nuevos + sources rewritten (solo los que cambiaron) + summary. Modal `ExtractDesignSystemModal` con tabla `color / uses / target dropdown / rewrite preview`, "Re-suggest" + "Skip all", applies via store action `applyDesignSystemExtraction` → 1 entry de history (undo rollbackea tokens + sources juntos). Botón "Extract from components" al tope del DesignSystemPanel.  `v1` cubre colors only (fonts y radii se añadirán si aparece demanda).
- [x] **Fase DS-3 — Tokens en el system prompt**: `ProjectContext` gana `tokens: Tokens` y `buildSystemPrompt` renderiza una sección `# Design system` con cada token listado como utility Tailwind (`bg-primary → #10b981`, `text-neutral-ink → #18181b`, `rounded-md → 0.5rem`, etc.) — el formato que el modelo va a teclear en `className=` directamente, no JSON anidado. BASE rule reescrita: "ALWAYS prefer project tokens over raw palette". El agent ahora dispatcha a primary/neutral/surface por defecto y auto-propaga cualquier edit de tokens en turns futuros.
- [ ] **Fase DS-4**: exemplar retrieval (1-2 componentes similares inlineados cuando el agent crea algo nuevo)
- [x] **Fase DS-5 — Primitives como pattern library implícita**: convención "cualquier componente bajo `components/primitives/*` es primitive". `src/project/primitives.ts` con `isPrimitiveFolder` + `buildPrimitivesIndex(components, order)` que parsea props una sola vez por snapshot + `primitiveImportPath(consumerFolder, primitive)` (common-prefix stripping). `ProjectContext` gana `primitives: PrimitiveDescriptor[]`; `buildSystemPrompt` inyecta sección `# Primitives` con signature table + source inlineado para las primeras 5 (resto accesible via `read_component`). BASE rule nueva: "BEFORE writing a fresh Button/Card/Input/Badge/etc, check # Primitives — if one fits, import and compose". LeftSidebar sortea primitive folders al tope, icon `Sparkles` accent-tinted para diferenciar visualmente, y context-menu gana "Promote to primitive" / "Remove from primitives" (nueva action `setComponentFolder` con `HistoryKind: "setFolder"` → undo). Folder-based en vez de flag porque así VS Code + Git ven la biblioteca sin metadata extra.
- [ ] **Fase DS-6**: lint + drift detector + auto-fix via tool_result

## 9. AI Chat (LLM en panel izquierdo) ⭐

Chat como **agente** (no simple API call) viviendo en el LeftSidebar (toggle desde Topbar). Vercel AI SDK v6 (`ai@6`, `@ai-sdk/openai@3`, `@ai-sdk/anthropic@3`) corre directo en el webview de Tauri — streaming + tool calling nativo. El agente crea/edita/borra componentes via tool calls, despachando a acciones del store (undo/redo + dirty flag gratis). Preparado para skills (extract design system, normalize tokens, …) via composición de `ToolRegistry`s.

- [x] **Fase 1 — Infra**: `@tauri-apps/plugin-http` instalado (JS + Cargo), registrado en `lib.rs`, permisos `http:default` + URL scope (`api.openai.com`, `api.anthropic.com`) en `capabilities/default.json`
- [x] **Fase 2 — Store**: `src/store/chat.ts` Zustand con sesiones múltiples en memoria + acciones (newSession, selectSession, deleteSession, renameSession, selectModel, sendMessage, stop) + chatOpen + settingsOpen + focusRequestId. `sendMessage` construye un `Agent` fresh por turno. Persistencia a `<project>/.wonder/chats.json` pendiente (follow-up)
- [x] **Fase 3 — UI shell**: botón "Chat" ✨ en Topbar (a la izquierda de undo/redo, tinted cuando está abierto) — saca el chat del tab strip para no amontonarlo. LeftSidebar swap full-content a `ChatPanel.tsx` cuando `chatOpen`, con width dinámico 232 ↔ 360 con transición. ChatPanel header con ModelPicker + SessionDropdown max-h 280 + new session + settings gear + close (X). MessageList con auto-scroll y estado vacío, ChatInput auto-grow con Enter=send / Shift+Enter=newline / stop mientras stream
- [x] **Fase 4 — Settings modal**: `ChatSettingsModal.tsx` provider-agnostic; default-model picker + itera `PROVIDERS` mostrando OpenAI (con input password + toggle show/hide + save/clear) y Anthropic con badge "Coming soon"; persiste via `secrets.ts`
- [x] **Fase 5 — Agent core (AI SDK v6)**: módulo `src/agent/` con `Agent` class wrappeando `streamText` + normalizando `fullStream` a `AgentEvent` para la UI. `models.ts` como catálogo multi-provider (factory por provider, OpenAI enabled, Anthropic "coming soon"). `resolveLanguageModel(modelId, apiKey)` inyecta la key sin usar env. `stopWhen: stepCountIs(10)` por defecto (configurable desde `config.ts`).
- [x] **Fase 6 — Tools**: `list_components`, `read_component`, `create_component`, `update_component_source`, `update_component_classes` (AST-aware vía `addClassesAtPath`/`removeClassesAtPath`), `delete_component`, `move_component`, `resize_component`, `get_selected`, `select_component` — todas despachan a `useProject.getState()` actions. `src/agent/tools/registry.ts` + `mergeTools()` para que skills futuros compongan toolsets.
- [x] **Fase 7 — System prompt + context**: `buildProjectContext()` produce manifest compacto (id/name/folder/frame) + source del seleccionado; `buildSystemPrompt(ctx, skillAddenda?)` se reconstruye cada turno para que el agente vea el estado real del proyecto. Skills podrán appendear addenda sin parchar el core.
- [x] **Fase 8 — Shortcuts**: ⌘L wired en Topbar (capture phase, activa chat + `requestFocus()`); Enter/Shift+Enter implementados en ChatInput; stop button abort-controller.
- [x] **Fase 9 — Composer rediseñado**: card rounded-2xl con focus ring en accent, status chip arriba (Loader2 + "Using X…" / "Thinking…"), textarea limpia, footer con `@`-picker + `ModelChip` + send circular. Empty state más minimalista ("Ask anything"). MessageBubbles sin labels ni borde. Settings y header limpios.
- [x] **Fase 10 — Scope contract (tags + turn-level lock)**: `composerTags[]` en el store + acciones add/remove/clear. Al enviar, los targets del turno son `tags` ?? `selectedComponentId` (fallback) y `busyComponents` se siembra con ellos desde el instante del send → el overlay pixel-grid en el canvas dura TODO el turno, no el microsegundo entre `tool_call` y `tool_result`. `buildProjectContext(focusedIds)` + `buildSystemPrompt` renderizan sección `# Focused components` con el source inlineado para que el agente no necesite `read_component`. UI: `AtPicker` (dropdown upward con búsqueda) a la izquierda del ModelChip + chip strip arriba del textarea (AtSign + X para quitar).
- [ ] **Pendiente**: persistencia de sesiones en `<project>/.wonder/chats.json`; render de tool-call chips inline; errores 401/429 con CTAs a Settings; primera skill real (`design-system.extract`).

## 10. Features nuevas pendientes

- [ ] Drag & drop de primitivas (ya casi) + reparenting de elementos existentes
- [ ] tldraw real o bendecir canvas custom y sacar tldraw del plan

## 11. Calidad

- [ ] Tests unitarios de `ast/` (objetivo ≥80%)
- [ ] Tests e2e con WebDriver Tauri
- [ ] Firma + notarización macOS

---

## Cambios recientes

**2026-04-22 — Design system (Fase DS-5 — primitives como pattern library implícita):**

- Contexto: el plan de DS pidió "`components/primitives/*` como pattern library implícita (por convención)". El objetivo no es un flag per-componente sino que la estructura de carpetas SEA la biblioteca — eso significa que alguien abriendo el proyecto en VS Code lo entiende sin abrir Wonder, y que un `git mv` basta para promover/demotear.
- `src/project/primitives.ts` (nuevo):
  - `PRIMITIVES_FOLDER = "primitives"` + `isPrimitiveFolder(f)` (`f === "primitives" || f.startsWith("primitives/")`) — soporta nesting futuro (`primitives/forms`, `primitives/ui`).
  - `PrimitiveDescriptor` = `{id, name, folder, filename, props: PropInfo[], source}`.
  - `buildPrimitivesIndex(components, order)` itera `order` para preservar el visual ordering del canvas, filtra primitives, y llama `listProps(source)` una sola vez por snapshot (el parseo AST es caro y se re-usa en el render del prompt).
  - `primitiveImportPath(consumerFolder, primitive)` resuelve el import relativo (`../primitives/button`, `./primitives/button`, …) via common-prefix stripping.
- `src/agent/context.ts` — `ProjectContext` gana `primitives: PrimitiveDescriptor[]`; `buildProjectContext` lo puebla via `buildPrimitivesIndex`.
- `src/agent/systemPrompt.ts`:
  - BASE rule nueva: "BEFORE writing a fresh Button/Card/Input/Badge/etc, check the `# Primitives` section below. If a primitive covers the shape you need, import it and compose — DO NOT inline the button's JSX again." + guidance sobre NO crear nuevos primitives sin que el user lo pida (la carpeta es curada).
  - `renderPrimitives(primitives)` — sección `# Primitives` con (1) tabla de signatures `name(props) — import from "path"` para TODAS las primitives y (2) source inlineado para las primeras `MAX_INLINED_SOURCES = 5`. Si hay más, nota "call `read_component` for the rest". Budget: señal fuerte sin reventar el context window.
- `src/store/project.ts` — nueva action `setComponentFolder(id, folder)` con `HistoryKind: "setFolder"` → undo funciona para promote/demote. Normaliza slashes leading/trailing; no-op si unchanged.
- `src/app/shell/LeftSidebar.tsx`:
  - `folders` sorted para que `primitives/*` salga al tope (pattern library visual jerárquicamente arriba de ad-hoc folders).
  - `TreeFolder` gana prop `primitive` — cuando true, swap icon a `Sparkles` tinted accent y color del label a `text-accent-ink` → el user ve la convención de un vistazo.
  - Context menu gana "Promote to primitive" (icon Sparkles) / "Remove from primitives" (icon FolderMinus) según el folder actual del target, con divider sobre "Delete component".
- Type-check: 0 errores nuevos. Net effect: el agent ahora ve la pattern library del proyecto y compone desde ella en vez de re-inlinear JSX; el user puede promover/demotear desde la sidebar con undo/redo.

**2026-04-22 — Design system (Fase DS-Extract v1 — pipeline + modal de extracción de colores):**

- Contexto: el user lo llamó "design system as a service" — leer los componentes existentes y poblar automáticamente el design system. Promovido al #1 porque es el feature más visible del roadmap de DS.
- `src/project/extract.ts` (nuevo) — tres funciones puras:
  - `extractFromSources(components, order)`: AST walk (`walkJSX` + `getJSXAttr`, nunca regex sobre source text — cubre template strings con `className={…}` si son literales, skipea dynamic con silencio). `parseColorClass(token)` maneja variantes arbitrarias (`dark:hover:bg-zinc-900`) trabajando sobre el último segmento tras `:`. Contabiliza 17+ prefijos que aceptan color (bg/text/border/ring/outline/divide/fill/stroke/from/via/to/accent/caret/shadow/decoration/placeholder). Output ranked por count desc, incluye `unparseableIds` para UI-warning.
  - `suggestAssignments(colors, tokens)`: greedy first-fit. `familyKind` clasifica por prefijo (`slate/gray/zinc/neutral/stone` = neutral, resto = chromatic, `white/black/transparent` = edge). `shadeTier`: 50–200 light, 300–500 mid, 600+ dark. Roles prioritarios: chromatic mid → primary.DEFAULT, chromatic dark → primary.ink, chromatic light → primary.soft; neutral simétrico; white → surface.DEFAULT/raised. Slots ya claimed dejan la color unassigned (user skipea o sobrescribe).
  - `applyExtraction({components, order, tokens, assignments})`: clona tokens, inyecta los hex extracted en los target slots (creando families nuevas si no existen — tracked en `familiesCreated` para el toast UI), construye replacement map `palette-name → token-suffix` y codemods cada source (AST-aware — respeta variantes, dupe-frees, preserva orden de classes). Solo devuelve entries de `sources` que cambiaron.
- `src/store/project.ts` — nueva action `applyDesignSystemExtraction({tokens, sources})`: un solo `pushHistory("applyExtraction")` y luego `set({ tokens, components })` atomically → undo con ⌘Z rolla back tokens + todas las sources juntas. Skip-silent si nada cambió (prevent no-op history entries). `HistoryKind` gana el variant.
- `src/app/shell/ExtractDesignSystemModal.tsx` (nuevo) — modal 720×85vh con tabla 4-col: swatch+name+hex / count+componentes / target dropdown (built from current tokens: cada family × shade existente + extensiones standard `soft/tint/ink/raised/sunken` como slots nuevos) / live rewrite preview (`bg-emerald-500 → bg-primary` tinted en accent-ink). Footer con counts y "Apply N". Esc/clickout/X cerrar. "Re-suggest" para regenerar sugerencias, "Skip all" para empezar de cero. Unparseable components aparecen en banner amber al tope.
- `src/app/shell/DesignSystemPanel.tsx` — botón "Extract from components" en el header (icon Sparkles, accent-tinted) abre el modal.
- Type-check: 0 errores nuevos. El flujo end-to-end: abrir un proyecto con componentes que usen `bg-emerald-500` → Design panel (right) → Extract → el modal te sugiere emerald-500 → primary, aceptas, Apply → los sources se reescriben a `bg-primary` + el token DEFAULT queda en #10b981 + ⌘Z rolla todo back.

**2026-04-22 — Design system (Fase DS-3 — tokens en el system prompt del agent):**

- `src/agent/context.ts` — `ProjectContext` gana `tokens: Tokens`. `buildProjectContext` lee `useProject.getState().tokens` y lo añade al snapshot.
- `src/agent/systemPrompt.ts` — nuevo `renderDesignSystem(tokens)` que produce la sección `# Design system` en markdown con cada family/shade como línea `- \`bg-primary-soft\` → #d1fae5`, DEFAULT primero, luego alfabético. Typography con `condenseFontStack` que acorta stacks largos (`"Inter", ui-sans-serif, …` en vez de los 8 fallbacks). Radii como `rounded-<key>`. BASE rules reescritas: (1) "ALWAYS prefer project tokens over raw palette" — el anterior `text-emerald-700` ejemplo cambió a `text-neutral-ink`; (2) cuando el user pide un color nuevo, sugerir añadir un token en el Design System panel en vez de hardcodearlo (no hay tool para crear tokens todavía).
- Net effect: el modelo tiene ahora una lista compacta y actionable de los tokens disponibles, ve los valores (para elegir "¿soft o ink?" informedly), y sabe que esas classes van a auto-recolorear si el user edita tokens. Consistencia entre componentes + facilidad de rebrand = el punto principal del design system.
- Type-check: 0 errores nuevos.

**2026-04-22 — Design system (Fase DS-2 — RightPanel editor + live preview):**

- `src/app/shell/DesignSystemPanel.tsx` (nuevo) — panel completo con tres grupos: Colors (N families con swatch+rename+delete, cada family lista shades con color picker nativo + hex input + CSS var hint `--color-primary-soft`; DEFAULT no se puede borrar/renombrar; required families `primary/neutral/surface` tampoco); Typography (sans/mono textareas con font-family preview en el propio input; display opt-in/opt-out); Radii (key/value con preview cuadrado del radius aplicado). Reset-to-defaults al final. CRUD: `updateTokens` con updater pattern, rename rebuilding dict (conserva insertion order para renames). Auto-sync de local state cuando el store cambia por undo/redo (ref-based guard en vez de useEffect — cheap re-render).
- `src/app/shell/RightPanel.tsx` — header breadcrumb + state tabs ahora gated detrás de `component` (sin selección era "— › 0" + state pills inútiles). Render switch: `panel === "design" && component` → element editor original; `&& !component` → `<DesignSystemPanel />`.
- `src/app/shell/ProjectTokensStyle.tsx` (nuevo) — mount-level `<style>:root{…}</style>` sincronizado con `useProject.tokens` vía `useMemo`. Mounts en `Shell.tsx` como primer child del root div.
- `src/styles/globals.css` — añadidos seeds de project tokens (primary/neutral/surface + sans/mono + sm/md/lg/xl/full radii) al `@theme` block del editor. Tailwind v4 sólo genera utilities cuando el `@theme` las declara at build-time; los overrides runtime via `ProjectTokensStyle` mutan los custom properties que esas utilities dereferencian → cambio de color en el panel ripplea inmediato sin rebuild. Bloque comentado in-place para que la gente sepa mantenerlo sync con `defaultTokens()`.
- Type-check: 0 errores nuevos. Warning preexistentes intactos.

**2026-04-22 — Design system (Fases DS-0 + DS-1 — project v2 + tokens + migrator):**

- Contexto: plan de 6+ fases para dar al agent contexto de diseño del proyecto y mitigar la inconsistencia de AI (user: "podemos tener una seccion de patterns con ejecucion as a service que lea los componentes y genere los patterns para poblar el design system"). Decisiones cerradas: scope v1 = colors + fonts + radii; Tailwind v4 sólo; editor en RightPanel; migración con modal explícito; pattern library por convención.
- **Fase DS-0 — Project folder v2**:
  - `src/persistence/types.ts` — `PROJECT_FILE_VERSION = 2`, `ProjectFile` pierde `tailwindConfig` (nunca tuvo consumidor — migrado a `design/tokens.json`). `LoadedProject` gana `tokens: Tokens` + `onDiskVersion: number`.
  - `src/persistence/migrate.ts` — nueva API `migrateProjectFile(raw) → {meta, fromVersion}`. Migración v1→v2 es un single-field delete (tira `tailwindConfig`). Versiones futuras se añaden aquí.
  - `src/persistence/fs.ts` — `readProjectFolder` lee `design/tokens.json` en paralelo con los sources (fallback a `defaultTokens()` si no existe). `writeProjectFolder` ahora acepta `tokens: Tokens` y escribe el trío `components/` → `design/tokens.json` + `design/tokens.css` + `ensureDir(.wonder/)` → `wonder.json` al final (commit marker). Atomic writes idénticos.
  - `src/persistence/actions.ts` — `loadProjectFromPath` detecta `onDiskVersion < CURRENT` → modal `confirmUpgrade` (Tauri `ask`) describiendo exactamente los archivos que se crean. Si el user confirma → `replaceProject` + auto-save inmediato para persistir el v2 layout on disk. Cancel → abort open (nada se escribe). `writeToPath` pasa `store.tokens` al writer.
- **Fase DS-1 — Tokens**:
  - `src/project/tokens.ts` (nuevo) — schema `{colors: {primary/neutral/surface/…}, fonts: {sans, mono, display?}, radii}` + `defaultTokens()` (emerald #10b981, zinc neutrals) + `parseTokens(raw)` forgiving (drops families sin DEFAULT, preserva variantes extra tipo `50`-`950`) + `tokensToCss(tokens)` emite `@theme { … }` con naming Tailwind v4 (`--color-primary`, `--color-primary-soft`, `--font-sans`, `--radius-md`). Header de tokens.css advierte "do NOT edit by hand".
  - `src/store/project.ts` — `tokens: Tokens` en state + `DocSnapshot` (los cambios de tokens entran en history → undo funciona). `updateTokens(next | updater)` con `tokensEqual` short-circuit para no spamear history con idle UI reads, `"setTokens"` como `HistoryKind` (coalescea con `COALESCE_MS` — drag de color slider = 1 sola entrada de history). `emptyProjectState` + seed inicial + `replaceProject` aceptan y propagan tokens. Fallback a `defaultTokens()` cuando el payload no los trae (proyectos v1 recién cargados).
- Type-check: 0 errores nuevos.

**2026-04-22 — AI Chat (Fase 10 — Scope contract: tags + turn-level lock):**

- Contexto: el overlay pixel-grid per-tool-call nunca aparecía ("realmente nunca sabemos cuando esta editando un componente, entonces nunca se hace el disabled") porque `tool_call` → `tool_result` es ~síncrono. Pivote: **el usuario declara el scope** (tags `@component`) y el lock dura todo el turno.
- `src/store/chat.ts`:
  - Nuevo tipo `ComposerTag = {id, name}` + state `composerTags[]` + acciones `addComposerTag` / `removeComposerTag` / `clearComposerTags`.
  - `sendMessage` resuelve `targetIds = explicitTags ?? [selectedComponentId]` (ids inválidos se descartan), siembra `busyComponents` con ellos al inicio del turno, limpia tags y los pasa a `buildProjectContext(targetIds)`.
  - **Eliminada** la maquinaria per-tool-call (`_busyByCall`, `MUTATING_TOOLS`, `reduceBusy`) — ahora es dead code, el lock es puramente turn-scoped. `applyEvent` queda sólo con la proyección al message.
- `src/agent/context.ts`: `ProjectContext` gana campo `focused: FocusedComponent[]` (id/name/source); `buildProjectContext(focusedIds?)` lo puebla validando contra el project store.
- `src/agent/systemPrompt.ts`: cuando hay `focused`, inyecta sección `# Focused components` con instrucción explícita ("Edit ONLY these…") + source inlineado de cada uno → ahorra un `read_component` roundtrip. Si no hay tags, cae al comportamiento anterior (`# Current selection`).
- `src/app/shell/ChatPanel.tsx`:
  - Nuevo componente `AtPicker` — botón circular con icono `AtSign` a la izquierda del `ModelChip` → dropdown upward con input de búsqueda + lista de componentes (items ya añadidos se marcan "added").
  - Strip de chips verdes arriba del textarea (AtSign + name + X) listando los tags activos, removibles con click.
- Type-check: 0 errores nuevos.

**2026-04-22 — AI Chat (Fase 9 — Composer rediseñado + pixel-grid overlay):**

- Rediseño del chat más minimalista (user: "el composer es feo, me gustaria ahi seleccionar"). Card `rounded-2xl` con focus ring en `accent/40`, status chip (Loader2 animado + "Using X…" / "Thinking…") SOLO mientras streaming, textarea sin chrome, footer con ModelChip pill (abre upward) + botón send circular (`size-8` bg-accent). Stop button circular bg-ink. Empty state: icono accent grande + "Ask anything" + subtítulo. MessageBubbles sin labels, `bg-panel-soft` para assistant. Header sin border-b.
- Settings modal gana `DefaultModelSection` (chips, sincronizado con el chat — "En ambos").
- `PixelGridLoader.tsx` (nuevo) — spinner 3×3 inspirado en github.com/czorr/pixgrid: centro fijo + 8 perimeter pixels con `animationDelay` en orden clockwise. Keyframes `pixgrid-pulse` en `globals.css` para sobrevivir HMR.
- `ComponentFrame.tsx` — lee `useChat.busyComponents[id]`; cuando true, bloquea drag/resize + overlay `inset-0` con `bg-white/55` y ring accent conteniendo el loader centrado.

**2026-04-22 — AI Chat (Fases 5-7 — Agent + tools + context):**

- Replanteo del chat como **agente** (user: "esto es un agent, no es un simple api call"). Research: Mastra es server-only (no corre en webview); Vercel AI SDK v6 sí → pick AI SDK.
- Instalados `ai@6.0.168`, `@ai-sdk/openai@3.0.53`, `@ai-sdk/anthropic@3.0.71`, `zod@4.3.6`.
- **Borrado** `src/chat/providers/*` (stub obsoleto) — "borrado, codigo limpio siempre".
- Nuevo módulo `src/agent/`:
  - `config.ts` — `DEFAULT_MAX_STEPS=10`, `DEFAULT_TEMPERATURE=0.2` (preparados para exponerse en Settings).
  - `types.ts` — `AgentEvent` union (text/tool_call/tool_result/tool_error/done/error) normalizado; la UI no importa de `ai` directamente.
  - `models.ts` — catálogo provider-agnostic: `PROVIDERS` con factory por provider (`createOpenAI`/`createAnthropic`). `resolveLanguageModel(modelId, apiKey)` inyecta la key. Agregar un provider nuevo = una entry en `PROVIDERS`.
  - `tools/registry.ts` — `ToolRegistry = ToolSet` + `mergeTools(...)` para skills.
  - `tools/components.ts` — 8 tools (list/read/create/update_source/update_classes/delete/move/resize). `update_component_classes` usa AST: add/removeClasses/removePrefixes en un path (ej. quitar `bg-*` antes de agregar `bg-emerald-500`).
  - `tools/selection.ts` — `get_selected` (incluye las classes del elemento activo sin necesidad de un read extra), `select_component`.
  - `tools/index.ts` — `defaultTools()` = merge de componentTools + selectionTools.
  - `context.ts` — `buildProjectContext()` snap compacto (manifest id/name/folder/frame + source del seleccionado).
  - `systemPrompt.ts` — `buildSystemPrompt(ctx, skillAddenda?)` reconstruido cada turno.
  - `agent.ts` — clase `Agent` con `run(messages, {signal})` → `AsyncIterable<AgentEvent>`. Wrappea `streamText` + `stopWhen: stepCountIs(maxSteps)` + maps `fullStream` → `AgentEvent`.
  - `skills/README.md` — placeholder para skills futuros (extract / normalize / variants / autoarrange).
  - `index.ts` — barrel.
- `src/chat/types.ts` — trimmed a persistencia pura (Message/Session/ToolCall/ChatFile). `ChatEvent` movido a `agent/types.ts`; `ProviderId`/`ModelConfig` a `agent/models.ts`.
- `src/chat/secrets.ts` — import de `ProviderId` ahora viene de `@/agent/models`.
- `src/store/chat.ts` — `sendMessage` construye `new Agent({ model: resolveLanguageModel(modelId, apiKey), tools: defaultTools(), system: buildSystemPrompt(buildProjectContext()) })` y consume `agent.run(...)`. Reducer `reduceMessage` ahora maneja `tool_call`/`tool_result`/`tool_error` en el array `toolCalls[]` del assistant message (para UI de chips inline).
- `src/ast/tailwind.ts` — nuevo `addClassesAtPath(code, path, classes[])` dedupe-preserving-order para `update_component_classes`.
- `src/app/shell/ChatPanel.tsx` + `ChatSettingsModal.tsx` — imports migrados de `@/chat/providers` a `@/agent`. Settings ahora incluye **Default model** section (botones tipo chip, sincronizados con el picker del chat header — "En ambos", como pediste).
- Type-check: 0 errores nuevos (sólo warnings pre-existentes de unused vars).

**2026-04-22 — AI Chat (Fases 2-4 — store + UI visible):**

- `src/store/chat.ts` — Zustand store: sessions[], activeSessionId, selectedProvider/Model, streaming + abort, sidebarTab, settingsOpen, focusRequestId. `sendMessage` ya itera eventos del provider (stub emite `error` hasta Fase 5); reducer `applyEvent` aplica `text`/`error` al assistant message. Título de sesión se autocompleta con el primer prompt del usuario.
- `src/app/shell/LeftSidebar.tsx` — 4º tab "Chat" (icono Sparkles). Tab state hoisted a `useChat` para que ⌘L pueda cambiarlo desde fuera. Width dinámico `w-[232px]` ↔ `w-[360px]` con transición. `FilesPanel` extraído como subcomponente para limpieza.
- `src/app/shell/ChatPanel.tsx` — header (model dropdown con descripción + session dropdown max-h 280 + new chat + settings gear), MessageList con auto-scroll + estado vacío (hero con icono + copy), ChatInput auto-grow hasta 160px con Enter/Shift+Enter/stop.
- `src/app/shell/ChatSettingsModal.tsx` — modal provider-agnostic; itera `PROVIDERS` — OpenAI con input password + show/hide + save + clear; Anthropic placeholder con badge "Coming soon"; escape-to-close + click-outside; persiste via `secrets.ts`.
- `src/app/shell/Topbar.tsx` — ⌘L en capture phase (antes que Monaco cmd+L de go-to-line). Activa tab Chat + `requestFocus()`.

**2026-04-22 — AI Chat (Fase 1 — infra + skeleton):**

- `src-tauri/Cargo.toml` + `src/lib.rs` + `capabilities/default.json` — plugin `tauri-plugin-http` instalado/registrado; permiso `http:default` + scope de URLs para `api.openai.com` y `api.anthropic.com`
- `@tauri-apps/plugin-http` en package.json
- `src/chat/types.ts` — `Message`, `Session`, `ToolCall`, `ModelConfig`, `ChatEvent` (protocolo de streaming provider-agnostic), `ChatFile` (v1, persiste en `<project>/.wonder/chats.json`)
- `src/chat/providers/types.ts` — interface `ChatProvider` + `StreamOptions` + `ProviderTool`; el store solo depende de la interface
- `src/chat/providers/openai.ts` — stub con metadata y modelos (`gpt-5.4-mini`, `gpt-5.3-codex`); `stream()` emite event `error` por ahora (real fetch aterriza en Fase 5)
- `src/chat/providers/index.ts` — registry `PROVIDERS` con OpenAI y Anthropic (placeholder `enabled: false` "coming soon"); helpers `allModels()` / `providerForModel()`
- `src/chat/secrets.ts` — API keys en `$APPDATA/secrets.json` keyed por provider (no keychain por ahora; actualizable sin cambiar callsites)
- `src/chat/index.ts` — barrel export

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
1. **Design system DS-4** — exemplar retrieval: al crear un componente nuevo, el agent recibe 1–2 componentes existentes similares inlineados en el prompt como "así se ven las cosas en este proyecto".
2. **Design system DS-6** — lint + drift detector + auto-fix via tool_result: tool `check_tokens` que escanea sources post-edit y propone/aplica swaps de raw palette → tokens.
3. **AI Chat — Smoke test end-to-end**: abrir chat, meter API key, pedir "crea un botón verde primario" y verificar que aparece en el canvas con undo. Si falla, debug desde el `fullStream` loop.
4. **AI Chat — Tool-call chips en UI**: renderizar `message.toolCalls[]` como chips inline ("✨ create_component(Button)") con expandable args/result.
5. **AI Chat — Persistencia de sesiones** en `<project>/.wonder/chats.json`.
6. **Persistencia fase 2** — Autosave debounced + recovery de crash.
7. Drag de elemento existente dentro del sandbox para reordenar (reparent).
8. Drag de un componente entero del canvas DENTRO de otro (nesting de componentes).
9. Breakpoints/estados wirings reales (prefijos `sm:`/`hover:` en mutaciones).
10. Snapshots / timeline real en StatusBar.
