import { TrendingUp, DollarSign, ArrowRight } from "lucide-react";

export function CanvasArea() {
  return (
    <section className="relative flex min-h-0 flex-1 overflow-hidden bg-canvas">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(24,24,27,0.12) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* Frame: Active users */}
      <MockFrame label="Active users" size="300 × 170" x={120} y={180}>
        <StatTile
          title="Active users"
          value="12,430"
          delta="2.1%"
          caption="last 7 days"
          deltaTone="rose"
          spark="down"
        />
      </MockFrame>

      {/* Frame: Monthly recurring revenue — SELECTED */}
      <MockFrame
        label="div.flex — p-5 rounded-xl"
        size=""
        x={460}
        y={150}
        selected
        width={380}
        height={220}
      >
        <StatTile
          title="Monthly recurring revenue"
          value="$48,291"
          delta="12.4%"
          caption="vs. last month"
          deltaTone="emerald"
          spark="up"
          highlightIcon
        />
      </MockFrame>

      {/* Frame: Orders today */}
      <MockFrame label="Orders today" size="300 × 170" x={880} y={180}>
        <StatTile
          title="Orders today"
          value="384"
          delta="8.7%"
          caption="vs. yest"
          deltaTone="emerald"
        />
      </MockFrame>

      {/* Frame: Button primary */}
      <MockFrame label="Button · primary" size="160 × 70" x={380} y={440}>
        <button className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white shadow-sm">
          View report
          <ArrowRight size={14} strokeWidth={2} />
        </button>
      </MockFrame>

      {/* Frame: Badge success */}
      <MockFrame label="Badge · success" size="160 × 70" x={640} y={440}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-tint px-2.5 py-1 text-[11px] font-medium text-accent-ink">
          <span className="size-1.5 rounded-full bg-accent" />
          Synced
        </span>
      </MockFrame>

      {/* Frame: EmptyState draft */}
      <MockFrame label="EmptyState draft" size="" x={900} y={420} draft>
        <div className="size-[160px] rounded-md border-2 border-dashed border-stroke-strong" />
      </MockFrame>

      {/* Floating status pill */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-stroke bg-panel px-3 py-1.5 text-[11px] text-ink-muted shadow-sm">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-accent" />
          sandbox ready
        </span>
        <span className="text-ink-faint">·</span>
        <span>42ms bundle</span>
        <span className="mx-1 h-3 w-px bg-stroke" />
        <span className="font-mono text-[10px]">x 1,480</span>
        <span className="font-mono text-[10px]">y 620</span>
      </div>
    </section>
  );
}

function MockFrame({
  label,
  size,
  x,
  y,
  width,
  height,
  selected,
  draft,
  children,
}: {
  label: string;
  size: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  selected?: boolean;
  draft?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute"
      style={{ left: x, top: y, width, height }}
    >
      <div
        className={
          "absolute -top-5 left-0 whitespace-nowrap text-[10px] font-medium " +
          (selected
            ? "rounded-t bg-accent px-1.5 py-0.5 text-white"
            : draft
              ? "text-ink-faint"
              : "text-ink-muted")
        }
      >
        {label}
        {size ? (
          <span className={selected ? "ml-2 opacity-80" : "ml-2 text-ink-faint"}>
            {size}
          </span>
        ) : null}
      </div>
      <div
        className={
          "relative rounded-xl border bg-white " +
          (selected
            ? "border-accent shadow-[0_0_0_1px_rgb(16_185_129_/_0.35)]"
            : draft
              ? "border-transparent bg-transparent"
              : "border-stroke")
        }
        style={width && height ? undefined : { padding: 0 }}
      >
        {children}
        {selected ? <SelectionHandles /> : null}
      </div>
    </div>
  );
}

function SelectionHandles() {
  const dot =
    "absolute size-2 rounded-[2px] border border-accent bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04)]";
  return (
    <>
      <span className={`${dot} -left-1 -top-1`} />
      <span className={`${dot} -right-1 -top-1`} />
      <span className={`${dot} -left-1 -bottom-1`} />
      <span className={`${dot} -right-1 -bottom-1`} />
      <span className={`${dot} -top-1 left-1/2 -translate-x-1/2`} />
      <span className={`${dot} -bottom-1 left-1/2 -translate-x-1/2`} />
      <span className={`${dot} -left-1 top-1/2 -translate-y-1/2`} />
      <span className={`${dot} -right-1 top-1/2 -translate-y-1/2`} />
    </>
  );
}

function StatTile({
  title,
  value,
  delta,
  caption,
  deltaTone,
  spark,
  highlightIcon,
}: {
  title: string;
  value: string;
  delta: string;
  caption: string;
  deltaTone: "emerald" | "rose";
  spark?: "up" | "down";
  highlightIcon?: boolean;
}) {
  const icon = title.startsWith("Monthly") ? (
    <DollarSign size={14} strokeWidth={2} className="text-accent-ink" />
  ) : (
    <TrendingUp size={14} strokeWidth={2} className="text-ink-muted" />
  );
  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-ink-muted">{title}</div>
        <div className="relative">
          {highlightIcon ? (
            <span className="absolute -left-1 -top-1 -right-1 -bottom-1 rounded-md border border-dashed border-accent" />
          ) : null}
          <div
            className={
              "grid size-8 place-items-center rounded-lg " +
              (highlightIcon ? "bg-accent-tint" : "bg-panel-soft")
            }
          >
            {icon}
          </div>
        </div>
      </div>
      <div className="text-[32px] font-semibold tracking-tight text-ink">
        {value}
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <span
          className={
            "inline-flex items-center gap-0.5 font-medium " +
            (deltaTone === "emerald" ? "text-accent-ink" : "text-rose-500")
          }
        >
          <span className="inline-block">▲</span>
          {delta}
        </span>
        <span className="text-ink-muted">{caption}</span>
        {spark ? (
          <svg
            width="70"
            height="20"
            viewBox="0 0 70 20"
            className="ml-auto"
            fill="none"
          >
            <path
              d={
                spark === "up"
                  ? "M0 15 L10 13 L20 14 L30 10 L40 11 L50 7 L60 4 L70 2"
                  : "M0 6 L10 8 L20 5 L30 10 L40 8 L50 13 L60 12 L70 15"
              }
              stroke={spark === "up" ? "#10b981" : "#f43f5e"}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </div>
    </div>
  );
}
