export type SandboxIncoming =
  | { type: "sandbox:ready" }
  | { type: "sandbox:rendered" }
  | { type: "sandbox:error"; message: string };

export type SandboxOutgoing =
  | { type: "sandbox:render"; code: string; props?: Record<string, unknown> }
  | { type: "sandbox:setProps"; props: Record<string, unknown> };

export function isSandboxMessage(data: unknown): data is SandboxIncoming {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    typeof (data as { type: unknown }).type === "string" &&
    (data as { type: string }).type.startsWith("sandbox:")
  );
}
