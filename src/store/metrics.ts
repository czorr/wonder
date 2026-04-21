import { create } from "zustand";
import type { ComponentId } from "@/store/project";

type Size = { w: number; h: number };

type MetricsState = {
  rootSizes: Record<ComponentId, Size>;
  /** Last rect reported for (componentId, path) */
  selectedRects: Record<ComponentId, { path: string; w: number; h: number }>;

  setRootSize: (id: ComponentId, size: Size) => void;
  setSelectedRect: (id: ComponentId, path: string, w: number, h: number) => void;
  clearSelectedRect: (id: ComponentId) => void;
};

export const useMetrics = create<MetricsState>((set) => ({
  rootSizes: {},
  selectedRects: {},
  setRootSize(id, size) {
    set((s) => {
      const prev = s.rootSizes[id];
      if (prev && prev.w === size.w && prev.h === size.h) return s;
      return { rootSizes: { ...s.rootSizes, [id]: size } };
    });
  },
  setSelectedRect(id, path, w, h) {
    set((s) => ({ selectedRects: { ...s.selectedRects, [id]: { path, w, h } } }));
  },
  clearSelectedRect(id) {
    set((s) => {
      if (!(id in s.selectedRects)) return s;
      const { [id]: _removed, ...rest } = s.selectedRects;
      return { selectedRects: rest };
    });
  },
}));
