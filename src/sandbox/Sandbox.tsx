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
  /** Push fresh token utility CSS into the iframe's <style id="wonder-tokens">. */
  setTokensCss: (css: string) => void;
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
  onDragOver?: (
    evt: Extract<SandboxIncoming, { type: "sandbox:dragOver" }>,
  ) => void;
  onDragLeave?: () => void;
  onDrop?: (evt: Extract<SandboxIncoming, { type: "sandbox:drop" }>) => void;
  className?: string;
  style?: React.CSSProperties;
};

export const Sandbox = forwardRef<SandboxHandle, SandboxProps>(function Sandbox(
  { onReady, onRendered, onError, onSelect, onHover, onRect, onTextEdit, onTextCommit, onSize, onDragOver, onDragLeave, onDrop, className, style },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const pendingRef = useRef<SandboxOutgoing | null>(null);
  // Tokens CSS has its own slot — it should be applied BEFORE the first
  // render so the component doesn't flash unstyled with Tailwind-unknown
  // classes (bg-primary, etc). Single slot is fine: tokens are idempotent,
  // and only the latest payload matters at boot.
  const pendingTokensRef = useRef<string | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (!isSandboxMessage(e.data)) return;
      const data = e.data;
      switch (data.type) {
        case "sandbox:ready":
          setReady(true);
          onReady?.();
          // Flush tokens first so the initial render paints with the
          // project's design system already in place.
          if (pendingTokensRef.current != null) {
            iframeRef.current?.contentWindow?.postMessage(
              {
                type: "sandbox:setTokensCss",
                css: pendingTokensRef.current,
              } satisfies SandboxOutgoing,
              "*",
            );
            pendingTokensRef.current = null;
          }
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
        case "sandbox:dragOver":
          onDragOver?.(data);
          break;
        case "sandbox:dragLeave":
          onDragLeave?.();
          break;
        case "sandbox:drop":
          onDrop?.(data);
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onReady, onRendered, onError, onSelect, onHover, onRect, onTextEdit, onTextCommit, onSize, onDragOver, onDragLeave, onDrop]);

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
      setTokensCss(css) {
        const msg: SandboxOutgoing = { type: "sandbox:setTokensCss", css };
        if (ready && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(msg, "*");
        } else {
          pendingTokensRef.current = css;
        }
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
      scrolling="no"
      className={className}
      style={style}
    />
  );
});
