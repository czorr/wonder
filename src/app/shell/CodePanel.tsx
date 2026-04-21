import { X, FileCode2, Check } from "lucide-react";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef } from "react";
import { useProject } from "@/store/project";

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

  // When active source changes externally (e.g. inspector), sync to editor
  // without using the controlled `value` prop so Monaco doesn't reformat.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !active) return;
    const incoming = active.source;
    // If editor already has this content (user just typed it), skip.
    if (editor.getValue() === incoming) return;
    // Only push if it truly came from outside (store changed externally).
    externalValueRef.current = incoming;
    const model = editor.getModel();
    if (!model) return;
    // Preserve cursor/scroll position across external edits.
    const position = editor.getPosition();
    const scrollTop = editor.getScrollTop();
    model.setValue(incoming);
    if (position) editor.setPosition(position);
    editor.setScrollTop(scrollTop);
  }, [active?.source]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = useCallback(
    (v: string | undefined) => {
      if (!active || v === undefined) return;
      // Mark that this value came from the user typing.
      externalValueRef.current = v;
      setSource(active.id, v);
    },
    [active, setSource],
  );

  const beforeMount: BeforeMount = (monaco) => {
    // Configure TypeScript so JSX is valid.
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

    // Suppress "Cannot find module" errors for external packages.
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

    // Stubs for common imports used in Wonder components.
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
  export const TrendingUp: LucideIcon;
  export const TrendingDown: LucideIcon;
  export const DollarSign: LucideIcon;
  export const Users: LucideIcon;
  export const ShoppingCart: LucideIcon;
  export const BarChart: LucideIcon;
  export const ArrowUp: LucideIcon;
  export const ArrowDown: LucideIcon;
  export const Check: LucideIcon;
  export const X: LucideIcon;
  export const Plus: LucideIcon;
  export const Minus: LucideIcon;
  export const Search: LucideIcon;
  export const Settings: LucideIcon;
  export const Star: LucideIcon;
  export const Heart: LucideIcon;
  export const Bell: LucideIcon;
  export const Mail: LucideIcon;
  export const Home: LucideIcon;
  export const Menu: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const ChevronLeft: LucideIcon;
  export const Sparkles: LucideIcon;
  export const Zap: LucideIcon;
  export const Shield: LucideIcon;
  export const Lock: LucideIcon;
  export const Unlock: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const Upload: LucideIcon;
  export const Download: LucideIcon;
  export const Link: LucideIcon;
  export const ExternalLink: LucideIcon;
  export const Copy: LucideIcon;
  export const Trash: LucideIcon;
  export const Edit: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const Info: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const XCircle: LucideIcon;
  export const Circle: LucideIcon;
  export const Dot: LucideIcon;
  export const Globe: LucideIcon;
  export const Map: LucideIcon;
  export const Package: LucideIcon;
  export const Box: LucideIcon;
  export const Layers: LucideIcon;
  export const Layout: LucideIcon;
  export const Grid: LucideIcon;
  export const List: LucideIcon;
  export const Table: LucideIcon;
  export const FileText: LucideIcon;
  export const File: LucideIcon;
  export const Folder: LucideIcon;
  export const Image: LucideIcon;
  export const Camera: LucideIcon;
  export const Video: LucideIcon;
  export const Music: LucideIcon;
  export const Mic: LucideIcon;
  export const Phone: LucideIcon;
  export const MessageSquare: LucideIcon;
  export const Send: LucideIcon;
  export const Share: LucideIcon;
  export const Bookmark: LucideIcon;
  export const Tag: LucideIcon;
  export const Flag: LucideIcon;
  export const Target: LucideIcon;
  export const Award: LucideIcon;
  export const Gift: LucideIcon;
  export const Calendar: LucideIcon;
  export const Clock: LucideIcon;
  export const Timer: LucideIcon;
  export const Activity: LucideIcon;
  export const Cpu: LucideIcon;
  export const Database: LucideIcon;
  export const Server: LucideIcon;
  export const Wifi: LucideIcon;
  export const Bluetooth: LucideIcon;
  export const Battery: LucideIcon;
  export const Power: LucideIcon;
  export const Sun: LucideIcon;
  export const Moon: LucideIcon;
  export const Cloud: LucideIcon;
  export const Wind: LucideIcon;
  export const Umbrella: LucideIcon;
  [key: string]: LucideIcon | any;
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

  return (
    <section className="flex h-[260px] shrink-0 flex-col border-t border-stroke bg-panel">
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
                <FileCode2
                  size={12}
                  className="text-ink-faint"
                  strokeWidth={1.75}
                />
                {c.filename}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(id);
                  }}
                  className="ml-1 grid size-4 place-items-center rounded text-ink-faint hover:bg-stroke hover:text-ink-muted"
                >
                  <X size={10} strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[10px] text-ink-muted">
          <span className="flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 text-accent-ink font-medium">
            <Check size={10} strokeWidth={2.5} /> synced
          </span>
          <span className="text-ink-faint">UTF-8</span>
          <span className="text-ink-faint">TSX</span>
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
