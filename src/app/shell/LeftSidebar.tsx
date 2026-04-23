import { AppIcon, type AppIconName } from "@/app/icons";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useProject, type WonderComponent } from "@/store/project";
import { useCanvas } from "@/store/canvas";
import { useChat } from "@/store/chat";
import { useLayout } from "@/store/layout";
import {
  PRIMITIVES,
  buildComponentSource,
  type Primitive,
  type PrimitiveCategory,
} from "@/primitives/snippets";
import { insertChildAtPath } from "@/ast/insert";
import { ChatPanel } from "@/app/shell/ChatPanel";
import { isPrimitiveFolder, PRIMITIVES_FOLDER } from "@/project/primitives";

// ---------------------------------------------------------------------------
// Left sidebar — file tree + primitives palette.
//
// Structure at a glance:
//   Tab strip (Files / Library / Assets) + collapse chevron
//   Search input
//   PROJECT section
//     ├ New… menu (component | folder)
//     ├ Folder rows (collapsible, inline-renameable, kebab → delete/rename)
//     └ Loose files (tailwind.config)
//   PRIMITIVES section
//     ├ Category filter (All / Basic / Control / Layout)
//     └ 2-col grid of preview cards with real micro-previews
//
// The "designer target" constraints drove a few choices:
//   • Primitive cards render a stylized mini of what the primitive is, not a
//     generic icon. A designer should glance at the palette and recognize the
//     piece before reading the label.
//   • Folders ARE user-editable. `declaredFolders` in the project store lets
//     users create empty buckets before there's any component to drop in.
//   • Inline rename uses auto-focused input + Enter/Escape — no modals.
// ---------------------------------------------------------------------------

type FolderEntry = {
  name: string;
  items: WonderComponent[];
  primitive: boolean;
};

