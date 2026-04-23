import {
  Search,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FolderClosed,
  Plus,
  Files,
  Library as LibraryIcon,
  Boxes,
  Trash2,
  Sparkles,
  FolderMinus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useProject, type WonderComponent } from "@/store/project";
import { useCanvas } from "@/store/canvas";
import { useChat } from "@/store/chat";
import { PRIMITIVES, buildComponentSource, type Primitive } from "@/primitives/snippets";
import { insertChildAtPath } from "@/ast/insert";
import { ChatPanel } from "@/app/shell/ChatPanel";
import { isPrimitiveFolder, PRIMITIVES_FOLDER } from "@/project/primitives";

export function LeftSidebar() {
  const order = useProject((s) => s.order);
  const components = useProject((s) => s.components);
  const selectedId = useProject((s) => s.selectedComponentId);
  const selectedPath = useProject((s) => s.selectedElementPath);
  const selectComponent = useProject((s) => s.selectComponent);
  const addComponent = useProject((s) => s.addComponent);
  const deleteComponent = useProject((s) => s.deleteComponent);
  const setSource = useProject((s) => s.setSource);
  const setComponentFolder = useProject((s) => s.setComponentFolder);
  const pan = useCanvas((s) => s.pan);
  const zoom = useCanvas((s) => s.zoom);

  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const folders = useMemo(() => {
    const map = new Map<string, WonderComponent[]>();
    for (const id of order) {
      const c = components[id];
      if (!c) continue;
      const bucket = map.get(c.folder) ?? [];
      bucket.push(c);
      map.set(c.folder, bucket);
    }
    // Surface primitive folders first — they're the pattern library and the
    // user should see them above ad-hoc component folders. Keeps consumer
    // folders in their original order beneath.
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ap = isPrimitiveFolder(a);
      const bp = isPrimitiveFolder(b);
      if (ap && !bp) return -1;
      if (!ap && bp) return 1;
      return 0;
    });
  }, [order, components]);

  const spawnComponent = (p: Primitive) => {
    const last = order.length ? components[order[order.length - 1]] : null;
    const base = last
      ? { x: last.x + last.width + 40, y: last.y }
      : { x: Math.round(-pan.x / zoom) + 80, y: Math.round(-pan.y / zoom) + 80 };
    addComponent({
      name: p.componentName,
      filename: `${p.componentName}.tsx`,
      folder: "components",
      source: buildComponentSource(p, p.componentName),
      x: base.x,
      y: base.y,
      width: p.size.w,
      height: p.size.h,
    });
  };

  const onPrimitiveClick = (p: Primitive) => {
    // If a child element (not root) is selected, insert as SIBLING after it.
    // This matches the Figma behavior: "new thing appears next to what I picked."
    if (selectedId && selectedPath && selectedPath !== "0") {
      const comp = components[selectedId];
      if (!comp) return;
      try {
        const parts = selectedPath.split(".").map(Number);
        const parentPath = parts.slice(0, -1).join(".");
        const siblingIdx = parts[parts.length - 1];
        const next = insertChildAtPath(
          comp.source,
          parentPath,
          p.snippet,
          siblingIdx + 1,
        );
        setSource(selectedId, next);
        return;
      } catch (e) {
        console.error(e);
      }
    }
    // Root selected → insert as last child of root.
    if (selectedId && selectedPath === "0") {
      const comp = components[selectedId];
      if (comp) {
        try {
          const next = insertChildAtPath(comp.source, "0", p.snippet);
          setSource(selectedId, next);
          return;
        } catch (e) {
          console.error(e);
        }
      }
    }
    // Nothing selected → create a new component.
    spawnComponent(p);
  };

  // Sidebar normally hosts a tab strip (Files / Library / Assets). When the
  // chat panel is toggled on (from the Topbar button or ⌘L), we swap the
  // whole content for ChatPanel and widen the sidebar for breathing room.
  // The chat trigger is intentionally NOT a 4th tab here — the user wanted
  // it out of the tab strip so the tabs don't crowd.
  const tab = useChat((s) => s.sidebarTab);
  const setTab = useChat((s) => s.setSidebarTab);
  const chatOpen = useChat((s) => s.chatOpen);
  const widthClass = chatOpen ? "w-[360px]" : "w-[232px]";

  return (
    <aside
      className={
        "flex " + widthClass + " shrink-0 flex-col border-r border-stroke bg-panel text-[12px] transition-[width] duration-150"
      }
    >
      {chatOpen ? null : (
        <div className="flex h-9 items-center gap-3 border-b border-stroke px-3 text-[11px] font-medium">
          <SideTab icon={Files} label="Files" active={tab === "files"} onClick={() => setTab("files")} />
          <SideTab icon={LibraryIcon} label="Library" active={tab === "library"} onClick={() => setTab("library")} />
          <SideTab icon={Boxes} label="Assets" active={tab === "assets"} onClick={() => setTab("assets")} />
        </div>
      )}

      {chatOpen ? <ChatPanel /> : <FilesPanel
        selectedId={selectedId}
        folders={folders}
        selectComponent={selectComponent}
        onSpawnFirstPrimitive={() => spawnComponent(PRIMITIVES[0])}
        onPrimitiveClick={onPrimitiveClick}
        onContextMenu={(e, id) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, id });
        }}
      />}

      {menu ? (() => {
        const target = components[menu.id];
        const isPrim = target ? isPrimitiveFolder(target.folder) : false;
        return (
          <div
            className="fixed z-50 min-w-[180px] rounded-md border border-stroke bg-white py-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {target ? (
              isPrim ? (
                <button
                  onClick={() => {
                    setComponentFolder(menu.id, "components");
                    setMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-ink-soft hover:bg-panel-soft"
                >
                  <FolderMinus size={12} strokeWidth={1.75} className="text-ink-faint" />
                  Remove from primitives
                </button>
              ) : (
                <button
                  onClick={() => {
                    setComponentFolder(menu.id, PRIMITIVES_FOLDER);
                    setMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-ink-soft hover:bg-panel-soft"
                >
                  <Sparkles size={12} strokeWidth={1.75} className="text-accent" />
                  Promote to primitive
                </button>
              )
            ) : null}
            <div className="my-1 h-px bg-stroke" />
            <button
              onClick={() => {
                deleteComponent(menu.id);
                setMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-red-600 hover:bg-red-50"
            >
              <Trash2 size={12} strokeWidth={1.75} />
              Delete component
            </button>
          </div>
        );
      })() : null}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Files tab content — extracted into a subcomponent so the main LeftSidebar
// render tree stays readable once we have multiple tab views.
// ---------------------------------------------------------------------------

function FilesPanel({
  selectedId,
  folders,
  selectComponent,
  onSpawnFirstPrimitive,
  onPrimitiveClick,
  onContextMenu,
}: {
  selectedId: string | null;
  folders: [string, WonderComponent[]][];
  selectComponent: (id: string) => void;
  onSpawnFirstPrimitive: () => void;
  onPrimitiveClick: (p: Primitive) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}) {
  return (
    <>
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-md border border-stroke bg-panel-soft px-2 py-1.5">
          <Search size={12} className="text-ink-faint" strokeWidth={2} />
          <input
            placeholder="Search components..."
            className="flex-1 bg-transparent text-[11px] text-ink placeholder:text-ink-faint outline-none"
          />
          <kbd className="rounded bg-white px-1 py-0.5 text-[9px] font-medium text-ink-faint border border-stroke">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-1.5 py-3">
        <div className="flex items-center justify-between pl-2 pr-1.5 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Project
          </span>
          <button
            onClick={onSpawnFirstPrimitive}
            title="New component"
            className="grid size-5 place-items-center rounded text-ink-faint hover:bg-panel-soft hover:text-ink-muted"
          >
            <Plus size={11} strokeWidth={2} />
          </button>
        </div>

        {folders.map(([folder, items]) => (
          <TreeFolder
            key={folder}
            label={folder}
            count={items.length}
            primitive={isPrimitiveFolder(folder)}
          >
            {items.map((c) => (
              <TreeFile
                key={c.id}
                label={c.filename}
                active={selectedId === c.id}
                dirty={selectedId === c.id}
                onClick={() => selectComponent(c.id)}
                onContextMenu={(e) => onContextMenu(e, c.id)}
              />
            ))}
          </TreeFolder>
        ))}
        <TreeFile label="tailwind.config.ts" config />

        <div className="mt-4 pl-2 pr-1.5 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Primitives
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1 px-1">
          {PRIMITIVES.map((p) => (
            <PrimitiveCard
              key={p.id}
              icon={p.icon}
              label={p.label}
              primitive={p}
              onClick={() => onPrimitiveClick(p)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function SideTab({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center gap-1.5 h-9 border-b-2 transition -mb-px " +
        (active
          ? "border-ink text-ink"
          : "border-transparent text-ink-muted hover:text-ink")
      }
    >
      <Icon size={12} strokeWidth={1.75} />
      {label}
    </button>
  );
}

function TreeFolder({
  label,
  count,
  primitive,
  children,
}: {
  label: string;
  count: number;
  /** True when the folder is part of the primitives pattern library. We swap
   *  the icon to Sparkles and tint the label so the user sees the convention
   *  at a glance. */
  primitive?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const Chevron = open ? ChevronDown : ChevronRight;
  const Icon = primitive ? Sparkles : FolderClosed;
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center gap-1 rounded-md px-1.5 py-1 hover:bg-panel-soft"
      >
        <Chevron size={12} strokeWidth={2} className="text-ink-faint" />
        <Icon
          size={13}
          strokeWidth={1.75}
          className={primitive ? "text-accent" : "text-ink-muted"}
        />
        <span
          className={
            "flex-1 text-left " + (primitive ? "text-accent-ink" : "text-ink-soft")
          }
        >
          {label}
        </span>
        <span className="text-[10px] text-ink-faint">{count}</span>
      </button>
      {open && children ? <div className="ml-4">{children}</div> : null}
    </div>
  );
}

function TreeFile({
  label,
  active,
  dirty,
  config,
  onClick,
  onContextMenu,
}: {
  label: string;
  active?: boolean;
  dirty?: boolean;
  config?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={
        "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 " +
        (active
          ? "bg-accent-tint text-accent-ink"
          : "text-ink-soft hover:bg-panel-soft")
      }
    >
      <FileCode2
        size={13}
        strokeWidth={1.75}
        className={active ? "text-accent" : "text-ink-faint"}
      />
      <span className="flex-1 text-left">{label}</span>
      {dirty ? <span className="size-1.5 rounded-full bg-accent" /> : null}
      {config ? (
        <span className="text-[9px] font-medium uppercase text-ink-faint">
          cfg
        </span>
      ) : null}
    </button>
  );
}

function PrimitiveCard({
  icon: Icon,
  label,
  primitive,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  primitive: Primitive;
  onClick?: () => void;
}) {
  const broadcastToSandboxes = (msg: unknown) => {
    // Wonder sandboxes live inside iframes rendered by ComponentFrame.
    // We can't read their data during dragover (only during drop), so we push
    // the primitive size eagerly so each sandbox can render a properly-sized
    // ghost preview as the user drags.
    const iframes = document.querySelectorAll<HTMLIFrameElement>("iframe");
    iframes.forEach((f) => f.contentWindow?.postMessage(msg, "*"));
  };

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/x-wonder-primitive",
      JSON.stringify({
        snippet: primitive.snippet,
        componentName: primitive.componentName,
        size: primitive.size,
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
    broadcastToSandboxes({ type: "wonder:dragStart", size: primitive.size });
  };

  const onDragEnd = () => {
    broadcastToSandboxes({ type: "wonder:dragEnd" });
  };
  return (
    <button
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-md border border-stroke bg-panel hover:border-stroke-strong hover:bg-panel-soft active:cursor-grabbing"
    >
      <Icon size={16} strokeWidth={1.5} className="text-ink-soft" />
      <span className="text-[10px] text-ink-muted">{label}</span>
    </button>
  );
}
