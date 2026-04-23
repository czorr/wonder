// ---------------------------------------------------------------------------
// Theme store.
//
// Global light/dark mode for BOTH the editor chrome and the preview sandbox.
// Flipping this:
//   - Toggles `.dark` on <html> so the chrome's `@custom-variant dark` rules
//     in globals.css repaint every panel, canvas, and inspector.
//   - Pushes `sandbox:setTheme` into every preview iframe so the user's
//     components render in their dark state (via Tailwind's `darkMode: 'class'`
//     configured in the sandbox runtime).
//   - Flips the RightPanel's variant writer so every class edit goes out
//     prefixed with `dark:` — editing in dark mode authors dark overrides.
//
// Persisted under `wonder-theme` in localStorage so the app boots back into
// whatever mode the user last left it in. We intentionally do NOT follow
// `prefers-color-scheme` by default — the app is a design tool, and dark
// mode is an authoring decision, not an ambient preference.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

type ThemeState = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
};

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (t) => set({ theme: t }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
    }),
    { name: "wonder-theme", version: 1 },
  ),
);

/** Pure helper — avoids importing the store from modules that only need to
 *  KNOW the current mode for a synchronous read (e.g. bundlers, exporters). */
export function isDark(): boolean {
  return useTheme.getState().theme === "dark";
}
