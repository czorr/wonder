import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  isSandboxMessage,
  type SandboxIncoming,
  type SandboxOutgoing,
} from "@/sandbox/messaging";

export type SandboxHandle = {
  render: (code: string, props?: Record<string, unknown>) => void;
  setProps: (props: Record<string, unknown>) => void;
  setSelection: (path: string | null) => void;
  setViewport: (width: number | null) => void;
};

type SandboxProps = {
  onReady?: () => void;
  onRendered?: () => void;
  onError?: (message: string) => void;
  onSelect?: (
    evt: Extract<SandboxIncoming, { type: "sandbox:select" }>,
  ) => void;
  onHover?: (evt: Extract<SandboxIncoming, { type: "sandbox:hover" }>) => void;
  onRect?: (evt: Extract<SandboxIncoming, { type: "sandbox:rect" }>) => void;
  onTextEdit?: (
    evt: Extract<SandboxIncoming, { type: "sandbox:textEdit" }>,
  ) => void;
  onTextCommit?: (
    evt: Extract<SandboxIncoming, { type: "sandbox:textCommit" }>,
  ) => void;
  onSize?: (evt: Extract<SandboxIncoming, { type: "sandbox:size" }>) => void;
  className?: string;
  style?: React.CSSProperties;
};

export const Sandbox = forwardRef<SandboxHandle, SandboxProps>(function Sandbox(
  { onReady, onRendered, onError, onSelect, onHover, onRect, onTextEdit, onTextCommit, onSize, className, style },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const pendingRef = useRef<SandboxOutgoing | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (!isSandboxMessage(e.data)) return;
      const data = e.data;
      switch (data.type) {
        case "sandbox:ready":
          setReady(true);
          onReady?.();
          if (pendingRef.current) {
            iframeRef.current?.contentWindow?.postMessage(
              pendingRef.current,
              "*",
            );
            pendingRef.current = null;
          }
          break;
        case "sandbox:rendered":
          onRendered?.();
          break;
        case "sandbox:error":
          onError?.(data.message);
          break;
        case "sandbox:select":
          onSelect?.(data);
          break;
        case "sandbox:hover":
          onHover?.(data);
          break;
        case "sandbox:rect":
          onRect?.(data);
          break;
        case "sandbox:textEdit":
          onTextEdit?.(data);
          break;
        case "sandbox:textCommit":
          onTextCommit?.(data);
          break;
        case "sandbox:size":
          onSize?.(data);
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onReady, onRendered, onError, onSelect, onHover, onRect, onTextEdit, onTextCommit, onSize]);

  useImperativeHandle(
    ref,
    () => ({
      render(code, props) {
        const msg: SandboxOutgoing = { type: "sandbox:render", code, props };
        if (ready && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(msg, "*");
        } else {
          pendingRef.current = msg;
        }
      },
      setProps(props) {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "sandbox:setProps", props } satisfies SandboxOutgoing,
          "*",
        );
      },
      setSelection(path) {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "sandbox:setSelection", path } satisfies SandboxOutgoing,
          "*",
        );
      },
      setViewport(width) {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "sandbox:setViewport", width } satisfies SandboxOutgoing,
          "*",
        );
      },
    }),
    [ready],
  );

  return (
    <iframe
      ref={iframeRef}
      src="/sandbox-runtime.html"
      title="Wonder sandbox"
      sandbox="allow-scripts allow-same-origin"
      className={className}
      style={style}
    />
  );
});
