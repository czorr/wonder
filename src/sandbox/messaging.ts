export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
};

export type SandboxIncoming =
  | { type: "sandbox:ready" }
  | { type: "sandbox:rendered" }
  | { type: "sandbox:error"; message: string }
  | {
      type: "sandbox:select";
      path: string;
      rect: Rect;
      tag: string;
      className: string;
    }
  | { type: "sandbox:hover"; path: string; rect: Rect }
  | {
      type: "sandbox:rect";
      path: string;
      rect: Rect | null;
      tag: string;
      className: string;
    }
  | {
      type: "sandbox:textEdit";
      path: string;
      rect: Rect;
      text: string;
    }
  | { type: "sandbox:textCommit"; path: string; text: string }
  | { type: "sandbox:size"; width: number; height: number }
  | {
      type: "sandbox:dragOver";
      path: string | null;
      rect: Rect | null;
      /** Insertion index among the container's JSXElement children (undefined if dropping INTO an empty container). */
      index?: number;
      /** Thin rect where the insertion line should be drawn, relative to the iframe viewport. */
      markerRect?: Rect | null;
      /** Approximate rect where the dropped primitive will end up (ghost preview). */
      ghostRect?: Rect | null;
      /** "inside" = drop as first child of empty parent; "before"/"after" = between siblings. */
      mode?: "inside" | "before" | "after";
    }
  | { type: "sandbox:dragLeave" }
  | {
      type: "sandbox:drop";
      path: string | null;
      snippet: string;
      name?: string;
      index?: number;
    }
  | { type: "sandbox:deleteKey" };

export type SandboxOutgoing =
  | { type: "sandbox:render"; code: string; props?: Record<string, unknown> }
  | { type: "sandbox:setProps"; props: Record<string, unknown> }
  | { type: "sandbox:setSelection"; path: string | null }
  | { type: "sandbox:setViewport"; width: number | null }
  /**
   * Replace the <style id="wonder-tokens"> rule set inside the iframe. Sent
   * when project tokens change so `bg-primary`, `text-surface-ink`, etc.
   * pick up the user's current values — Tailwind Play CDN inside the iframe
   * has no idea those utilities exist otherwise.
   */
  | { type: "sandbox:setTokensCss"; css: string }
  /**
   * Toggle "play" mode inside the iframe. When `interactive` is true, the
   * runtime stops intercepting clicks and dblclicks so the component's own
   * event handlers run and text-edit-on-dblclick is off. Selection / hover
   * overlays still get their rect updates (the parent chrome hides them
   * anyway) but the canvas stops behaving like an editor.
   */
  | { type: "sandbox:setInteractive"; interactive: boolean }
  /**
   * Flip the dark-mode class on the iframe's <html>. The Play CDN inside the
   * runtime is configured with `darkMode: "class"` so this switches every
   * `dark:bg-*`, `dark:text-*` rule in the user's component at once —
   * matching how the chrome's own `.dark` class repaints the editor UI.
   */
  | { type: "sandbox:setTheme"; dark: boolean };

export function isSandboxMessage(data: unknown): data is SandboxIncoming {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    typeof (data as { type: unknown }).type === "string" &&
    (data as { type: string }).type.startsWith("sandbox:")
  );
}
