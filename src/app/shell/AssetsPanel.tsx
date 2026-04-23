// ---------------------------------------------------------------------------
// AssetsPanel — the "Assets" tab in the left sidebar.
//
// What it does:
//   - Lists every image the project has imported, as a 2-col preview grid.
//   - Uploads via a native Tauri file dialog (Upload button) or HTML5 drag
//     from Finder/Explorer (whole-panel drop zone).
//   - Drag-OUT flow: each tile is draggable and carries a synthetic
//     `<img>` snippet in the Wonder primitive MIME type. Drop it on the
//     canvas and the normal primitive-insert codepath takes over, so the
//     image lands inside the container you dropped on — no special-casing
//     required in ComponentFrame.
//   - Rename/Delete via a kebab menu per tile. Rename is not implemented
//     in this first cut (would need on-disk rename + path-rewrite across
//     components) so the kebab currently only exposes Delete.
//
// Why it lives here (not a store action):
//   The upload flow is a multi-step Tauri dance (open dialog → read bytes
//   → writeFile → store.addAsset) that couples to both `useAssets` and
//   the current project path. Keeping it in the panel means the panel
//   owns its error dialogs and busy state, and the store stays pure data.
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { AppIcon } from "@/app/icons";
import { useProject } from "@/store/project";
import { useAssets, type WonderAsset } from "@/store/assets";
import { writeAsset, deleteAsset } from "@/persistence/assets";

const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "avif",
  "ico",
];

