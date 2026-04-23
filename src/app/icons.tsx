// ---------------------------------------------------------------------------
// Icon registry — central source of truth for every chrome icon in Wonder.
//
// This file covers the APP UI only (Topbar, sidebars, inspector, chat,
// modals). The canvas sandbox keeps using `lucide-react` independently — see
// the import map in `public/sandbox-runtime.html`. User components on the
// canvas can keep importing from lucide without knowing or caring that the
// host chrome is on Iconify.
//
// Why a central map:
//   Every chrome icon is declared here once as `SemanticName → "mingcute:xxx"`.
//   To retheme (swap a whole app-wide icon, try MingCute's `-fill` vs `-line`,
//   swap MingCute for another Iconify set, etc.) you edit ONE line here and
//   every callsite updates. Callsites always use the semantic name
//   (`<AppIcon name="Search" />`) so they stay readable and tool-agnostic.
//
// Why offline-bundled:
//   Wonder is a Tauri desktop app. We preload the full MingCute icon set on
//   module load so every icon resolves synchronously — no flash of missing
//   content on cold start, no dependency on `api.iconify.design`.
//
// Adding a new icon:
//   1. Find it at https://icon-sets.iconify.design/mingcute/
//   2. Add an entry below (pick `-line` for stroke, `-fill` for solid).
//   3. Use `<AppIcon name="YourNewName" />` at the callsite.
//
// Using a name that isn't in the map (one-off exploration):
//   `<Icon name="mingcute:whatever-line" />` — the freeform escape hatch.
//   Prefer AppIcon in committed code so the map stays the source of truth.
// ---------------------------------------------------------------------------

import { Icon as IconifyIcon, addCollection } from "@iconify/react";
import mingcute from "@iconify-json/mingcute/icons.json";

// Side-effect on module load — idempotent. Iconify's internal registry
// dedupes by prefix so repeated imports across HMR are cheap.
addCollection(mingcute);

// ---------------------------------------------------------------------------
// The map.
//
// Keep these grouped by role (Actions / Navigation / Layout / …) so scanning
// is fast. When you tweak a mapping, the whole app updates.
// ---------------------------------------------------------------------------

