import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { isSandboxMessage, type SandboxOutgoing } from "@/sandbox/messaging";

export type SandboxHandle = {
  render: (code: string, props?: Record<string, unknown>) => void;
  setProps: (props: Record<string, unknown>) => void;
};

type SandboxProps = {
  onReady?: () => void;
  onRendered?: () => void;
  onError?: (message: string) => void;
  className?: string;
};

export const Sandbox = forwardRef<SandboxHandle, SandboxProps>(function Sandbox(
  { onReady, onRendered, onError, className },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const pendingRef = useRef<SandboxOutgoing | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (!isSandboxMessage(e.data)) return;
      if (e.data.type === "sandbox:ready") {
        setReady(true);
        onReady?.();
        if (pendingRef.current) {
          iframeRef.current?.contentWindow?.postMessage(
            pendingRef.current,
            "*",
          );
          pendingRef.current = null;
        }
      } else if (e.data.type === "sandbox:rendered") {
        onRendered?.();
      } else if (e.data.type === "sandbox:error") {
        onError?.(e.data.message);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onReady, onRendered, onError]);

  useImperativeHandle(
    ref,
    () => ({
      render(code, props) {
        const msg: SandboxOutgoing = {
          type: "sandbox:render",
          code,
          props,
        };
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
    />
  );
});
