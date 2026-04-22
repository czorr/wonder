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
  | { type: "sandbox:setViewport"; width: number | null };

export function isSandboxMessage(data: unknown): data is SandboxIncoming {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    typeof (data as { type: unknown }).type === "string" &&
    (data as { type: string }).type.startsWith("sandbox:")
  );
}
