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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useProject, type WonderComponent } from "@/store/project";
import { useCanvas } from "@/store/canvas";
import { PRIMITIVES, buildComponentSource, type Primitive } from "@/primitives/snippets";
import { insertChildAtPath } from "@/ast/insert";

export function LeftSidebar() {
  const order = useProject((s) => s.order);
  const components = useProject((s) => s.components);
  const selectedId = useProject((s) => s.selectedComponentId);
  const selectedPath = useProject((s) => s.selectedElementPath);
  const selectComponent = useProject((s) => s.selectComponent);
  const addComponent = useProject((s) => s.addComponent);
  const deleteComponent = useProject((s) => s.deleteComponent);
  const setSource = useProject((s) => s.setSource);
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
    return Array.from(map.entries());
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
    // If a child element (not root) is selected, insert as child.
    if (selectedId && selectedPath && selectedPath !== "0") {
      const comp = components[selectedId];
      if (!comp) return;
      try {
        const next = insertChildAtPath(comp.source, selectedPath, p.snippet);
        setSource(selectedId, next);
        return;
      } catch (e) {
        console.error(e);
      }
    }
    // Root selected → still insert as child of root (commonly what user wants).
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

  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-stroke bg-panel text-[12px]">
      <div className="flex h-9 items-center gap-3 border-b border-stroke px-3 text-[11px] font-medium">
        <SideTab icon={Files} label="Files" active />
        <SideTab icon={LibraryIcon} label="Library" />
        <SideTab icon={Boxes} label="Assets" />
      </div>

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
            onClick={() => spawnComponent(PRIMITIVES[0])}
            title="New component"
            className="grid size-5 place-items-center rounded text-ink-faint hover:bg-panel-soft hover:text-ink-muted"
          >
            <Plus size={11} strokeWidth={2} />
          </button>
        </div>

        {folders.map(([folder, items]) => (
          <TreeFolder key={folder} label={folder} count={items.length}>
            {items.map((c) => (
              <TreeFile
                key={c.id}
                label={c.filename}
                active={selectedId === c.id}
                dirty={selectedId === c.id}
                onClick={() => selectComponent(c.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, id: c.id });
                }}
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

      {menu ? (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border border-stroke bg-white py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
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
      ) : null}
    </aside>
  );
}

function SideTab({
  icon: Icon,
  label,
  active,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
}) {
  return (
    <button
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
  children,
}: {
  label: string;
  count: number;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center gap-1 rounded-md px-1.5 py-1 hover:bg-panel-soft"
      >
        <Chevron size={12} strokeWidth={2} className="text-ink-faint" />
        <FolderClosed size={13} strokeWidth={1.75} className="text-ink-muted" />
        <span className="flex-1 text-left text-ink-soft">{label}</span>
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
  };
  return (
    <button
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-md border border-stroke bg-panel hover:border-stroke-strong hover:bg-panel-soft active:cursor-grabbing"
    >
      <Icon size={16} strokeWidth={1.5} className="text-ink-soft" />
      <span className="text-[10px] text-ink-muted">{label}</span>
    </button>
  );
}
