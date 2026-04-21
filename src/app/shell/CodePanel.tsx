import { X, FileCode2, Check } from "lucide-react";

const LINES: Array<Array<{ t: string; c?: string }>> = [
  [
    { t: "import", c: "kw" },
    { t: " { " },
    { t: "TrendingUp" },
    { t: ", " },
    { t: "DollarSign" },
    { t: " } " },
    { t: "from", c: "kw" },
    { t: " " },
    { t: "\"lucide-react\"", c: "str" },
    { t: ";" },
  ],
  [
    { t: "type", c: "kw" },
    { t: " " },
    { t: "StatTileProps", c: "type" },
    { t: " = {" },
  ],
  [
    { t: "  label" },
    { t: ": " },
    { t: "string", c: "type" },
    { t: ";" },
  ],
  [
    { t: "  value" },
    { t: ": " },
    { t: "string", c: "type" },
    { t: ";" },
  ],
  [
    { t: "  delta" },
    { t: ": " },
    { t: "number", c: "type" },
    { t: ";" },
  ],
  [
    { t: "  caption" },
    { t: "?: " },
    { t: "string", c: "type" },
    { t: ";" },
  ],
  [{ t: "};" }],
  [
    { t: "export", c: "kw" },
    { t: " " },
    { t: "function", c: "kw" },
    { t: " " },
    { t: "StatTile", c: "fn" },
    { t: "({ label, value, delta, caption }: " },
    { t: "StatTileProps", c: "type" },
    { t: ") {" },
  ],
  [
    { t: "  " },
    { t: "return", c: "kw" },
    { t: " (" },
  ],
  [
    { t: "    <" },
    { t: "div", c: "tag" },
    { t: " " },
    { t: "className", c: "attr" },
    { t: "=" },
    { t: "\"flex flex-col gap-3 ", c: "str" },
    { t: "p-5", c: "hl" },
    { t: " bg-white border border-gray-200 rounded-xl\"", c: "str" },
    { t: ">" },
  ],
  [
    { t: "      <" },
    { t: "div", c: "tag" },
    { t: " " },
    { t: "className", c: "attr" },
    { t: "=" },
    { t: "\"flex items-center justify-between\"", c: "str" },
    { t: ">" },
  ],
  [
    { t: "        <" },
    { t: "span", c: "tag" },
    { t: " " },
    { t: "className", c: "attr" },
    { t: "=" },
    { t: "\"text-sm font-medium text-gray-600\"", c: "str" },
    { t: ">{label}</" },
    { t: "span", c: "tag" },
    { t: ">" },
  ],
];

export function CodePanel() {
  return (
    <section className="flex h-[220px] shrink-0 flex-col border-t border-stroke bg-panel">
      <div className="flex items-center justify-between border-b border-stroke pr-2">
        <div className="flex items-center">
          <FileTab label="StatTile.tsx" active dirty />
          <FileTab label="tailwind.config.ts" />
        </div>
        <div className="flex items-center gap-3 text-[10px] text-ink-muted">
          <span className="flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 text-accent-ink font-medium">
            <Check size={10} strokeWidth={2.5} /> synced
          </span>
          <span className="font-mono">ln 14</span>
          <span className="font-mono">col 32</span>
          <span className="text-ink-faint">UTF-8</span>
          <span className="text-ink-faint">TSX</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto font-mono text-[12px] leading-[1.55]">
        {LINES.map((line, i) => (
          <div
            key={i}
            className="flex items-start whitespace-pre px-0"
            style={{
              background: i === 11 ? "rgba(16,185,129,0.06)" : undefined,
            }}
          >
            <span className="sticky left-0 w-10 shrink-0 select-none bg-panel px-3 text-right text-[11px] text-ink-faint">
              {i + 1}
            </span>
            <span className="pl-2 pr-4 pt-0.5">
              {line.map((tok, j) => (
                <span key={j} className={tokenClass(tok.c)}>
                  {tok.t}
                </span>
              ))}
              {i === 11 ? (
                <span className="ml-0.5 inline-block h-[14px] w-[1.5px] translate-y-0.5 bg-ink" />
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function tokenClass(c?: string): string {
  switch (c) {
    case "kw":
      return "text-pink-600";
    case "str":
      return "text-emerald-700";
    case "type":
      return "text-sky-600";
    case "fn":
      return "text-blue-600";
    case "tag":
      return "text-violet-600";
    case "attr":
      return "text-amber-700";
    case "hl":
      return "rounded bg-accent-tint px-0.5 text-accent-ink font-medium";
    default:
      return "text-ink";
  }
}

function FileTab({
  label,
  active,
  dirty,
}: {
  label: string;
  active?: boolean;
  dirty?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center gap-1.5 border-r border-stroke pl-3 pr-2 py-2 text-[11px] " +
        (active
          ? "bg-panel text-ink border-b-2 border-b-accent -mb-px"
          : "bg-panel-soft text-ink-muted")
      }
    >
      {dirty ? <span className="size-1.5 rounded-full bg-accent" /> : null}
      <FileCode2 size={12} className="text-ink-faint" strokeWidth={1.75} />
      {label}
      <button className="ml-1 grid size-4 place-items-center rounded text-ink-faint hover:bg-stroke hover:text-ink-muted">
        <X size={10} strokeWidth={2} />
      </button>
    </div>
  );
}
