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
1. **AI Chat — Smoke test end-to-end**: abrir chat, meter API key, pedir "crea un botón verde primario" y verificar que aparece en el canvas con undo. Si falla, debug desde el `fullStream` loop.
2. **AI Chat — Tool-call chips en UI**: renderizar `message.toolCalls[]` como chips inline ("✨ create_component(Button)") con expandable args/result.
3. **AI Chat — Persistencia de sesiones** en `<project>/.wonder/chats.json`.
4. **AI Chat — Primera skill real**: `design-system.extract` (scan del proyecto → paleta inferida + tokens).
5. **Persistencia fase 2** — Autosave debounced + recovery de crash.
6. Drag de elemento existente dentro del sandbox para reordenar (reparent).
7. Drag de un componente entero del canvas DENTRO de otro (nesting de componentes).
8. Breakpoints/estados wirings reales (prefijos `sm:`/`hover:` en mutaciones).
9. Snapshots / timeline real en StatusBar.
