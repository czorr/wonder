import { create } from "zustand";

export type CanvasTool = "select" | "hand";

/**
 * Breakpoint that the inspector is CURRENTLY editing for.
 *
 * "base" means "no prefix" — writes land as unprefixed Tailwind utilities and
 * apply from `0px` upward. The named breakpoints mirror Tailwind's defaults
 * and prefix every class the inspector writes (e.g. picking `md` and setting
 * `flex-col` → `flex` produces `md:flex`).
 *
 * This does NOT (yet) resize the canvas viewport to the target breakpoint's
 * width — Wonder components render at their authored size and the selector is
 * a *class-targeting* affordance, not a device simulator. The Topbar selector
 * therefore answers the question "which responsive slot am I editing?", not
 * "what device am I previewing on?". Viewport simulation is a separate
 * feature and will layer on top of this once landed.
 */
export type Breakpoint = "base" | "sm" | "md" | "lg" | "xl" | "2xl";
export const BREAKPOINTS: readonly Breakpoint[] = [
  "base",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
] as const;

type CanvasState = {
  zoom: number;
  pan: { x: number; y: number };
  previewOpen: boolean;
  tool: CanvasTool;
  /**
   * Play mode: when true, the canvas still renders in place but the editor
   * chrome steps out of the way. Frames lose their drag/resize handles and
   * selection overlays, and the sandbox stops intercepting clicks/dblclicks —
   * so :hover / :focus / :active CSS states fire for real, button onClicks
   * run, and motion animations behave as they would in production. Think of
   * it as "preview the component in context" without losing zoom/pan.
   */
  playMode: boolean;
  /**
   * Which breakpoint slot the inspector writes into. `"base"` = unprefixed
   * classes. See `Breakpoint` for the full semantics.
   */
  breakpoint: Breakpoint;
  /**
   * Monotonic counter — every call to `refresh()` bumps it. Frames key
   * their iframes off this nonce, so bumping it remounts every Sandbox
   * cleanly: fresh import map, fresh esbuild blob URL, fresh DOM. Use when
   * a hot-reload gets stuck (cached blob, stale assets, half-bundled
   * source) and the user just wants to nuke and reload.
   */
  refreshNonce: number;

  setZoom: (z: number | ((prev: number) => number)) => void;
  setPan: (p: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;
  setTool: (t: CanvasTool) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  zoomFit: (contentW: number, contentH: number, viewW: number, viewH: number) => void;
  openPreview: () => void;
  closePreview: () => void;
  setPlayMode: (on: boolean) => void;
  togglePlayMode: () => void;
  setBreakpoint: (bp: Breakpoint) => void;
  /** Force-remount every Sandbox iframe on the canvas (and the library /
   *  preview thumbnails). The cheapest hammer when something looks stale. */
  refresh: () => void;
};

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;
const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4];

function snapZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}

function nextStep(current: number, dir: 1 | -1): number {
  if (dir === 1) {
    return ZOOM_STEPS.find((s) => s > current + 0.01) ?? ZOOM_MAX;
  } else {
    return [...ZOOM_STEPS].reverse().find((s) => s < current - 0.01) ?? ZOOM_MIN;
  }
}

export const useCanvas = create<CanvasState>((set) => ({
  zoom: 0.9,
  pan: { x: 60, y: 60 },
  previewOpen: false,
  tool: "select",
  playMode: false,
  // Default to the "base" slot — edits land as unprefixed classes, which is
  // the 99% case for new components. Flipping to `md`/`lg`/etc. is an
  // explicit opt-in via the Topbar.
  breakpoint: "base",
  refreshNonce: 0,

  setTool(t) {
    set({ tool: t });
  },

  setPlayMode(on) {
    set({ playMode: on });
  },
  togglePlayMode() {
    set((s) => ({ playMode: !s.playMode }));
  },
  setBreakpoint(bp) {
    set({ breakpoint: bp });
  },

  setZoom(z) {
    set((s) => ({
      zoom: snapZoom(typeof z === "function" ? z(s.zoom) : z),
    }));
  },
  setPan(p) {
    set((s) => ({ pan: typeof p === "function" ? p(s.pan) : p }));
  },
  zoomIn() {
    set((s) => ({ zoom: nextStep(s.zoom, 1) }));
  },
  zoomOut() {
    set((s) => ({ zoom: nextStep(s.zoom, -1) }));
  },
  zoomReset() {
    set({ zoom: 1 });
  },
  zoomFit(contentW, contentH, viewW, viewH) {
    const z = snapZoom(Math.min(viewW / (contentW + 120), viewH / (contentH + 120)));
    const px = (viewW - contentW * z) / 2;
    const py = (viewH - contentH * z) / 2;
    set({ zoom: z, pan: { x: px, y: py } });
  },
  openPreview() {
    set({ previewOpen: true });
  },
  closePreview() {
    set({ previewOpen: false });
  },
  refresh() {
    set((s) => ({ refreshNonce: s.refreshNonce + 1 }));
  },
}));
