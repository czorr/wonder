import { useEffect, useRef, useState } from "react";
import { Sandbox, type SandboxHandle } from "@/sandbox/Sandbox";
import { bundle } from "@/sandbox/bundler";
import { HOT_RELOAD_DEBOUNCE_MS } from "@/constants";
import { useProject, type WonderComponent } from "@/store/project";
import type { Rect } from "@/sandbox/messaging";
import { setTextAtPath } from "@/ast/text";

type Props = {
  component: WonderComponent;
  selected: boolean;
  zoom: number;
};

type SelectionInfo = {
  path: string;
  rect: Rect;
  tag: string;
  className: string;
};

type TextEdit = {
  path: string;
  rect: Rect;
  text: string;
};

export function ComponentFrame({ component, selected, zoom }: Props) {
  const sandboxRef = useRef<SandboxHandle>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<SelectionInfo | null>(null);
  const [edit, setEdit] = useState<TextEdit | null>(null);
  const selectComponent = useProject((s) => s.selectComponent);
  const selectElement = useProject((s) => s.selectElement);
  const selectedElementPath = useProject((s) => s.selectedElementPath);
  const moveFrame = useProject((s) => s.moveFrame);
  const setSource = useProject((s) => s.setSource);

  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(async () => {
      setErr(null);
      const res = await bundle(component.source);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      sandboxRef.current?.render(res.code);
    }, HOT_RELOAD_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [component.source, ready]);

  useEffect(() => {
    if (!ready) return;
    if (selected && selectedElementPath) {
      sandboxRef.current?.setSelection(selectedElementPath);
    } else {
      sandboxRef.current?.setSelection(null);
      setSel(null);
    }
  }, [selected, selectedElementPath, ready]);

  const onMouseDownHeader = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    selectComponent(component.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = component.x;
    const origY = component.y;
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      moveFrame(component.id, origX + dx, origY + dy);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const commitText = (next: string) => {
    if (!edit) return;
    try {
      const updated = setTextAtPath(component.source, edit.path, next);
      setSource(component.id, updated);
    } catch (e) {
      console.error(e);
    }
    setEdit(null);
  };

  return (
    <div
      className="absolute"
      style={{
        left: component.x,
        top: component.y,
        width: component.width,
        height: component.height,
      }}
      onMouseDown={() => selectComponent(component.id)}
    >
      <div
        onMouseDown={onMouseDownHeader}
        className={
          "absolute -top-5 left-0 flex items-center gap-2 whitespace-nowrap text-[10px] font-medium cursor-grab active:cursor-grabbing " +
          (selected
            ? "rounded-t bg-accent/10 px-1.5 py-0.5 text-accent-ink"
            : "text-ink-muted")
        }
      >
        <span>{component.name}</span>
        <span className={selected ? "opacity-80" : "text-ink-faint"}>
          {Math.round(component.width)} × {Math.round(component.height)}
        </span>
      </div>
      <div
        className={
          "relative h-full w-full overflow-hidden rounded-xl border bg-white " +
          (selected ? "border-stroke-strong" : "border-stroke")
        }
      >
        <Sandbox
          ref={sandboxRef}
          onReady={() => setReady(true)}
          onError={(m) => setErr(m)}
          onSelect={(evt) => {
            selectComponent(component.id);
            selectElement(evt.path);
            setSel({
              path: evt.path,
              rect: evt.rect,
              tag: evt.tag,
              className: evt.className,
            });
          }}
          onRect={(evt) => {
            if (!evt.rect) {
              setSel(null);
              return;
            }
            setSel({
              path: evt.path,
              rect: evt.rect,
              tag: evt.tag,
              className: evt.className,
            });
          }}
          onTextEdit={(evt) => {
            selectComponent(component.id);
            selectElement(evt.path);
            setEdit({ path: evt.path, rect: evt.rect, text: evt.text.trim() });
          }}
          className="h-full w-full border-0"
        />
        {err ? (
          <pre className="absolute inset-2 overflow-auto rounded-md border border-red-300 bg-red-50 p-2 text-[10px] text-red-700">
            {err}
          </pre>
        ) : null}
        {selected && sel && !edit ? <SelectionOverlay sel={sel} /> : null}
        {edit ? (
          <TextEditor
            edit={edit}
            onCommit={commitText}
            onCancel={() => setEdit(null)}
          />
        ) : null}
      </div>
    </div>
  );
}

function SelectionOverlay({ sel }: { sel: SelectionInfo }) {
  const { rect, tag, className } = sel;
  const classList = className.split(/\s+/).filter(Boolean);
  const first = classList[0];
  const rest = classList.slice(1, 4).join(" ");
  const label = [
    `${tag}${first ? `.${first}` : ""}`,
    rest ? `— ${rest}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="absolute border border-dashed border-accent"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }}
      >
        <Corner pos="tl" />
        <Corner pos="tr" />
        <Corner pos="bl" />
        <Corner pos="br" />
        <div
          className="absolute -top-5 left-0 flex h-4 items-center whitespace-nowrap rounded-[3px] bg-accent px-1.5 text-[10px] font-medium text-white"
        >
          {label}
        </div>
      </div>
    </div>
  );
}

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const map: Record<typeof pos, string> = {
    tl: "-left-[3px] -top-[3px]",
    tr: "-right-[3px] -top-[3px]",
    bl: "-left-[3px] -bottom-[3px]",
    br: "-right-[3px] -bottom-[3px]",
  };
  return (
    <span
      className={
        "absolute size-[6px] rounded-[1px] border border-accent bg-white " +
        map[pos]
      }
    />
  );
}

function TextEditor({
  edit,
  onCommit,
  onCancel,
}: {
  edit: TextEdit;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(edit.text);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div className="absolute inset-0 z-10">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onCommit(value);
          }
        }}
        className="absolute resize-none rounded-[3px] border border-accent bg-white px-1 outline-none ring-2 ring-accent/30"
        style={{
          left: edit.rect.left,
          top: edit.rect.top,
          width: Math.max(edit.rect.width, 80),
          height: Math.max(edit.rect.height, 20),
          font: "inherit",
        }}
      />
    </div>
  );
}
