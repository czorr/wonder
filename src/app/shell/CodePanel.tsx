import { AppIcon } from "@/app/icons";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProject } from "@/store/project";

const MIN_PANEL_HEIGHT = 120;
const MAX_PANEL_HEIGHT_MARGIN = 220; // leave at least this much of the window above the panel
const DEFAULT_PANEL_HEIGHT = 260;

export function CodePanel() {
  const openTabs = useProject((s) => s.openTabs);
  const activeTab = useProject((s) => s.activeTab);
  const components = useProject((s) => s.components);
  const setSource = useProject((s) => s.setSource);
  const setActiveTab = useProject((s) => s.setActiveTab);
  const closeTab = useProject((s) => s.closeTab);

  const active = activeTab ? components[activeTab] : null;
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  // Track the last value we pushed in from outside (not typed by user)
  const externalValueRef = useRef<string>("");

  // --- Resizable panel height (drag the top edge to resize) ---------------
  const [height, setHeight] = useState<number>(DEFAULT_PANEL_HEIGHT);
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      const maxH = Math.max(
        MIN_PANEL_HEIGHT,
        window.innerHeight - MAX_PANEL_HEIGHT_MARGIN,
      );
      const next = Math.min(maxH, Math.max(MIN_PANEL_HEIGHT, startH + delta));
      setHeight(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [height]);

  // --- "synced" / "editing" status --------------------------------------
  const [dirty, setDirty] = useState(false);
  const dirtyTimer = useRef<number | null>(null);
  const markDirty = useCallback(() => {
    setDirty(true);
    if (dirtyTimer.current) window.clearTimeout(dirtyTimer.current);
    dirtyTimer.current = window.setTimeout(() => setDirty(false), 280);
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !active) return;
    const incoming = active.source;
    if (editor.getValue() === incoming) return;
    externalValueRef.current = incoming;
    const model = editor.getModel();
    if (!model) return;
    const position = editor.getPosition();
    const scrollTop = editor.getScrollTop();
    model.setValue(incoming);
    if (position) editor.setPosition(position);
    editor.setScrollTop(scrollTop);
  }, [active?.source]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = useCallback(
    (v: string | undefined) => {
      if (!active || v === undefined) return;
      externalValueRef.current = v;
      markDirty();
      setSource(active.id, v);
    },
    [active, setSource, markDirty],
  );

  const onPrettify = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || !active) return;
    try {
      // Prettier ships ESM browser builds that work in Vite without a worker.
      // Plugins must be imported separately and passed in explicitly.
      const prettier = await import("prettier/standalone");
      const pluginEstree = (await import("prettier/plugins/estree")).default;
      const pluginBabel = await import("prettier/plugins/babel");
      const pluginTs = await import("prettier/plugins/typescript");
      const source = editor.getValue();
      const formatted = await prettier.format(source, {
        parser: "typescript",
        plugins: [pluginEstree, pluginBabel, pluginTs],
        semi: true,
        singleQuote: false,
        tabWidth: 2,
        printWidth: 80,
        trailingComma: "all",
        jsxSingleQuote: false,
        bracketSameLine: false,
      });
      // Preserve cursor + scroll.
      const model = editor.getModel();
      if (!model) return;
      const position = editor.getPosition();
      const scrollTop = editor.getScrollTop();
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: formatted }],
        () => null,
      );
      if (position) editor.setPosition(position);
      editor.setScrollTop(scrollTop);
      setSource(active.id, formatted);
      editor.focus();
    } catch (err) {
      console.error("[prettify] failed:", err);
    }
  }, [active, setSource]);

  const beforeMount: BeforeMount = (monaco) => {
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      jsx: monaco.languages.typescript.JsxEmit.React,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      strict: false,
      noEmit: true,
    });

    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: [
        2307, // Cannot find module '...'
        2304, // Cannot find name '...'
        2305, // Module has no exported member '...'
        2669, // Augmentations for the global scope...
        2875, // JSX tag requires react/jsx-runtime module path
        6133, // Declared but never read
        6196, // Declared but never used
      ],
    });

    // Minimal React type stub so JSX elements resolve without red squiggles.
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `
declare module "react" {
  export = React;
  export as namespace React;
}
declare namespace React {
  type ReactNode = any;
  type FC<P = {}> = (props: P) => ReactNode;
  function createElement(type: any, props?: any, ...children: any[]): any;
  function useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void];
  function useEffect(f: () => void | (() => void), deps?: any[]): void;
  function useRef<T>(init: T): { current: T };
  function useCallback<T extends (...a: any[]) => any>(f: T, deps: any[]): T;
  function useMemo<T>(f: () => T, deps: any[]): T;
  namespace JSX {
    interface Element {}
    interface IntrinsicElements { [k: string]: any }
    interface ElementAttributesProperty { props: {}; }
  }
}
`,
      "file:///react.d.ts",
    );

    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `
declare module "react/jsx-runtime" {
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
  export const Fragment: any;
}
declare module "react/jsx-dev-runtime" {
  export function jsxDEV(type: any, props: any, key?: any, isStatic?: boolean, src?: any, ctx?: any): any;
  export const Fragment: any;
}
declare module "lucide-react" {
  export type LucideProps = { size?: number; strokeWidth?: number; className?: string; color?: string };
  export type LucideIcon = (props: LucideProps) => React.ReactNode;
  const _default: { [key: string]: LucideIcon };
  export default _default;
  export const TrendingUp: LucideIcon;
  export const TrendingDown: LucideIcon;
}
declare module "motion" {
  export const motion: any;
  export const AnimatePresence: any;
  export const animate: any;
  export const useMotionValue: any;
  export const useTransform: any;
}
`,
      "file:///wonder-stubs.d.ts",
    );
  };

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    monaco.editor.defineTheme("wonder-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "keyword", foreground: "db2777" },
        { token: "string", foreground: "047857" },
        { token: "type", foreground: "0284c7" },
        { token: "identifier.ts", foreground: "18181b" },
      ],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#18181b",
        "editorLineNumber.foreground": "#a1a1aa",
        "editorLineNumber.activeForeground": "#52525b",
        "editor.lineHighlightBackground": "#f4f4f5",
        "editor.lineHighlightBorder": "#00000000",
        "editorCursor.foreground": "#10b981",
        "editor.selectionBackground": "#d1fae5",
        "editorIndentGuide.background": "#f4f4f5",
      },
    });
    monaco.editor.setTheme("wonder-light");
  };

  // Derive file extension badge from the active tab's filename (TSX / TS / JSX / JS).
  const ext = active?.filename.match(/\.([^.]+)$/)?.[1]?.toUpperCase() ?? "";

  return (
    <section
      className="relative flex shrink-0 flex-col border-t border-stroke bg-panel"
      style={{ height }}
    >
      {/* Resize handle — drag the top edge to resize the code panel. */}
      <div
        onMouseDown={onResizeStart}
        title="Drag to resize"
        className="group absolute inset-x-0 -top-[3px] z-10 flex h-[6px] cursor-ns-resize items-center justify-center"
      >
        <div className="h-[2px] w-10 rounded-full bg-transparent group-hover:bg-accent/60 transition" />
        <AppIcon
          name="Drag"
          size={14}
          className="pointer-events-none absolute text-ink-faint opacity-0 group-hover:opacity-100 transition"
        />
      </div>

      <div className="flex items-center justify-between border-b border-stroke pr-2">
        <div className="flex items-center overflow-x-auto">
          {openTabs.map((id) => {
            const c = components[id];
            if (!c) return null;
            const isActive = id === activeTab;
            return (
              <div
                key={id}
                onMouseDown={() => setActiveTab(id)}
                className={
                  "flex shrink-0 items-center gap-1.5 border-r border-stroke pl-3 pr-2 py-2 text-[11px] cursor-pointer " +
                  (isActive
                    ? "bg-panel text-ink border-b-2 border-b-accent -mb-px"
                    : "bg-panel-soft text-ink-muted hover:text-ink")
                }
              >
                <AppIcon name="FileCode" size={12} className="text-ink-faint" />
                {c.filename}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(id);
                  }}
                  className="ml-1 grid size-4 place-items-center rounded text-ink-faint hover:bg-stroke hover:text-ink-muted"
                >
                  <AppIcon name="X" size={10} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[10px] text-ink-muted">
          {active ? (
            <button
              onClick={onPrettify}
              title="Prettify (format document)"
              className="flex items-center gap-1 rounded-md border border-stroke px-2 py-0.5 text-ink-muted hover:bg-panel-soft hover:text-ink"
            >
              <AppIcon name="Wand" size={10} />
              Prettify
            </button>
          ) : null}
          {active ? (
            dirty ? (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 font-medium">
                <AppIcon name="Loader" size={10} className="animate-spin" />
                editing
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 text-accent-ink font-medium">
                <AppIcon name="Check" size={10} /> synced
              </span>
            )
          ) : null}
          {active ? (
            <span className="text-ink-faint">
              {active.source.split("\n").length} lines
            </span>
          ) : null}
          <span className="text-ink-faint">UTF-8</span>
          {ext ? <span className="text-ink-faint">{ext}</span> : null}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {active ? (
          <Editor
            height="100%"
            path={active.filename}
            defaultLanguage="typescript"
            language="typescript"
            defaultValue={active.source}
            onChange={onChange}
            onMount={onMount}
            beforeMount={beforeMount}
            options={{
              fontSize: 12,
              fontFamily:
                "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
              minimap: { enabled: false },
              lineNumbersMinChars: 3,
              folding: false,
              renderLineHighlight: "line",
              scrollBeyondLastLine: false,
              tabSize: 2,
              insertSpaces: true,
              detectIndentation: false,
              formatOnType: false,
              formatOnPaste: false,
              autoIndent: "none",
              padding: { top: 8, bottom: 8 },
              scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
              },
            }}
          />
        ) : (
          <div className="grid h-full place-items-center text-[11px] text-ink-faint">
            No file open
          </div>
        )}
      </div>
    </section>
  );
}
