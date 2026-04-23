import React, { useEffect, useMemo, useRef, useState } from "react";
import { Sandbox, type SandboxHandle } from "@/sandbox/Sandbox";
import { bundle } from "@/sandbox/bundler";
import { resolveAssets } from "@/sandbox/assetResolver";
import { useAssets } from "@/store/assets";
import { HOT_RELOAD_DEBOUNCE_MS } from "@/constants";
import { useProject, type WonderComponent } from "@/store/project";
import { tokensToSandboxCss } from "@/project/tokens";
import { useMetrics } from "@/store/metrics";
import { useChat } from "@/store/chat";
import { useCanvas } from "@/store/canvas";
import type { Rect } from "@/sandbox/messaging";
import { setTextAtPath } from "@/ast/text";
import { getClassNameAtPath, setClassAtPath } from "@/ast/tailwind";
import { insertChildAtPath } from "@/ast/insert";
import { PixelGridLoader } from "@/canvas/PixelGridLoader";

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
  const [dropTarget, setDropTarget] = useState<{
    path: string;
    rect: Rect;
    marker: Rect | null;
    ghost: Rect | null;
    mode: "inside" | "before" | "after" | undefined;
  } | null>(null);
  const editingPath = useRef<string | null>(null);
  const draggingRef = useRef(false);
  const selectComponent = useProject((s) => s.selectComponent);
  const selectElement = useProject((s) => s.selectElement);
  const selectedElementPath = useProject((s) => s.selectedElementPath);
  const moveFrame = useProject((s) => s.moveFrame);
  const resizeFrame = useProject((s) => s.resizeFrame);
  const setSource = useProject((s) => s.setSource);
  const propValues = useProject((s) => s.propValues[component.id]);
  const setRootSize = useMetrics((s) => s.setRootSize);
  const setSelectedRect = useMetrics((s) => s.setSelectedRect);
  // True while the agent is running a mutating tool call against this
  // component — overlay a pixel-grid loader and disable user input so the
  // user doesn't fight the AI mid-edit.
  const isBusy = useChat((s) => !!s.busyComponents[component.id]);
  // Play mode disables editor affordances (drag/resize/select/text-edit) and
  // hands event handling to the component itself so :hover/:focus/:active
  // CSS states and onClick handlers behave as they would in production.
  const playMode = useCanvas((s) => s.playMode);

  // Token-driven utility CSS that the sandbox iframe needs — Tailwind v3
  // Play CDN inside the iframe has no idea `bg-primary`, `bg-surface`,
  // `text-neutral-ink`, `rounded-md` exist. We generate the rules here,
  // and push them into the iframe via the sandbox handle. Useful to keep
  // `useMemo` — token edits fire store updates for every keystroke during
  // a color scrub, so stable identity means we skip pushing identical CSS.
  const tokens = useProject((s) => s.tokens);
  const tokensCss = useMemo(() => tokensToSandboxCss(tokens), [tokens]);

  // Push tokens on every change AND when the iframe signals ready. Note
  // we send even before the first render — the Sandbox buffers pre-ready
  // messages, so the initial paint already has the design system applied.
  useEffect(() => {
    sandboxRef.current?.setTokensCss(tokensCss);
  }, [tokensCss, ready]);

  // Re-bundle whenever the component source OR the asset catalogue changes.
  // Watching `assetsVersion` (a derived stamp from the assets store) means
  // a just-uploaded image flows through to the live preview without the
  // user having to touch the source — the pre-bundle asset resolver re-
  // runs and inlines the new data URL.
  const assetsVersion = useAssets(
    (s) => s.order.length + "|" + s.order.join(","),
  );
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(async () => {
      setErr(null);
      const resolved = resolveAssets(component.source);
      const res = await bundle(resolved);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      sandboxRef.current?.render(res.code, propValues ?? {});
    }, HOT_RELOAD_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [component.source, ready, assetsVersion]);

  useEffect(() => {
    if (!ready) return;
    sandboxRef.current?.setProps(propValues ?? {});
  }, [propValues, ready]);

  // Push the play-mode flag to the sandbox whenever it flips — also on ready,
  // so an iframe that boots while play mode is already on starts in the right
  // state (otherwise the first render would grab clicks before the toggle
  // caught up).
  useEffect(() => {
    if (!ready) return;
    sandboxRef.current?.setInteractive(playMode);
  }, [playMode, ready]);

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
    // Don't let the user drag the frame while the agent is editing it —
    // would fight the AI's tool calls mid-stream.
    if (isBusy) return;
    if (playMode) return; // no frame moving during play
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
        width: size?.w,
        height: size?.h,
      }}
      onMouseDown={(e) => {
        // In play mode, mousedowns on the wrapper belong to the component —
        // selecting it here would also re-show editor chrome we deliberately
        // hid, and fight whatever the component is doing (click, drag, etc).
        if (playMode) return;
        if (e.button === 0) selectComponent(component.id);
      }}
    >
      {playMode ? null : (
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
          {size ? `${Math.round(size.w)} × ${Math.round(size.h)}` : ""}
        </span>
      </div>
      )}
      <div className="relative h-full w-full">
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
            setSelectedRect(component.id, evt.path, evt.rect.width, evt.rect.height);
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
            setSelectedRect(component.id, evt.path, evt.rect.width, evt.rect.height);
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
          onDragOver={(evt) => {
            if (evt.path && evt.rect) {
              setDropTarget({
                path: evt.path,
                rect: evt.rect,
                marker: evt.markerRect ?? null,
                ghost: evt.ghostRect ?? null,
                mode: evt.mode,
              });
            } else {
              setDropTarget(null);
            }
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(evt) => {
            setDropTarget(null);
            const path = evt.path ?? "0";
            try {
              const next = insertChildAtPath(
                component.source,
                path,
                evt.snippet,
                evt.index,
              );
              setSource(component.id, next);
              selectComponent(component.id);
              selectElement(path);
            } catch (e) {
              console.error(e);
            }
          }}
          onSize={(evt) => {
            setRootSize(component.id, { w: evt.width, h: evt.height });
            if (!draggingRef.current) setSize({ w: evt.width, h: evt.height });
          }}
          className="absolute left-0 top-0 border-0"
          style={{
            width: size?.w ?? 2000,
            height: size?.h ?? 1200,
            background: "transparent",
          }}
        />
        {err ? (
          <pre className="absolute inset-2 overflow-auto rounded-md border border-red-300 bg-red-50 p-2 text-[10px] text-red-700">
            {err}
          </pre>
        ) : null}
        {selected && sel && !playMode ? <SelectionOverlay sel={sel} /> : null}
        {isBusy ? <BusyOverlay /> : null}
        {dropTarget && !playMode ? (
          <>
            {/* Subtle parent outline so you know which container owns the drop. */}
            <div
              className="pointer-events-none absolute rounded-sm ring-1 ring-accent/70 bg-accent/5"
              style={{
                left: dropTarget.rect.left,
                top: dropTarget.rect.top,
                width: dropTarget.rect.width,
                height: dropTarget.rect.height,
              }}
            />
            {/* Ghost preview: rect the size of the primitive where it WILL land. */}
            {dropTarget.ghost ? (
              <div
                className="pointer-events-none absolute rounded-md border-2 border-dashed border-accent bg-accent/15"
                style={{
                  left: dropTarget.ghost.left,
                  top: dropTarget.ghost.top,
                  width: dropTarget.ghost.width,
                  height: dropTarget.ghost.height,
                }}
              />
            ) : null}
            {/* Insertion line between siblings (or inside empty container). */}
            {dropTarget.marker ? (
              <div
                className="pointer-events-none absolute rounded-[2px] bg-accent shadow-[0_0_0_1px_rgba(255,255,255,0.9)]"
                style={{
                  left: dropTarget.marker.left,
                  top: dropTarget.marker.top,
                  width: Math.max(2, dropTarget.marker.width),
                  height: Math.max(2, dropTarget.marker.height),
                }}
              />
            ) : null}
          </>
        ) : null}
      </div>
      {selected && !isBusy && !playMode && (
        <ResizeHandles
          component={component}
          size={size}
          zoom={zoom}
          sandboxRef={sandboxRef}
          onDragStart={() => { draggingRef.current = true; }}
          onResize={(x, y, w, h) => {
            setSize({ w, h });
            sandboxRef.current?.setViewport(w);
            moveFrame(component.id, x, y);
          }}
          onCommit={(w) => {
            try {
              let src = component.source;
              const classes = getClassNameAtPath(src, "0");
              const curW = classes.find((c) => /^w-/.test(c));
              const nextW = `w-[${Math.round(w)}px]`;
              if (curW !== nextW) src = setClassAtPath(src, "0", curW ?? "", nextW);
              setSource(component.id, src);
              sandboxRef.current?.setViewport(null);
              draggingRef.current = false;
              setSize(null);
            } catch (e) {
              console.error(e);
              draggingRef.current = false;
            }
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BusyOverlay
//
// Shown on top of a component while the agent is editing it. Absorbs pointer
// events (so the user can't click inside, drag, or text-edit), dims the
// sandbox slightly, and floats the pixel-grid loader in the middle.
//
// The ring is accent-tinted to visually tie it to the chat status chip
// (which uses the same green pulse).
// ---------------------------------------------------------------------------
function BusyOverlay() {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center rounded-sm bg-white/55 ring-2 ring-accent/50"
      // Explicit auto so it eats clicks even if a parent set pointer-events.
      style={{ pointerEvents: "auto", cursor: "wait" }}
      // Swallow any interactions that would otherwise fall through to the
      // iframe below (clicks, drag starts, text-edit double-clicks).
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <PixelGridLoader pixel={7} gap={2} duration={1000} />
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
  onDragStart: () => void;
  onResize: (x: number, y: number, w: number, h: number) => void;
  onCommit: (w: number, h: number) => void;
};

const CURSORS = {
  tl: "nw-resize",
  tr: "ne-resize",
  bl: "sw-resize",
  br: "se-resize",
} as const;

function ResizeHandles({ component, size, zoom, sandboxRef, onDragStart, onResize, onCommit }: ResizeHandlesProps) {
  const w = size?.w ?? component.width;
  const h = size?.h ?? component.height;

  const onMouseDown = (e: React.MouseEvent, corner: "tl" | "tr" | "bl" | "br") => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onDragStart();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = component.x;
    const origY = component.y;
    const origW = w;
    const origH = h;

    let last = { w: origW, h: origH };
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      let nx = origX, ny = origY, nw = origW, nh = origH;
      if (corner === "br") { nw = Math.max(80, origW + dx); nh = Math.max(40, origH + dy); }
      if (corner === "bl") { nx = origX + dx; nw = Math.max(80, origW - dx); nh = Math.max(40, origH + dy); }
      if (corner === "tr") { ny = origY + dy; nw = Math.max(80, origW + dx); nh = Math.max(40, origH - dy); }
      if (corner === "tl") { nx = origX + dx; ny = origY + dy; nw = Math.max(80, origW - dx); nh = Math.max(40, origH - dy); }
      last = { w: nw, h: nh };
      sandboxRef.current?.setViewport(nw);
      onResize(nx, ny, nw, nh);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      onCommit(last.w, last.h);
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

