// ---------------------------------------------------------------------------
// Layout store.
//
// Tracks the user's personalized chrome layout: sidebar widths + bottom code
// panel height + per-region collapsed state. Persisted to localStorage under
// `wonder-layout` so the app boots back into the last configuration on next
// launch.
//
// Three regions are user-controlled:
//   - LEFT   (Files / Library / Chat)      → `leftWidth`, `leftCollapsed`
//   - RIGHT  (Inspector / Props / Layers)  → `rightWidth`, `rightCollapsed`
//   - BOTTOM (Code editor panel)           → `bottomHeight`, `bottomCollapsed`
//
// Widths/heights clamp to [min, max] to keep panels usable. When the chat panel
// is open the left pane auto-expands to at least `CHAT_MIN` (see
// ResizableSidebar) without overwriting the user's persisted preference — so
// toggling chat off restores their chosen compact width.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const LAYOUT_BOUNDS = {
  left: { min: 200, max: 480, default: 232 },
  right: { min: 260, max: 520, default: 320 },
  bottom: { min: 120, max: 800, default: 260 },
  /** Minimum the left pane stretches to while chat is open (non-persisted
   *  "display only" floor — the stored `leftWidth` is untouched). */
  chatMin: 340,
} as const;

/**
 * What fills the middle of the shell (between the two side panels).
 *
 *   - "canvas"  → the regular editor: CanvasArea + CodePanel.
 *   - "tokens"  → TokensStudio: a full-height design-system editor that
 *                 replaces both canvas and code. Opened by clicking the
 *                 `tailwind.config.ts` entry in the file tree; closed via
 *                 the studio's own close button (which snaps back to
 *                 "canvas").
 *
 * Persisting this means the user who last left the app with the tokens
 * studio open comes back to it — matches the sidebar/width behavior.
 */
export type CenterView = "canvas" | "tokens";

type LayoutState = {
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  bottomCollapsed: boolean;
  centerView: CenterView;

  setLeftWidth: (n: number) => void;
  setRightWidth: (n: number) => void;
  setBottomHeight: (n: number) => void;
  setLeftCollapsed: (v: boolean) => void;
  setRightCollapsed: (v: boolean) => void;
  setBottomCollapsed: (v: boolean) => void;
  setCenterView: (v: CenterView) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleBottom: () => void;
  /** Restore sidebars to factory defaults (handy when the user drags a panel
   *  off-screen on a smaller display). */
  resetLayout: () => void;
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(n)));

export const useLayout = create<LayoutState>()(
  persist(
    (set) => ({
      leftWidth: LAYOUT_BOUNDS.left.default,
      rightWidth: LAYOUT_BOUNDS.right.default,
      bottomHeight: LAYOUT_BOUNDS.bottom.default,
      leftCollapsed: false,
      rightCollapsed: false,
      bottomCollapsed: false,
      centerView: "canvas",

      setLeftWidth: (n) =>
        set({ leftWidth: clamp(n, LAYOUT_BOUNDS.left.min, LAYOUT_BOUNDS.left.max) }),
      setRightWidth: (n) =>
        set({ rightWidth: clamp(n, LAYOUT_BOUNDS.right.min, LAYOUT_BOUNDS.right.max) }),
      setBottomHeight: (n) =>
        set({ bottomHeight: clamp(n, LAYOUT_BOUNDS.bottom.min, LAYOUT_BOUNDS.bottom.max) }),
      setLeftCollapsed: (v) => set({ leftCollapsed: v }),
      setRightCollapsed: (v) => set({ rightCollapsed: v }),
      setBottomCollapsed: (v) => set({ bottomCollapsed: v }),
      setCenterView: (v) => set({ centerView: v }),
      toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
      toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
      toggleBottom: () => set((s) => ({ bottomCollapsed: !s.bottomCollapsed })),
      resetLayout: () =>
        set({
          leftWidth: LAYOUT_BOUNDS.left.default,
          rightWidth: LAYOUT_BOUNDS.right.default,
          bottomHeight: LAYOUT_BOUNDS.bottom.default,
          leftCollapsed: false,
          rightCollapsed: false,
          bottomCollapsed: false,
          centerView: "canvas",
        }),
    }),
    { name: "wonder-layout", version: 3 },
  ),
);
