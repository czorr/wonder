import {
  Search,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FolderClosed,
  Plus,
  Square,
  RectangleHorizontal,
  TextCursorInput,
  Type,
  Image as ImageIcon,
  Sparkles,
  Rows3,
  LayoutGrid,
  LayoutTemplate,
  Files,
  Library as LibraryIcon,
  Boxes,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useProject, type WonderComponent } from "@/store/project";

export function LeftSidebar() {
  const order = useProject((s) => s.order);
  const components = useProject((s) => s.components);
  const selectedId = useProject((s) => s.selectedComponentId);
  const selectComponent = useProject((s) => s.selectComponent);

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
          <button className="grid size-5 place-items-center rounded text-ink-faint hover:bg-panel-soft hover:text-ink-muted">
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
          <PrimitiveCard icon={Square} label="div" />
          <PrimitiveCard icon={RectangleHorizontal} label="Button" />
          <PrimitiveCard icon={TextCursorInput} label="Input" />
          <PrimitiveCard icon={Type} label="Text" />
          <PrimitiveCard icon={ImageIcon} label="Image" />
          <PrimitiveCard icon={Sparkles} label="Icon" />
          <PrimitiveCard icon={Rows3} label="Flex" />
          <PrimitiveCard icon={LayoutGrid} label="Grid" />
          <PrimitiveCard icon={LayoutTemplate} label="Card" />
        </div>
      </div>
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
}: {
  label: string;
  active?: boolean;
  dirty?: boolean;
  config?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
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
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-md border border-stroke bg-panel hover:border-stroke-strong hover:bg-panel-soft">
      <Icon size={16} strokeWidth={1.5} className="text-ink-soft" />
      <span className="text-[10px] text-ink-muted">{label}</span>
    </button>
  );
}
