# Wonder

Editor visual tipo Figma para construir componentes React + Tailwind, con canvas infinito, código sincronizado en vivo y manipulación bidireccional visual ↔ código.

---

## 1. Visión

Wonder es una aplicación de escritorio para macOS que permite construir interfaces de React + Tailwind de forma visual sobre un canvas infinito, con el código siempre presente y editable como fuente de verdad. Cada componente vive como un "frame" flotante en el canvas — se puede arrastrar, escalar, duplicar, y editar visualmente desde un panel de propiedades estilo Figma. El código se actualiza en tiempo real en ambas direcciones: editar visualmente muta el código, editar el código muta el canvas.

El output siempre es código real exportable, no un formato propietario que requiere traducción posterior.

---

## 2. Propuesta de valor

| Frente a | Diferencia clave |
|---|---|
| Figma | Output es código React real, no diseño que hay que traducir |
| v0 / Bolt | Manipulación visual directa en canvas, no solo prompts |
| Webstudio / Framer | First-class React + Tailwind sin abstracciones propias |
| Storybook | Construcción visual, no solo visualización |
| VSCode + preview | Canvas multi-componente flotante, no archivo único |

---

## 3. Decisiones técnicas (locked)

| Decisión | Valor |
|---|---|
| Lenguaje | TypeScript desde el día 1 (acepta también `.jsx`) |
| Dependencias permitidas en sandbox | shadcn/ui, lucide-react, @iconify/react, motion (handpicked, ampliable) |
| Tailwind config | Global por proyecto, editable desde Settings |
| Estructura de componente | Single-file por componente |
| Props | Editor de props con inputs en panel derecho para previsualizar valores |
| Hot reload | Activo, debounce 300ms |
| Versionado | Snapshots persistentes + undo/redo en memoria |
| Fuente de verdad | El **string de código**. El AST se reconstruye, nunca persiste |

---

## 4. Stack técnico

| Capa | Tecnología | Razón |
|---|---|---|
| Shell de escritorio | Tauri 2 | Ligero, nativo, binarios pequeños, Rust backend |
| UI framework | React 18 + TypeScript + Vite | Coherente con lo que el editor manipula |
| Canvas | tldraw SDK 3 | Cercano a Figma-like, listo para usar, custom shapes |
| Editor de código | Monaco | Estándar, soporta JSX/TSX, IntelliSense |
| Sandbox de render | iframe + postMessage | Aísla ejecución, evita romper la app |
| Bundler runtime | esbuild-wasm | Compila JSX en el browser, rápido |
| Parser AST | @babel/parser + recast | Mutaciones preservando formato del usuario |
| Tailwind runtime | Tailwind 4 standalone | Compilación on-the-fly dentro del iframe |
| Estado global | Zustand | Simple, sin boilerplate |
| UI de la app | shadcn/ui + Tailwind 4 | Coherencia con el dominio |
| Persistencia | SQLite vía Tauri SQL plugin | Local-first, sin backend |
| Versionado | jsdiff + snapshots en SQLite | Diffs y restauración |

---

## 5. Layout de la aplicación

```
┌──────────────────────────────────────────────────────────┐
│ Topbar: archivo, undo/redo, breakpoints, run, export     │
├──────┬─────────────────────────────────────────┬─────────┤
│      │                                         │         │
│ Left │                                         │  Right  │
│ Side │           CANVAS INFINITO               │  Panel  │
│ bar  │     (componentes flotantes,             │ (props  │
│      │      pan/zoom, multi-instancia)         │ Tailwind│
│      │                                         │  layers)│
│      ├─────────────────────────────────────────┤         │
│      │  CODE PANEL (Monaco) — colapsable       │         │
└──────┴─────────────────────────────────────────┴─────────┘
```

**Left Sidebar:** árbol de componentes del proyecto, librería de elementos base (div, button, input, etc.), assets.
**Canvas:** componentes renderizados como frames flotantes, pan/zoom, selección, snap a grid.
**Right Panel:** propiedades Tailwind del nodo seleccionado, agrupadas por categoría (Layout, Spacing, Typography, Colors, Effects, etc.) + editor de props del componente + jerarquía de capas (DOM tree del componente).
**Code Panel:** editor del componente seleccionado, sincronizado con el canvas.

---

## 6. Modelo de datos