export function AssetsPanel() {
  const projectPath = useProject((s) => s.projectMeta.path);
  const order = useAssets((s) => s.order);
  const assets = useAssets((s) => s.assets);
  const addAsset = useAssets((s) => s.addAsset);
  const removeAsset = useAssets((s) => s.removeAsset);

  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = order.map((id) => assets[id]).filter(Boolean);
    if (!q) return rows;
    return rows.filter((a) => a.filename.toLowerCase().includes(q));
  }, [order, assets, query]);

  /** Tauri dialog → fs.readFile → writeAsset. Shared between the Upload
   *  button and any future "import from…" menu actions. */
  const pickAndImport = async () => {
    if (!projectPath) return;
    setError(null);
    const picked = await openDialog({
      multiple: true,
      title: "Import images",
      filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
    });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    if (paths.length === 0) return;
    setBusy(true);
    try {
      for (const absPath of paths) {
        const filename = absPath.split(/[\\/]/).pop() ?? "asset";
        const bytes = await readFile(absPath);
        const asset = await writeAsset({
          projectPath,
          kind: "images",
          filename,
          bytes,
        });
        addAsset(asset);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /** Finder/Explorer drop — File blobs land in the DataTransfer. We read
   *  each as an ArrayBuffer and run it through the same writeAsset path.
   *  Non-image files are silently skipped so dropping a folder of mixed
   *  content doesn't error out. */
  const handleFileDrop = async (files: FileList) => {
    if (!projectPath) return;
    setError(null);
    const pending = Array.from(files).filter((f) =>
      IMAGE_EXTENSIONS.some((ext) =>
        f.name.toLowerCase().endsWith(`.${ext}`),
      ),
    );
    if (pending.length === 0) return;
    setBusy(true);
    try {
      for (const f of pending) {
        const buf = await f.arrayBuffer();
        const asset = await writeAsset({
          projectPath,
          kind: "images",
          filename: f.name,
          bytes: new Uint8Array(buf),
        });
        addAsset(asset);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (asset: WonderAsset) => {
    if (!projectPath) return;
    // Optimistic: remove from store first so the UI snaps; if the disk
    // delete fails we log — the file lingers but won't be re-indexed until
    // the next project open (which would re-surface it). Non-fatal.
    removeAsset(asset.id);
    try {
      await deleteAsset({
        projectPath,
        kind: asset.kind,
        filename: asset.filename,
      });
    } catch (err) {
      console.warn("[wonder] asset disk delete failed:", err);
    }
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragOver(false);
        void handleFileDrop(e.dataTransfer.files);
      }}
    >
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-md border border-stroke bg-panel-soft px-2 py-1.5 transition focus-within:border-accent/40 focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.08)]">
          <AppIcon name="Search" size={12} className="text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets…"
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
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between pl-3 pr-2 pt-3 pb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
          Images
        </span>
        <button
          onClick={pickAndImport}
          disabled={!projectPath || busy}
          className={
            "flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium transition " +
            (busy || !projectPath
              ? "cursor-not-allowed text-ink-faint"
              : "text-ink-muted hover:bg-panel-soft hover:text-ink")
          }
          title="Import from your computer"
        >
          <AppIcon name="Plus" size={11} />
          {busy ? "Importing…" : "Add"}
        </button>
      </div>

      {error ? (
        <div className="mx-3 mb-2 rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-[10.5px] text-red-700">
          {error}
        </div>
      ) : null}

      <div
        className={
          "relative min-h-0 flex-1 overflow-auto px-2 pb-3 transition " +
          (dragOver ? "bg-accent-tint/50" : "")
        }
      >
        {list.length === 0 ? (
          <EmptyDropZone onClickAdd={pickAndImport} disabled={!projectPath} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {list.map((a) => (
              <AssetTile key={a.id} asset={a} onDelete={() => onDelete(a)} />
            ))}
          </div>
        )}
        {dragOver ? (
          <div className="pointer-events-none absolute inset-2 rounded-lg border-2 border-dashed border-accent bg-white/80 flex items-center justify-center text-[11px] font-medium text-accent-ink">
            Drop images to import
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single-tile card. Click-to-insert parity with primitives would be nice
// later (would auto-insert an <img> into the selected container), but for
// now we keep the interaction explicit: drag to the canvas, or kebab →
// Copy path for manual JSX.
// ---------------------------------------------------------------------------

function AssetTile({
  asset,
  onDelete,
}: {
  asset: WonderAsset;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /** Build the snippet the Wonder sandbox's primitive-drop handler
   *  consumes. We pick conservative Tailwind classes so the image doesn't
   *  blow out its container — the user can resize/crop in the inspector.
   *
   *  The `src` uses the canonical project-relative path. The pre-bundle
   *  asset resolver (see `sandbox/assetResolver.ts`) rewrites it to a
   *  data URL before the sandbox executes, so the iframe doesn't have to
   *  know about Wonder's asset catalogue at all. */
  const snippet = useMemo(() => {
    const safeAlt = asset.filename.replace(/[.][^.]+$/, "");
    return `<img src="${asset.path}" alt="${safeAlt}" className="block max-w-full h-auto rounded-md" />`;
  }, [asset]);

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/x-wonder-primitive",
      JSON.stringify({
        snippet,
        componentName: "Image",
        // Reasonable default footprint — the ghost preview in the sandbox
        // draws using this, and the actual image will relayout once loaded.
        size: { w: 200, h: 120 },
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
    // Broadcast drag-start so the sandbox pre-computes ghost rects like it
    // does for primitives. Mirrors the dispatch in LeftSidebar.
    document.querySelectorAll<HTMLIFrameElement>("iframe").forEach((f) =>
      f.contentWindow?.postMessage(
        { type: "wonder:dragStart", size: { w: 200, h: 120 } },
        "*",
      ),
    );
  };

  const onDragEnd = () => {
    document.querySelectorAll<HTMLIFrameElement>("iframe").forEach((f) =>
      f.contentWindow?.postMessage({ type: "wonder:dragEnd" }, "*"),
    );
  };

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(asset.path);
    } catch {
      // Non-fatal — user can still read the path from the tooltip.
    }
    setMenuOpen(false);
  };

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-lg border border-stroke bg-panel transition hover:border-accent/50 hover:shadow-[0_2px_10px_-4px_rgba(0,0,0,0.08)]"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={asset.path}
    >
      <div className="relative flex h-[72px] items-center justify-center overflow-hidden bg-panel-soft/60 transition group-hover:bg-panel-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.dataUrl}
          alt={asset.filename}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      </div>
      <div className="flex items-center gap-1 border-t border-stroke px-2 py-1">
        <span className="flex-1 truncate text-[10.5px] font-medium text-ink">
          {asset.filename}
        </span>
        <div
          className="relative"
          onMouseDown={(e) => e.stopPropagation()}
          ref={menuRef}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            title="Asset options"
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
            <div
              className="absolute right-0 top-full z-30 mt-1 w-[180px] overflow-hidden rounded-md border border-stroke bg-panel py-1 shadow-lg"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <MenuRow label="Copy path" onClick={copyPath} />
              <div className="my-1 h-px bg-stroke" />
              <MenuRow
                label="Delete"
                danger
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MenuRow({
  label,
  onClick,
  danger,
}: {
  label: string;
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
      <span className="flex-1">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Empty-state — doubles as a drop zone. The outer panel also listens for
// drops, so this is purely a visual hint: the hover-shadow doesn't really
// matter for the drop, but it gives the user a clear target.
// ---------------------------------------------------------------------------

function EmptyDropZone({
  onClickAdd,
  disabled,
}: {
  onClickAdd: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClickAdd}
      disabled={disabled}
      className={
        "mt-2 flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-stroke bg-panel-soft/40 px-4 py-6 text-center text-[11px] text-ink-faint transition " +
        (disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:border-accent/50 hover:bg-panel-soft hover:text-ink-muted")
      }
    >
      <AppIcon name="Image" size={20} className="text-ink-faint" />
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-ink-muted">No images yet</span>
        <span>Drop files here or click to import.</span>
      </div>
    </button>
  );
}
