import { X, FileCode2, Check } from "lucide-react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useRef } from "react";
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

  const onChange = useCallback(
    (v: string | undefined) => {
      if (!active || v === undefined) return;
      setSource(active.id, v);
    },
    [active, setSource],
  );

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
      <div className="flex-1 min-h-0">
        {active ? (
          <Editor
            height="100%"
            path={active.filename}
            defaultLanguage="typescript"
            language="typescript"
            value={active.source}
            onChange={onChange}
            onMount={onMount}
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
