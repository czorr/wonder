import React, { useEffect, useRef, useState } from "react";
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

export function ComponentFrame({ component, selected, zoom }: Props) {
  const sandboxRef = useRef<SandboxHandle>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<SelectionInfo | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const editingPath = useRef<string | null>(null);
  const selectComponent = useProject((s) => s.selectComponent);
  const selectElement = useProject((s) => s.selectElement);
  const selectedElementPath = useProject((s) => s.selectedElementPath);
  const moveFrame = useProject((s) => s.moveFrame);
  const resizeFrame = useProject((s) => s.resizeFrame);
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

  const commitText = (path: string, next: string) => {
    try {
      const updated = setTextAtPath(component.source, path, next);
      setSource(component.id, updated);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div
      className="absolute"
      style={{
        left: component.x,
        top: component.y,
        width: size?.w ?? component.width,
        height: size?.h ?? component.height,
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
          {Math.round(size?.w ?? component.width)} ×{" "}
          {Math.round(size?.h ?? component.height)}
        </span>
      </div>
      <div className="relative h-full w-full overflow-hidden">
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
            editingPath.current = evt.path;
          }}
          onTextCommit={(evt) => {
            commitText(evt.path, evt.text);
            editingPath.current = null;
          }}
          onSize={(evt) => setSize({ w: evt.width, h: evt.height })}
          className="absolute left-0 top-0 border-0"
          style={{ width: 2000, height: 1200, background: "transparent" }}
        />
        {err ? (
          <pre className="absolute inset-2 overflow-auto rounded-md border border-red-300 bg-red-50 p-2 text-[10px] text-red-700">
            {err}
          </pre>
        ) : null}
        {selected && sel ? <SelectionOverlay sel={sel} /> : null}
      </div>
      {selected && (
        <ResizeHandles
          component={component}
          size={size}
          zoom={zoom}
          sandboxRef={sandboxRef}
          onResize={(x, y, w, h) => {
            setSize({ w, h });
            sandboxRef.current?.setViewport(w);
            resizeFrame(component.id, x, y, w, h);
          }}
        />
      )}
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

type ResizeHandlesProps = {
  component: WonderComponent;
  size: { w: number; h: number } | null;
  zoom: number;
  sandboxRef: React.RefObject<SandboxHandle | null>;
  onResize: (x: number, y: number, w: number, h: number) => void;
};

const CURSORS = {
  tl: "nw-resize",
  tr: "ne-resize",
  bl: "sw-resize",
  br: "se-resize",
} as const;

function ResizeHandles({ component, size, zoom, sandboxRef, onResize }: ResizeHandlesProps) {
  const w = size?.w ?? component.width;
  const h = size?.h ?? component.height;

  const onMouseDown = (e: React.MouseEvent, corner: "tl" | "tr" | "bl" | "br") => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = component.x;
    const origY = component.y;
    const origW = w;
    const origH = h;

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      let nx = origX, ny = origY, nw = origW, nh = origH;
      if (corner === "br") { nw = Math.max(80, origW + dx); nh = Math.max(40, origH + dy); }
      if (corner === "bl") { nx = origX + dx; nw = Math.max(80, origW - dx); nh = Math.max(40, origH + dy); }
      if (corner === "tr") { ny = origY + dy; nw = Math.max(80, origW + dx); nh = Math.max(40, origH - dy); }
      if (corner === "tl") { nx = origX + dx; ny = origY + dy; nw = Math.max(80, origW - dx); nh = Math.max(40, origH - dy); }
      sandboxRef.current?.setViewport(nw);
      onResize(nx, ny, nw, nh);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <>
      {(["tl", "tr", "bl", "br"] as const).map((corner) => {
        const isRight = corner.endsWith("r");
        const isBottom = corner.startsWith("b");
        return (
          <div
            key={corner}
            className="absolute z-20 size-3 rounded-sm border-2 border-accent bg-white"
            style={{
              cursor: CURSORS[corner],
              left: isRight ? w - 6 : -6,
              top: isBottom ? h - 6 : -6,
            }}
            onMouseDown={(e) => onMouseDown(e, corner)}
          />
        );
      })}
    </>
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

