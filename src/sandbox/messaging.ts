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
  | { type: "sandbox:size"; width: number; height: number };

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