```ts
type Project = {
  id: string;
  name: string;
  tailwindConfig: string;       // JSON serializado
  createdAt: number;
  updatedAt: number;
};

type Component = {
  id: string;
  projectId: string;
  name: string;
  sourceCode: string;            // SOURCE OF TRUTH
  canvasPosition: { x: number; y: number };
  canvasSize: { w: number; h: number };
  viewport: "base" | "sm" | "md" | "lg" | "xl" | "2xl";
  propsMock: Record<string, unknown>; // valores actuales de props
  createdAt: number;
  updatedAt: number;
};

type Snapshot = {
  id: string;
  componentId: string;
  sourceCode: string;
  label?: string;
  createdAt: number;
};

type Asset = {
  id: string;
  projectId: string;
  type: "image" | "svg" | "font";
  path: string;
  createdAt: number;
};
```

---

## 7. Esquema SQLite

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tailwind_config TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE components (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_code TEXT NOT NULL,
  canvas_x REAL NOT NULL DEFAULT 0,
  canvas_y REAL NOT NULL DEFAULT 0,
  canvas_w REAL,
  canvas_h REAL,
  viewport TEXT NOT NULL DEFAULT 'base',
  props_mock TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  source_code TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_components_project ON components(project_id);
CREATE INDEX idx_snapshots_component ON snapshots(component_id, created_at DESC);
```

---

## 8. Flujos críticos

### 8.1. Pegar código → render

```
paste JSX → @babel/parser (validar) → bundle (esbuild-wasm) →
inject en iframe sandbox → medir bounding box →
crear nodo en canvas → guardar en SQLite
```

### 8.2. Editar visualmente → actualizar código

```
click en elemento (canvas) → resolver path en AST →
panel muestra clases Tailwind agrupadas → user cambia "p-4" → "p-6" →
mutación AST con recast → regenerar source string → re-render iframe →
update Monaco
```

### 8.3. Editar código → actualizar canvas

```
debounce typing en Monaco (300ms) → re-parse AST → diff con anterior →
si válido: re-bundle + re-render → si error: marcar en gutter,
mantener último válido
```

### 8.4. Cambiar prop desde panel

```
input cambia valor → actualizar propsMock en store →
re-mount componente en sandbox con nuevos props →
canvas refleja el cambio (sin tocar source code)
```

---

## 9. Estructura de carpetas

```
wonder/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── db/                    # migraciones SQLite
│   │   └── commands/              # IPC handlers (file ops, project ops)
│   └── tauri.conf.json
├── src/
│   ├── app/
│   │   ├── App.tsx                # layout 4 regiones
│   │   ├── shell/                 # Topbar, Sidebar, Statusbar
│   │   └── routes.tsx
│   ├── canvas/                    # integración tldraw + frames
│   │   ├── Canvas.tsx
│   │   ├── ComponentFrame.tsx
│   │   └── shapes/                # custom tldraw shapes
│   ├── editor/                    # Monaco + sync
│   │   ├── CodeEditor.tsx
│   │   └── language/              # JSX/TSX config
│   ├── sandbox/                   # iframe runtime
│   │   ├── Sandbox.tsx
│   │   ├── runtime.html           # bootstrap del iframe
│   │   ├── bundler.ts             # esbuild-wasm wrapper
│   │   └── messaging.ts           # postMessage protocol
│   ├── ast/                       # parsing y mutación de código
│   │   ├── parse.ts
│   │   ├── mutate.ts              # mutaciones puras (recast)
│   │   ├── tailwind.ts            # parse/serialize className
│   │   └── selectors.ts           # path → AST node
│   ├── inspector/                 # panel derecho
│   │   ├── Inspector.tsx
│   │   ├── groups/                # Layout, Spacing, Typography, etc.
│   │   ├── PropsEditor.tsx
│   │   └── LayersPanel.tsx
│   ├── library/                   # panel izquierdo
│   │   ├── ComponentTree.tsx
│   │   ├── Primitives.tsx
│   │   └── Assets.tsx
│   ├── store/                     # Zustand
│   │   ├── project.ts
│   │   ├── canvas.ts
│   │   ├── selection.ts
│   │   └── history.ts             # undo/redo
│   ├── db/                        # cliente SQLite
│   │   ├── client.ts
│   │   ├── projects.ts
│   │   ├── components.ts
│   │   └── snapshots.ts
│   ├── settings/
│   │   ├── Settings.tsx
│   │   └── tailwindConfig.ts
│   ├── lib/
│   │   ├── tw-classes.ts          # tabla de clases Tailwind soportadas
│   │   ├── breakpoints.ts
│   │   └── utils.ts
│   └── main.tsx
├── public/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── README.md
```

---

## 10. Constantes del proyecto

```ts
// src/constants.ts
export const ALLOWED_DEPS = [
  "react", "react-dom",
  "lucide-react",
  "@iconify/react",
  "motion",
  // shadcn components se inyectan como código local
] as const;

export const SOURCE_OF_TRUTH = "code-string";
export const HOT_RELOAD_DEBOUNCE_MS = 300;
export const SUPPORTED_BREAKPOINTS = ["base", "sm", "md", "lg", "xl", "2xl"] as const;
export const SUPPORTED_STATES = ["base", "hover", "focus", "active", "disabled"] as const;
export const SNAPSHOT_TRIGGER = "on-significant-change";
export const UNDO_STACK_SIZE = 50;
```

---

## 11. Funcionalidades del MVP

1. Canvas infinito con pan/zoom, snap a grid, múltiples componentes flotantes simultáneos.
2. Render en vivo de componentes React en sandbox aislado (iframe).
3. Code editor (Monaco) con sincronización bidireccional al frame seleccionado.
4. Pegar código → renderizar: parsear JSX, validar, mostrar en canvas.
5. Panel de propiedades Tailwind: parsea `className`, expone controles visuales que escriben de vuelta clases.
6. Editor de props con inputs por tipo (string, number, boolean, enum) para previsualizar valores.
7. Layers panel: árbol de elementos del componente, click selecciona en canvas.
8. Selección visual en canvas → editar en panel derecho.
9. Breakpoints: preview responsive (sm, md, lg, xl, 2xl) con prefijos auto.
10. Estados: hover, focus, active, disabled visualizables.
11. Hot reload con debounce de 300ms.
12. Undo/redo (50 niveles en memoria).
13. Snapshots persistentes con timeline por componente.
14. Tailwind config global editable desde Settings.
15. Export a archivo `.tsx`.

---

## 12. Roadmap por sprints

### Sprint 0 — Spike técnico
**Objetivo:** validar que la sincronización bidireccional canvas ↔ código funciona limpio antes de invertir en UI.

| # | Ticket | Output esperado |
|---|---|---|
| S0-1 | Setup Tauri + React + TS + Tailwind 4 | App vacía corriendo en macOS |
| S0-2 | Cargar esbuild-wasm, compilar JSX simple | `bundle(code: string) → js: string` funcional |
| S0-3 | Iframe sandbox que ejecuta JS bundleado y monta React | iframe muestra `<Button>Hello</Button>` |
| S0-4 | Parser AST: extraer `className` de un nodo JSX | `getClassNameAtPath(code, path) → string[]` |
| S0-5 | Mutador AST: cambiar `p-4` → `p-6` preservando formato | `setClassAtPath(code, path, oldClass, newClass) → string` |
| S0-6 | Loop completo end-to-end: pegar código → render → cambiar clase desde UI mock → código actualizado | Demo funcional en una sola pantalla |

**DoD:** una página con textarea + iframe + 3 botones que mutan clases, y al final el código del textarea se actualiza correctamente sin reformatear nada más.

---

### Sprint 1 — MVP Canvas + Editor

| # | Ticket | Output |
|---|---|---|
| S1-1 | Layout 4 regiones con paneles redimensionables | Shell vacío |
| S1-2 | Integrar tldraw, custom shape `ComponentFrame` | Canvas con frames flotantes draggables |
| S1-3 | Cada `ComponentFrame` renderiza un `Sandbox` (iframe) | Frames con componentes vivos en canvas |
| S1-4 | Monaco editor sincronizado con frame seleccionado | Editar código del componente seleccionado |
| S1-5 | Hot reload con debounce 300ms | Cambios reflejados al instante |
| S1-6 | Acción "Pegar código" desde topbar → crea nuevo frame | Paste workflow funcional |
| S1-7 | Persistencia: cargar/guardar proyecto en SQLite | Cerrar y abrir app preserva estado |
| S1-8 | Inyectar Tailwind 4 standalone en iframe | Componentes con estilos correctos |

**DoD:** abrir app, pegar un componente shadcn `<Button>`, verlo en canvas con estilos correctos, editar código en Monaco, ver cambios en vivo, cerrar app, reabrir, todo persiste.

---

### Sprint 2 — Inspector (panel derecho)

| # | Ticket | Output |
|---|---|---|
| S2-1 | Selección visual: click en elemento dentro del iframe → resolver path AST | Outline visual sobre elemento clicado |
| S2-2 | Tabla de clases Tailwind soportadas en `tw-classes.ts` | Diccionario por categoría/propiedad |
| S2-3 | Inspector groups: 7 paneles colapsables (Layout, Spacing, Sizing, Typography, Colors, Borders, Effects) | UI de panel derecho |
| S2-4 | Cada control lee clase actual y al cambiar dispara mutación AST | Editar `padding` desde slider actualiza código y canvas |
| S2-5 | Layers panel: árbol de elementos, click selecciona | Navegación por jerarquía |
| S2-6 | Props editor: detectar props del AST, generar inputs por tipo | Cambiar `variant="primary"` → `"secondary"` desde input |

**DoD:** seleccionar un `<div>` en canvas, ver sus clases en el panel derecho agrupadas, cambiar `bg-blue-500` a `bg-red-500` desde color picker, ver el cambio en canvas, código y props funcionando.

---

### Sprint 3 — Pulido y features avanzadas

| # | Ticket | Output |
|---|---|---|
| S3-1 | Breakpoints: toggle en topbar, prefijos `sm:`, `md:`, etc. | Editar en breakpoint añade prefijo correcto |
| S3-2 | Estados: toggles para hover/focus/active/disabled | Editar estilo hover desde panel |
| S3-3 | Undo/redo: history en Zustand, atajos Cmd+Z / Cmd+Shift+Z | 50 niveles de undo |
| S3-4 | Snapshots automáticos + manuales | Timeline por componente |
| S3-5 | Library de primitivas: drag desde sidebar a canvas | Drag & drop para empezar de cero |
| S3-6 | Settings: editor de `tailwind.config.ts` global | Modificar paleta y se refleja en todos los componentes |
| S3-7 | Export `.tsx` a disco vía Tauri | File save dialog |

---

### Sprint 4 — Calidad y release

| # | Ticket | Output |
|---|---|---|
| S4-1 | Tests unitarios para `ast/` (≥80% coverage) | Suite verde |
| S4-2 | Tests e2e con WebDriver de Tauri | 5 escenarios end-to-end |
| S4-3 | Manejo de errores: bundler, parse, runtime en sandbox | UI no se rompe, error inline |
| S4-4 | Notarización y firma para macOS | DMG instalable |
| S4-5 | App icon, branding, splash | Identidad visual lista |

---

## 13. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Sync bidireccional pierde formato del usuario | Alta | Crítico | Sprint 0 valida con `recast` antes de cualquier UI |
| Performance del bundler en componentes grandes | Media | Alto | Worker thread + cache por hash de código |
| Tailwind 4 standalone no compila on-the-fly bien | Media | Alto | Plan B: twind o Tailwind CDN play |
| Iframe sandbox lento en re-mount | Media | Medio | Reusar iframe, hot module replacement manual |
| AST mal mapeado a elementos visuales del DOM | Media | Alto | Atributo `data-wonder-path` inyectado en build |
| Conflicto de versiones entre deps permitidas | Baja | Medio | Lock estricto del whitelist en `ALLOWED_DEPS` |

---

## 14. Decisiones pendientes (post-MVP)

- Multi-archivo / imports cruzados entre componentes del proyecto
- Plugin system para añadir nuevos grupos al Inspector
- Colaboración en tiempo real (Yjs + Supabase)
- Exportar a proyecto Vite/Next completo, no solo archivos sueltos
- Plantillas / starter kits (landing, dashboard, etc.)
- Soporte para Vue, Solid, Svelte (más allá de React)

---

## 15. Definition of Done global del MVP

Wonder está listo para release cuando:

1. Un usuario puede crear un proyecto nuevo, pegar 5 componentes React, editarlos visualmente y por código simultáneamente.
2. El código exportado es válido, formateado, y corre en un proyecto Vite estándar sin modificación.
3. Los snapshots permiten restaurar cualquier estado anterior de un componente.
4. La app no excede 80MB de instalación.
5. Cold start en menos de 2 segundos.
6. Hot reload por debajo de 500ms en componentes de tamaño medio (≤200 líneas).
7. Cero pérdida de datos en cierres inesperados (autosave continuo).