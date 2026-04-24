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

/**
 * Snapshot of the three collapse flags taken at the moment the user entered
 * the tokens studio. Used to restore the chrome to its prior layout when
 * they leave — tokens mode auto-collapses every side panel so the studio
 * gets full-width breathing room, and we owe the user a faithful return trip.
 *
 * Persisted (via `partialize`) because `centerView` is persisted too — if a
 * user reloads while inside the studio, we still need the pre-studio
 * layout to restore on exit. `null` means "not currently inside a
 * tokens session".
 */
type PreTokensLayout = {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  bottomCollapsed: boolean;
};

type LayoutState = {
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  bottomCollapsed: boolean;
  centerView: CenterView;
  /**
   * See {@link PreTokensLayout}. Non-null iff `centerView === "tokens"`
   * and the user got there via the transition helper (which every UI path
   * uses — direct mutation via `setLeftCollapsed` etc. while in tokens mode
   * is supported, and simply updates the snapshot so the restore is
   * consistent… TODO if we ever need that). Today the snapshot is
   * write-once-per-session: capture on entry, restore + clear on exit.
   */
  preTokensLayout: PreTokensLayout | null;
  /** Single source of truth for the "Extract design system" modal. Opened
   *  from the DesignSystemPanel button, the TokensStudio header button, and
   *  the native Assistant menu. Kept here (not local state) so the menu
   *  command can open it regardless of which surface is currently visible. */
  extractDesignSystemOpen: boolean;

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
  openExtractDesignSystem: () => void;
  closeExtractDesignSystem: () => void;
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
      preTokensLayout: null,
      // Transient — intentionally excluded from `partialize` below so we
      // never boot into a floating modal.
      extractDesignSystemOpen: false,

      setLeftWidth: (n) =>
        set({ leftWidth: clamp(n, LAYOUT_BOUNDS.left.min, LAYOUT_BOUNDS.left.max) }),
      setRightWidth: (n) =>
        set({ rightWidth: clamp(n, LAYOUT_BOUNDS.right.min, LAYOUT_BOUNDS.right.max) }),
      setBottomHeight: (n) =>
        set({ bottomHeight: clamp(n, LAYOUT_BOUNDS.bottom.min, LAYOUT_BOUNDS.bottom.max) }),
      setLeftCollapsed: (v) => set({ leftCollapsed: v }),
      setRightCollapsed: (v) => set({ rightCollapsed: v }),
      setBottomCollapsed: (v) => set({ bottomCollapsed: v }),
      setCenterView: (v) =>
        set((s) => {
          if (v === s.centerView) return s;
          // Entering tokens: snapshot current chrome layout (unless we're
          // already inside a session — don't clobber an earlier snapshot
          // with the now-collapsed state), then collapse everything so the
          // studio gets full width.
          if (v === "tokens") {
            const snapshot =
              s.preTokensLayout ?? {
                leftCollapsed: s.leftCollapsed,
                rightCollapsed: s.rightCollapsed,
                bottomCollapsed: s.bottomCollapsed,
              };
            return {
              centerView: v,
              preTokensLayout: snapshot,
              leftCollapsed: true,
              rightCollapsed: true,
              bottomCollapsed: true,
            };
          }
          // Leaving tokens: restore whatever we snapshotted on entry. If
          // there's no snapshot (edge case: user migrated from an older
          // build, or someone flipped the state directly), leave the
          // current flags alone — better than resetting to defaults.
          const restore = s.preTokensLayout;
          if (!restore) return { centerView: v };
          return {
            centerView: v,
            preTokensLayout: null,
            leftCollapsed: restore.leftCollapsed,
            rightCollapsed: restore.rightCollapsed,
            bottomCollapsed: restore.bottomCollapsed,
          };
        }),
      toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
      toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
      toggleBottom: () => set((s) => ({ bottomCollapsed: !s.bottomCollapsed })),
      openExtractDesignSystem: () => set({ extractDesignSystemOpen: true }),
      closeExtractDesignSystem: () => set({ extractDesignSystemOpen: false }),
      resetLayout: () =>
        set({
          leftWidth: LAYOUT_BOUNDS.left.default,
          rightWidth: LAYOUT_BOUNDS.right.default,
          bottomHeight: LAYOUT_BOUNDS.bottom.default,
          leftCollapsed: false,
          rightCollapsed: false,
          bottomCollapsed: false,
          centerView: "canvas",
          preTokensLayout: null,
        }),
    }),
    {
      name: "wonder-layout",
      version: 4,
      // Keep transient UI flags (modal open, etc.) out of persistence so a
      // hard reload never resurrects a stale overlay. `preTokensLayout` IS
      // persisted — see its docstring for why (users who reload mid-session
      // still need to exit the studio back into their pre-studio layout).
      partialize: (s) => ({
        leftWidth: s.leftWidth,
        rightWidth: s.rightWidth,
        bottomHeight: s.bottomHeight,
        leftCollapsed: s.leftCollapsed,
        rightCollapsed: s.rightCollapsed,
        bottomCollapsed: s.bottomCollapsed,
        centerView: s.centerView,
        preTokensLayout: s.preTokensLayout,
      }),
    },
  ),
);
