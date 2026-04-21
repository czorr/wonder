import {
  ChevronRight,
  ChevronDown,
  Code2,
  Layers,
  Paintbrush,
  RotateCcw,
  Square,
  Columns3,
  LayoutGrid,
  Rows3,
  EyeOff,
  ArrowRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  AlignLeft,
  AlignCenterHorizontal,
  AlignRight,
  AlignHorizontalJustifyCenter,
  AlignHorizontalSpaceBetween,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignVerticalSpaceBetween,
  AlignVerticalSpaceAround,
  AlignLeft as AlignTextLeft,
  AlignCenter,
  AlignRight as AlignTextRight,
  AlignJustify,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function RightPanel() {
  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-stroke bg-panel text-[12px]">
      {/* Tabs */}
      <div className="flex h-9 items-center gap-4 border-b border-stroke px-3 text-[11px] font-medium">
        <PanelTab icon={Paintbrush} label="Design" active />
        <PanelTab icon={Code2} label="Props" />
        <PanelTab icon={Layers} label="Layers" />
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 border-b border-stroke px-3 py-2 text-[10.5px] text-ink-muted">
        <span>StatTile</span>
        <ChevronRight size={10} className="text-ink-faint" strokeWidth={2} />
        <span>div</span>
        <ChevronRight size={10} className="text-ink-faint" strokeWidth={2} />
        <span>div.flex</span>
        <ChevronRight size={10} className="text-ink-faint" strokeWidth={2} />
        <span className="font-semibold text-ink">&lt;div&gt;</span>
      </div>

      {/* Selected element header */}
      <div className="border-b border-stroke px-3 py-3">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          <span className="text-ink-muted font-normal">&lt;div&gt;</span>
          <span>icon-wrap</span>
        </div>
        <div className="mt-0.5 text-[10.5px] text-ink-muted">
          32 × 32 · rounded-lg · bg-emerald-50
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-auto">
        <Group title="Layout">
          <Row label="Display">
            <SegIcons
              icons={[Square, Columns3, LayoutGrid, Rows3, EyeOff]}
              active={1}
            />
          </Row>
          <Row label="Direction">
            <SegIcons
              icons={[ArrowRight, ArrowDown, ArrowLeft, ArrowUp]}
              active={0}
            />
          </Row>
          <Row label="Justify">
            <SegIcons
              icons={[
                AlignStartVertical,
                AlignCenterVertical,
                AlignEndVertical,
                AlignHorizontalJustifyCenter,
                AlignHorizontalSpaceBetween,
              ]}
              active={4}
            />
          </Row>
          <Row label="Align">
            <SegIcons
              icons={[
                AlignLeft,
                AlignCenterHorizontal,
                AlignRight,
                AlignVerticalSpaceBetween,
                AlignVerticalSpaceAround,
              ]}
              active={1}
            />
          </Row>
          <Row label="Gap">
            <div className="flex gap-1">
              <NumInput value="12" suffix="gap-3" icon />
              <NumInput value="0" />
            </div>
          </Row>
        </Group>

        <Group title="Spacing">
          <SpacingEditor />
          <Row label="Padding p-5">
            <NumInput value="20" suffix="px · p-5" full highlight />
          </Row>
        </Group>

        <Group title="Sizing">
          <Row label="Width">
            <div className="flex gap-1">
              <NumInput value="W" label="auto" />
              <NumInput value="100" suffix="%" />
            </div>
          </Row>
          <Row label="Height">
            <div className="flex gap-1">
              <NumInput value="H" label="auto" />
              <NumInput value="—" />
            </div>
          </Row>
        </Group>

        <Group title="Typography">
          <Row label="Family">
            <NumInput value="Inter" suffix="font-sans" full />
          </Row>
          <Row label="Size">
            <div className="flex gap-1">
              <NumInput value="14" suffix="text-sm" />
              <NumInput value="20" suffix="leading-5" />
            </div>
          </Row>
          <Row label="Weight">
            <NumInput value="500" suffix="font-medium" full />
          </Row>
          <Row label="Align">
            <SegIcons
              icons={[AlignTextLeft, AlignCenter, AlignTextRight, AlignJustify]}
              active={0}
            />
          </Row>
        </Group>

        <Group title="Colors" last>
          <Row label="Fill">
            <div className="flex items-center gap-1.5 rounded-md border border-stroke px-1.5 py-1 w-full">
              <div className="size-4 rounded border border-stroke bg-accent-tint" />
              <input
                defaultValue="#ECFDE5"
                className="flex-1 bg-transparent font-mono text-[11px] text-ink outline-none"
              />
              <span className="text-[10px] text-ink-faint">emerald-50</span>
            </div>
          </Row>
        </Group>
      </div>
    </aside>
  );
}