export function LeftSidebar() {
  const order = useProject((s) => s.order);
  const components = useProject((s) => s.components);
  const declaredFolders = useProject((s) => s.declaredFolders);
  const selectedId = useProject((s) => s.selectedComponentId);
  const selectedPath = useProject((s) => s.selectedElementPath);
  const selectComponent = useProject((s) => s.selectComponent);
  const addComponent = useProject((s) => s.addComponent);
  const deleteComponent = useProject((s) => s.deleteComponent);
  const setSource = useProject((s) => s.setSource);
  const setComponentFolder = useProject((s) => s.setComponentFolder);
  const createFolder = useProject((s) => s.createFolder);
  const renameFolder = useProject((s) => s.renameFolder);
  const deleteFolder = useProject((s) => s.deleteFolder);
  const pan = useCanvas((s) => s.pan);
  const zoom = useCanvas((s) => s.zoom);

  const tab = useChat((s) => s.sidebarTab);
  const setTab = useChat((s) => s.setSidebarTab);
  const chatOpen = useChat((s) => s.chatOpen);
  const collapseLeft = useLayout((s) => s.toggleLeft);

  // Union the derived folders (from components) with the declared ones, then
  // sort primitives first so the pattern library is always top-of-list.
  const folders = useMemo<FolderEntry[]>(() => {
    const derived = new Map<string, WonderComponent[]>();
    for (const id of order) {
      const c = components[id];
      if (!c) continue;
      const bucket = derived.get(c.folder) ?? [];
      bucket.push(c);
      derived.set(c.folder, bucket);
    }
    const names = new Set<string>(derived.keys());
    for (const f of declaredFolders) names.add(f);
    const list: FolderEntry[] = Array.from(names).map((name) => ({
      name,
      items: derived.get(name) ?? [],
      primitive: isPrimitiveFolder(name),
    }));
    return list.sort((a, b) => {
      if (a.primitive && !b.primitive) return -1;
      if (!a.primitive && b.primitive) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [order, components, declaredFolders]);

  // Context menu for file rows.
  const [fileMenu, setFileMenu] = useState<{
    x: number;
    y: number;
    id: string;
  } | null>(null);
  useEffect(() => {
    if (!fileMenu) return;
    const close = () => setFileMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
    };
  }, [fileMenu]);

  // Inline-edit state for folders. `renameTarget` is the CURRENT folder name
  // being edited (or null). When set, the matching row swaps to an input.
  const [renameTarget, setRenameTarget] = useState<string | null>(null);

  // Search query — filters both files and primitives.
  const [query, setQuery] = useState("");

  const spawnComponent = (p: Primitive, folder = "components") => {
    const last = order.length ? components[order[order.length - 1]] : null;
    const base = last
      ? { x: last.x + last.width + 40, y: last.y }
      : { x: Math.round(-pan.x / zoom) + 80, y: Math.round(-pan.y / zoom) + 80 };
    addComponent({
      name: p.componentName,
      filename: `${p.componentName}.tsx`,
      folder,
      source: buildComponentSource(p, p.componentName),
      x: base.x,
      y: base.y,
      width: p.size.w,
      height: p.size.h,
    });
  };

  const onPrimitiveClick = (p: Primitive) => {
    // If a child element (not root) is selected, insert as SIBLING after it.
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
    spawnComponent(p);
  };

  const handleNewFolder = () => {
    // Pick a unique untitled name, create it, and drop straight into rename
    // mode. Matches Finder/VSCode muscle memory (new folder → immediate type).
    let base = "new-folder";
    const taken = new Set(folders.map((f) => f.name));
    let candidate = base;
    let i = 2;
    while (taken.has(candidate)) {
      candidate = `${base}-${i++}`;
    }
    const created = createFolder(candidate);
    if (created) setRenameTarget(created);
  };

  const handleNewComponent = () => {
    spawnComponent(PRIMITIVES[0]);
  };

  return (
    <aside className="flex h-full w-full min-w-0 flex-1 flex-col border-r border-stroke bg-panel text-[12px]">
      {chatOpen ? null : (
        <div className="flex h-9 items-center gap-3 border-b border-stroke px-3 text-[11px] font-medium">
          <SideTab icon="Files" label="Files" active={tab === "files"} onClick={() => setTab("files")} />
          <SideTab icon="Library" label="Library" active={tab === "library"} onClick={() => setTab("library")} />
          <SideTab icon="Boxes" label="Assets" active={tab === "assets"} onClick={() => setTab("assets")} />
          <div className="flex-1" />
          <button
            onClick={collapseLeft}
            title="Collapse panel (⌘\)"
            className="grid size-6 place-items-center rounded-md text-ink-faint hover:bg-panel-soft hover:text-ink-muted transition"
          >
            <AppIcon name="ChevronLeft" size={13} />
          </button>
        </div>
      )}

      {chatOpen ? (
        <ChatPanel />
      ) : (
        <FilesPanel
          query={query}
          setQuery={setQuery}
          selectedId={selectedId}
          folders={folders}
          selectComponent={selectComponent}
          renameTarget={renameTarget}
          setRenameTarget={setRenameTarget}
          renameFolder={renameFolder}
          deleteFolder={deleteFolder}
          onNewComponent={handleNewComponent}
          onNewFolder={handleNewFolder}
          onPrimitiveClick={onPrimitiveClick}
          onFileContextMenu={(e, id) => {
            e.preventDefault();
            setFileMenu({ x: e.clientX, y: e.clientY, id });
          }}
          onDropComponentToFolder={(componentId, folder) => {
            setComponentFolder(componentId, folder);
          }}
        />
      )}

      {fileMenu
        ? (() => {
            const target = components[fileMenu.id];
            const isPrim = target ? isPrimitiveFolder(target.folder) : false;
            return (
              <FileContextMenu
                x={fileMenu.x}
                y={fileMenu.y}
                onPromote={
                  target && !isPrim
                    ? () => {
                        setComponentFolder(fileMenu.id, PRIMITIVES_FOLDER);
                        setFileMenu(null);
                      }
                    : undefined
                }
                onDemote={
                  target && isPrim
                    ? () => {
                        setComponentFolder(fileMenu.id, "components");
                        setFileMenu(null);
                      }
                    : undefined
                }
                onDelete={() => {
                  deleteComponent(fileMenu.id);
                  setFileMenu(null);
                }}
              />
            );
          })()
        : null}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Files panel — the body under the tab strip.
// ---------------------------------------------------------------------------

function FilesPanel({
  query,
  setQuery,
  selectedId,
  folders,
  selectComponent,
  renameTarget,
  setRenameTarget,
  renameFolder,
  deleteFolder,
  onNewComponent,
  onNewFolder,
  onPrimitiveClick,
  onFileContextMenu,
  onDropComponentToFolder,
}: {
  query: string;
  setQuery: (v: string) => void;
  selectedId: string | null;
  folders: FolderEntry[];
  selectComponent: (id: string) => void;
  renameTarget: string | null;
  setRenameTarget: (v: string | null) => void;
  renameFolder: (oldName: string, newName: string) => void;
  deleteFolder: (name: string) => void;
  onNewComponent: () => void;
  onNewFolder: () => void;
  onPrimitiveClick: (p: Primitive) => void;
  onFileContextMenu: (e: React.MouseEvent, id: string) => void;
  onDropComponentToFolder: (id: string, folder: string) => void;
}) {
  const q = query.trim().toLowerCase();

  const filteredFolders = useMemo(() => {
    if (!q) return folders;
    return folders
      .map((f) => ({
        ...f,
        items: f.items.filter(
          (c) =>
            c.filename.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q),
        ),
      }))
      // Keep empty folders visible if their NAME matches so a user can search
      // for an empty folder they just created.
      .filter((f) => f.items.length > 0 || f.name.toLowerCase().includes(q));
  }, [folders, q]);

  return (
    <>
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-md border border-stroke bg-panel-soft px-2 py-1.5 transition focus-within:border-accent/40 focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.08)]">
          <AppIcon name="Search" size={12} className="text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files & primitives…"
            className="flex-1 bg-transparent text-[11px] text-ink placeholder:text-ink-faint outline-none"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              title="Clear"
              className="grid size-4 place-items-center rounded text-ink-faint hover:bg-stroke hover:text-ink-muted"
            >
              <AppIcon name="X" size={10} />
            </button>
          ) : (
            <kbd className="rounded bg-white px-1 py-0.5 text-[9px] font-medium text-ink-faint border border-stroke">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-1.5 py-3">
        <SectionHeader label="Project">
          <NewMenu
            onNewComponent={onNewComponent}
            onNewFolder={onNewFolder}
          />
        </SectionHeader>

        {filteredFolders.length === 0 ? (
          <EmptyHint
            icon="Folder"
            label={
              q
                ? "No files match your search."
                : "No folders yet. Hit the + above to add one."
            }
          />
        ) : (
          filteredFolders.map((f) => (
            <TreeFolder
              key={f.name}
              name={f.name}
              count={f.items.length}
              primitive={f.primitive}
              forceOpen={!!q}
              editing={renameTarget === f.name}
              onRenameStart={() => setRenameTarget(f.name)}
              onRenameCommit={(next) => {
                setRenameTarget(null);
                if (next && next !== f.name) renameFolder(f.name, next);
              }}
              onRenameCancel={() => setRenameTarget(null)}
              onDelete={() => deleteFolder(f.name)}
              onDropComponent={(id) => onDropComponentToFolder(id, f.name)}
            >
              {f.items.length === 0 ? (
                <div className="pl-6 pr-2 py-1 text-[10.5px] text-ink-faint italic">
                  Empty — drop components here.
                </div>
              ) : (
                f.items.map((c) => (
                  <TreeFile
                    key={c.id}
                    id={c.id}
                    label={c.filename}
                    active={selectedId === c.id}
                    onClick={() => selectComponent(c.id)}
                    onContextMenu={(e) => onFileContextMenu(e, c.id)}
                  />
                ))
              )}
            </TreeFolder>
          ))
        )}

        <TreeFile label="tailwind.config.ts" config />

        <div className="mt-5">
          <PrimitivesPalette query={q} onPrimitiveClick={onPrimitiveClick} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Section header (Project / Primitives)
// ---------------------------------------------------------------------------

function SectionHeader({
  label,
  children,
}: {
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between pl-2 pr-1.5 pb-1.5 pt-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </span>
      {children}
    </div>
  );
}

function EmptyHint({
  icon,
  label,
}: {
  icon: AppIconName;
  label: string;
}) {
  return (
    <div className="mx-1 flex items-center gap-2 rounded-md border border-dashed border-stroke bg-panel-soft/40 px-3 py-3 text-[11px] text-ink-faint">
      <AppIcon name={icon} size={13} className="text-ink-faint" />
      <span>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "New…" dropdown — creates a component or folder.
// ---------------------------------------------------------------------------

function NewMenu({
  onNewComponent,
  onNewFolder,
}: {
  onNewComponent: () => void;
  onNewFolder: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="New…"
        className={
          "grid size-5 place-items-center rounded transition " +
          (open
            ? "bg-panel-soft text-ink"
            : "text-ink-faint hover:bg-panel-soft hover:text-ink-muted")
        }
      >
        <AppIcon name="Plus" size={11} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-[180px] overflow-hidden rounded-md border border-stroke bg-white py-1 shadow-lg">
          <MenuRow
            icon="FileNew"
            label="New component"
            shortcut="⌥N"
            onClick={() => {
              setOpen(false);
              onNewComponent();
            }}
          />
          <MenuRow
            icon="FolderOpen"
            label="New folder"
            onClick={() => {
              setOpen(false);
              onNewFolder();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function MenuRow({
  icon,
  label,
  shortcut,
  onClick,
  danger,
}: {
  icon: AppIconName;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition " +
        (danger
          ? "text-red-600 hover:bg-red-50"
          : "text-ink-soft hover:bg-panel-soft")
      }
    >
      <AppIcon
        name={icon}
        size={12}
        className={danger ? "text-red-500" : "text-ink-faint"}
      />
      <span className="flex-1">{label}</span>
      {shortcut ? (
        <span className="text-[10px] text-ink-faint">{shortcut}</span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Side tabs
// ---------------------------------------------------------------------------

function SideTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: AppIconName;
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
      <AppIcon name={icon} size={12} />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Folder row — collapsible, inline-renameable, drop target for components.
// ---------------------------------------------------------------------------

function TreeFolder({
  name,
  count,
  primitive,
  forceOpen,
  editing,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  onDelete,
  onDropComponent,
  children,
}: {
  name: string;
  count: number;
  primitive?: boolean;
  /** Forced-open (used while a filter is active — always show matches). */
  forceOpen?: boolean;
  editing: boolean;
  onRenameStart: () => void;
  onRenameCommit: (next: string) => void;
  onRenameCancel: () => void;
  onDelete: () => void;
  onDropComponent: (id: string) => void;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const isOpen = open || !!forceOpen;

  const chevron: AppIconName = isOpen ? "ChevronDown" : "ChevronRight";
  const folderIcon: AppIconName = primitive
    ? "Sparkles"
    : isOpen
      ? "FolderOpen"
      : "Folder";

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const id = e.dataTransfer.getData("application/x-wonder-component");
    if (id) onDropComponent(id);
  };

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-wonder-component")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={
        "rounded-md transition " +
        (dragOver ? "bg-accent-tint ring-1 ring-accent/40" : "")
      }
    >
      <div
        className={
          "group flex w-full items-center gap-1 rounded-md px-1.5 py-1 " +
          (editing ? "bg-panel-soft" : "hover:bg-panel-soft")
        }
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="grid size-4 shrink-0 place-items-center rounded text-ink-faint"
          title={isOpen ? "Collapse" : "Expand"}
        >
          <AppIcon name={chevron} size={11} />
        </button>
        <AppIcon
          name={folderIcon}
          size={13}
          className={primitive ? "text-accent" : "text-ink-muted"}
        />
        {editing ? (
          <FolderNameInput
            initial={name}
            onCommit={onRenameCommit}
            onCancel={onRenameCancel}
          />
        ) : (
          <button
            onDoubleClick={onRenameStart}
            onClick={() => setOpen((o) => !o)}
            className={
              "flex-1 truncate text-left " +
              (primitive ? "text-accent-ink" : "text-ink-soft")
            }
          >
            {name || "Untitled"}
          </button>
        )}
        {!editing ? (
          <>
            <span className="text-[10px] tabular-nums text-ink-faint">
              {count}
            </span>
            <div
              className="relative"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setMenuOpen((o) => !o)}
                title="Folder options"
                className={
                  "grid size-5 place-items-center rounded text-ink-faint transition " +
                  (menuOpen
                    ? "bg-stroke text-ink-muted"
                    : "opacity-0 hover:bg-stroke hover:text-ink-muted group-hover:opacity-100")
                }
              >
                <AppIcon name="Drag" size={11} />
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-full z-30 mt-1 w-[180px] overflow-hidden rounded-md border border-stroke bg-white py-1 shadow-lg">
                  <MenuRow
                    icon="Type"
                    label="Rename"
                    shortcut="↵"
                    onClick={() => {
                      setMenuOpen(false);
                      onRenameStart();
                    }}
                  />
                  <div className="my-1 h-px bg-stroke" />
                  <MenuRow
                    icon="Trash"
                    label="Delete folder"
                    danger
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                  />
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      {isOpen && children ? <div className="ml-4">{children}</div> : null}
    </div>
  );
}

function FolderNameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(value.trim());
        else if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onCommit(value.trim())}
      className="h-5 flex-1 rounded border border-accent/50 bg-white px-1 text-[12px] text-ink outline-none shadow-[0_0_0_3px_rgba(16,185,129,0.08)]"
    />
  );
}

// ---------------------------------------------------------------------------
// File row. Draggable so the user can move it between folders.
// ---------------------------------------------------------------------------

function TreeFile({
  id,
  label,
  active,
  config,
  onClick,
  onContextMenu,
}: {
  id?: string;
  label: string;
  active?: boolean;
  config?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const onDragStart = (e: React.DragEvent) => {
    if (!id) return;
    e.dataTransfer.setData("application/x-wonder-component", id);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <button
      draggable={!!id}
      onDragStart={onDragStart}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={
        "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 " +
        (active
          ? "bg-accent-tint text-accent-ink"
          : "text-ink-soft hover:bg-panel-soft")
      }
    >
      <AppIcon
        name="FileCode"
        size={13}
        className={active ? "text-accent" : "text-ink-faint"}
      />
      <span className="flex-1 truncate text-left">{label}</span>
      {active ? <span className="size-1.5 rounded-full bg-accent" /> : null}
      {config ? (
        <span className="text-[9px] font-medium uppercase text-ink-faint">
          cfg
        </span>
      ) : null}
    </button>
  );
}

function FileContextMenu({
  x,
  y,
  onPromote,
  onDemote,
  onDelete,
}: {
  x: number;
  y: number;
  onPromote?: () => void;
  onDemote?: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="fixed z-50 min-w-[200px] rounded-md border border-stroke bg-white py-1 shadow-lg"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {onPromote ? (
        <MenuRow icon="Sparkles" label="Promote to primitive" onClick={onPromote} />
      ) : null}
      {onDemote ? (
        <MenuRow icon="FolderMinus" label="Remove from primitives" onClick={onDemote} />
      ) : null}
      <div className="my-1 h-px bg-stroke" />
      <MenuRow icon="Trash" label="Delete component" danger onClick={onDelete} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primitives palette.
//
// Category filter chips + 2-col grid of preview cards. Each card renders a
// stylized mini-rendering of the primitive (not just a generic icon) so the
// palette reads as a visual catalogue, not a stock icon sheet.
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<"all" | PrimitiveCategory, string> = {
  all: "All",
  basic: "Basic",
  control: "Control",
  layout: "Layout",
};

function PrimitivesPalette({
  query,
  onPrimitiveClick,
}: {
  query: string;
  onPrimitiveClick: (p: Primitive) => void;
}) {
  const [cat, setCat] = useState<"all" | PrimitiveCategory>("all");

  const filtered = useMemo(() => {
    return PRIMITIVES.filter((p) => {
      const categoryOk = cat === "all" || p.category === cat;
      const queryOk = !query || p.label.toLowerCase().includes(query);
      return categoryOk && queryOk;
    });
  }, [cat, query]);

  return (
    <div>
      <SectionHeader label="Primitives" />
      <div className="mb-2 flex items-center gap-1 px-1">
        {(["all", "basic", "control", "layout"] as const).map((c) => {
          const active = cat === c;
          return (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={
                "rounded-full px-2 py-0.5 text-[10.5px] font-medium transition " +
                (active
                  ? "bg-ink text-white"
                  : "text-ink-muted hover:bg-panel-soft hover:text-ink")
              }
            >
              {CATEGORY_LABELS[c]}
            </button>
          );
        })}
      </div>
      {filtered.length === 0 ? (
        <div className="mx-1 rounded-md border border-dashed border-stroke bg-panel-soft/40 px-3 py-3 text-[11px] text-ink-faint">
          Nothing matches.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 px-1">
          {filtered.map((p) => (
            <PrimitiveCard
              key={p.id}
              primitive={p}
              onClick={() => onPrimitiveClick(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PrimitiveCard({
  primitive,
  onClick,
}: {
  primitive: Primitive;
  onClick?: () => void;
}) {
  const broadcastToSandboxes = (msg: unknown) => {
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
      title={`${primitive.label} · click to insert · drag to place`}
      className="group flex flex-col overflow-hidden rounded-lg border border-stroke bg-white transition hover:border-accent/50 hover:shadow-[0_2px_10px_-4px_rgba(0,0,0,0.08)] active:cursor-grabbing"
    >
      <div className="relative flex h-[60px] items-center justify-center overflow-hidden bg-panel-soft/60 transition group-hover:bg-panel-soft">
        <PrimitivePreview id={primitive.id} />
      </div>
      <div className="flex items-center justify-between gap-1 border-t border-stroke px-2 py-1">
        <span className="truncate text-[11px] font-medium text-ink">
          {primitive.label}
        </span>
        <AppIcon
          name={primitive.icon}
          size={11}
          className="text-ink-faint transition group-hover:text-accent"
        />
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Micro-previews: one small stylized rendering per primitive.
//
// Each preview is sized to fit the 60px-tall preview slot. They share a
// muted neutral palette (gray-200 / gray-300 / gray-400) so the palette
// reads as a coherent catalogue — actual tailwind colors on the canvas
// are up to the user's design system.
// ---------------------------------------------------------------------------

function PrimitivePreview({ id }: { id: Primitive["id"] }) {
  switch (id) {
    case "div":
      return (
        <div className="h-9 w-16 rounded-md border border-dashed border-gray-400/70 bg-white/70" />
      );
    case "button":
      return (
        <div className="flex h-6 items-center gap-1 rounded-md bg-gray-900 px-2.5">
          <span className="text-[9px] font-semibold text-white">Button</span>
        </div>
      );
    case "input":
      return (
        <div className="flex h-6 w-20 items-center rounded-md border border-gray-300 bg-white px-2">
          <span className="h-2.5 w-px animate-pulse bg-gray-400" />
          <span className="ml-1 text-[9px] text-gray-400">Type…</span>
        </div>
      );
    case "text":
      return (
        <div className="flex w-20 flex-col gap-1">
          <span className="h-1 w-full rounded-full bg-gray-400/80" />
          <span className="h-1 w-5/6 rounded-full bg-gray-400/60" />
          <span className="h-1 w-3/6 rounded-full bg-gray-400/40" />
        </div>
      );
    case "image":
      return (
        <div className="relative flex h-9 w-16 items-end justify-center overflow-hidden rounded-md bg-gradient-to-br from-gray-200 to-gray-300">
          <div className="absolute left-2 top-2 size-1.5 rounded-full bg-white/80" />
          <svg
            viewBox="0 0 64 40"
            className="h-full w-full"
            preserveAspectRatio="none"
          >
            <path
              d="M0,40 L18,22 L30,30 L44,14 L64,40 Z"
              fill="rgba(255,255,255,0.65)"
            />
          </svg>
        </div>
      );
    case "icon":
      return (
        <div className="grid size-8 place-items-center rounded-md bg-emerald-100 text-emerald-700">
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
            <path d="M12 2l2.39 4.84L20 8l-4 3.9.94 5.5L12 15l-4.94 2.4L8 11.9 4 8l5.61-1.16L12 2z" />
          </svg>
        </div>
      );
    case "flex":
      return (
        <div className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white p-1.5">
          <span className="size-4 rounded-full bg-gray-300" />
          <div className="flex flex-col gap-0.5">
            <span className="h-1 w-8 rounded-full bg-gray-400/80" />
            <span className="h-1 w-5 rounded-full bg-gray-300" />
          </div>
        </div>
      );
    case "grid":
      return (
        <div className="grid grid-cols-3 gap-0.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="size-2.5 rounded-[2px] bg-gray-300" />
          ))}
        </div>
      );
    case "card":
      return (
        <div className="flex w-20 flex-col gap-1 rounded-md border border-gray-200 bg-white p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between">
            <span className="h-1 w-6 rounded-full bg-gray-400/80" />
            <span className="h-1.5 w-3 rounded-full bg-emerald-200" />
          </div>
          <span className="h-1.5 w-10 rounded-full bg-gray-500" />
          <span className="h-1 w-8 rounded-full bg-gray-300" />
        </div>
      );
    default:
      return null;
  }
}