export const ICON_MAP = {
  // — Actions —
  Plus: "mingcute:add-line",
  Minus: "mingcute:subtract-line",
  X: "mingcute:close-line",
  Check: "mingcute:check-line",
  Search: "mingcute:search-line",
  Trash: "mingcute:delete-2-line",
  Download: "mingcute:download-line",
  Save: "mingcute:save-line",
  SaveAll: "mingcute:save-2-line",
  Undo: "mingcute:back-2-line",
  Redo: "mingcute:forward-2-line",
  Refresh: "mingcute:refresh-2-line",
  Rotate: "mingcute:refresh-anticlockwise-1-line",
  Send: "mingcute:send-line",
  Settings: "mingcute:settings-3-line",
  Share: "mingcute:share-2-line",
  Wand: "mingcute:magic-2-line",

  // — Chevrons & directional arrows —
  ChevronDown: "mingcute:down-line",
  ChevronRight: "mingcute:right-line",
  ChevronLeft: "mingcute:left-line",
  ChevronUp: "mingcute:up-line",
  ArrowUp: "mingcute:arrow-up-line",
  ArrowDown: "mingcute:arrow-down-line",
  ArrowLeft: "mingcute:arrow-left-line",
  ArrowRight: "mingcute:arrow-right-line",

  // — Visibility —
  Eye: "mingcute:eye-line",
  EyeOff: "mingcute:eye-close-line",

  // — Text alignment —
  AlignLeft: "mingcute:align-left-line",
  AlignCenter: "mingcute:align-center-line",
  AlignRight: "mingcute:align-right-line",
  AlignJustify: "mingcute:align-justify-line",

  // — Flex/grid alignment & distribution (inspector) —
  // MingCute doesn't ship 1:1 with every lucide align variant, so these
  // lean on the closest semantic match. Tweak here if the visual clarity
  // in the inspector isn't right.
  AlignHorizontalStart: "mingcute:align-left-line",
  AlignHorizontalCenter: "mingcute:align-horizontal-center-line",
  AlignHorizontalEnd: "mingcute:align-right-line",
  AlignHorizontalSpaceBetween: "mingcute:distribute-spacing-horizontal-line",
  AlignHorizontalSpaceAround: "mingcute:distribute-spacing-horizontal-line",
  AlignVerticalStart: "mingcute:align-top-line",
  AlignVerticalCenter: "mingcute:align-vertical-center-line",
  AlignVerticalEnd: "mingcute:align-bottom-line",
  AlignStretch: "mingcute:align-vertical-center-line",
  StretchHorizontal: "mingcute:rows-4-line",

  // — Files & folders —
  File: "mingcute:file-line",
  FileCode: "mingcute:file-code-line",
  FileNew: "mingcute:file-new-line",
  Folder: "mingcute:folder-line",
  FolderOpen: "mingcute:folder-open-line",
  FolderMinus: "mingcute:folder-minus-line",
  Files: "mingcute:file-more-line",

  // — Layout primitives —
  Frame: "mingcute:frame-line",
  Square: "mingcute:square-line",
  Rectangle: "mingcute:rectangle-line",
  Rows: "mingcute:rows-4-line",
  Columns: "mingcute:columns-3-line",
  LayoutGrid: "mingcute:layout-grid-line",
  LayoutTemplate: "mingcute:layout-2-line",
  // Button (used by the primitive palette).
  Button: "mingcute:button-line",
  // Input field (primitive palette — `TextCursorInput` in lucide).
  Input: "mingcute:edit-2-line",
  // Image (primitive palette).
  Image: "mingcute:pic-line",

  // — Inspector & design tooling —
  Code: "mingcute:code-line",
  Layers: "mingcute:layers-line",
  Palette: "mingcute:palette-line",
  PaintBrush: "mingcute:paint-brush-line",
  Type: "mingcute:text-2-line",

  // — Navigation / cursor modes —
  Cursor: "mingcute:cursor-2-line",
  Hand: "mingcute:hand-line",
  Boxes: "mingcute:cube-3d-line",
  Library: "mingcute:book-2-line",

  // — Comms / chat —
  Chat: "mingcute:chat-2-line",
  Message: "mingcute:message-2-line",
  AtSign: "mingcute:at-line",

  // — Status / misc —
  Sparkles: "mingcute:sparkles-line",
  Sun: "mingcute:sun-line",
  GitBranch: "mingcute:git-branch-line",
  Clock: "mingcute:time-line",
  Key: "mingcute:key-2-line",
  // BadgeCheck ≈ check-inside-a-shape; MingCute's closest analog is the
  // plain check-in-circle, which reads identically in the Settings list.
  BadgeCheck: "mingcute:check-circle-line",
  Loader: "mingcute:loading-3-line",
  Drag: "mingcute:dots-line",
  CircleSlash: "mingcute:forbid-circle-line",
} as const;

export type AppIconName = keyof typeof ICON_MAP;

// ---------------------------------------------------------------------------
// Components.
//
// `<AppIcon name="Search" />` — the one every chrome callsite uses. Pulls the
// mingcute string from ICON_MAP at render. TS autocompletes `name` with the
// registry keys, so typos become compile errors instead of silent blanks.
//
// `<Icon name="mingcute:foo-line" />` — freeform escape hatch for
// exploration. Lint this out of committed code in favor of AppIcon.
// ---------------------------------------------------------------------------

type CommonIconProps = {
  /** Pixel size applied to both width and height. Defaults to 16 to match
   *  the density we used with lucide across the app shell. */
  size?: number;
  className?: string;
  /** If present, the icon becomes labeled/interactive for screen readers.
   *  Otherwise it's `aria-hidden` (decorative chrome). */
  title?: string;
  onClick?: React.MouseEventHandler<SVGElement>;
};

export function AppIcon({
  name,
  size = 16,
  className,
  title,
  onClick,
}: CommonIconProps & { name: AppIconName }) {
  return (
    <IconifyIcon
      icon={ICON_MAP[name]}
      width={size}
      height={size}
      className={className}
      {...(title ? { "aria-label": title, role: "img" } : { "aria-hidden": true })}
      onClick={onClick}
    />
  );
}

export function Icon({
  name,
  size = 16,
  className,
  title,
  onClick,
}: CommonIconProps & { name: `mingcute:${string}` }) {
  return (
    <IconifyIcon
      icon={name}
      width={size}
      height={size}
      className={className}
      {...(title ? { "aria-label": title, role: "img" } : { "aria-hidden": true })}
      onClick={onClick}
    />
  );
}