function PanelTab({
  icon: Icon,
  label,
  active,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      className={
        "flex items-center gap-1.5 h-9 border-b-2 transition -mb-px " +
        (active
          ? "border-ink text-ink"
          : "border-transparent text-ink-muted hover:text-ink")
      }
    >
      <Icon size={12} strokeWidth={1.75} />
      {label}
    </button>
  );
}

function Group({
  title,
  children,
  last,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={last ? "" : "border-b border-stroke"}>
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <button className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
          <ChevronDown size={11} strokeWidth={2} className="text-ink-faint" />
          {title}
        </button>
        <button className="flex items-center gap-0.5 text-[10px] text-ink-faint hover:text-ink-muted">
          <RotateCcw size={10} strokeWidth={2} /> Reset
        </button>
      </div>
      <div className="flex flex-col gap-2 px-3 pb-3">{children}</div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[68px_1fr] items-start gap-2">
      <span className="pt-1.5 text-[10.5px] text-ink-muted">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

function SegIcons({
  icons,
  active,
}: {
  icons: LucideIcon[];
  active: number;
}) {
  return (
    <div className="flex w-full items-center rounded-md border border-stroke bg-panel p-0.5">
      {icons.map((Icon, i) => (
        <button
          key={i}
          className={
            "grid h-6 flex-1 place-items-center rounded transition " +
            (i === active
              ? "bg-ink text-white"
              : "text-ink-muted hover:text-ink hover:bg-panel-soft")
          }
        >
          <Icon size={12} strokeWidth={1.75} />
        </button>
      ))}
    </div>
  );
}

function NumInput({
  value,
  suffix,
  label,
  icon,
  full,
  highlight,
}: {
  value: string;
  suffix?: string;
  label?: string;
  icon?: boolean;
  full?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center gap-1 rounded-md border px-1.5 py-1 " +
        (highlight
          ? "border-accent bg-accent-tint/40 "
          : "border-stroke bg-panel ") +
        (full ? "w-full" : "flex-1 min-w-0")
      }
    >
      {icon ? (
        <span className="grid size-3.5 place-items-center text-ink-faint">
          ⋮⋮
        </span>
      ) : null}
      <input
        defaultValue={value}
        className="w-full min-w-0 bg-transparent text-[11px] text-ink outline-none"
      />
      {label ? (
        <span className="text-[10px] text-ink-faint">{label}</span>
      ) : null}
      {suffix ? (
        <span className="whitespace-nowrap text-[10px] text-ink-faint">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

function SpacingEditor() {
  return (
    <div className="relative rounded-md border border-stroke bg-panel-soft p-3">
      <div className="absolute left-3 top-1.5 text-[9px] font-semibold uppercase tracking-wider text-ink-faint">
        Margin
      </div>
      <div className="absolute right-3 top-1.5 font-mono text-[10px] text-ink-faint">
        0
      </div>
      <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <SpacingNum value="0" />
        <div className="relative h-12 rounded border border-dashed border-stroke-strong bg-white">
          <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-ink px-1 py-0.5 text-[9px] font-mono text-white">
            20
          </span>
          <span className="absolute left-1 top-1 font-mono text-[9px] text-ink-faint">
            20
          </span>
          <span className="absolute right-1 top-1 font-mono text-[9px] text-ink-faint">
            20
          </span>
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[9px] text-ink-faint">
            18
          </span>
        </div>
        <SpacingNum value="0" />
      </div>
    </div>
  );
}

function SpacingNum({ value }: { value: string }) {
  return (
    <span className="font-mono text-[10px] text-ink-muted">{value}</span>
  );
}
