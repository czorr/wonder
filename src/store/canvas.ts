import { create } from "zustand";

export type CanvasTool = "select" | "hand";

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

  setTool(t) {
    set({ tool: t });
  },

  setPlayMode(on) {
    set({ playMode: on });
  },
  togglePlayMode() {
    set((s) => ({ playMode: !s.playMode }));
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
}));
