export const ALLOWED_DEPS = [
  "react",
  "react-dom",
  "lucide-react",
  "@iconify/react",
  "motion",
] as const;

export const SOURCE_OF_TRUTH = "code-string" as const;
export const HOT_RELOAD_DEBOUNCE_MS = 300;
export const SUPPORTED_BREAKPOINTS = [
  "base",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
] as const;
export const SUPPORTED_STATES = [
  "base",
  "hover",
  "focus",
  "active",
  "disabled",
] as const;
export const SNAPSHOT_TRIGGER = "on-significant-change" as const;
export const UNDO_STACK_SIZE = 50;
