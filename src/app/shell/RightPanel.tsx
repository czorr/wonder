import { AppIcon, type AppIconName } from "@/app/icons";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useProject } from "@/store/project";
import { useMetrics } from "@/store/metrics";
import { DesignSystemPanel } from "./DesignSystemPanel";
import {
  getClassNameAtPath,
  setClassAtPath,
} from "@/ast/tailwind";
import { PALETTE, PALETTE_BY_NAME, type PaletteColor } from "@/ast/palette";
import { bindTextPropAtPath, listProps, unbindPropAtPath } from "@/ast/props";
import { getTextAtPath, isTextLeaf } from "@/ast/text";
import { parseSource } from "@/ast/parse";
import {
  findRootJSXElement,
  getJSXAttr,
  walkJSX,
  type WonderPath,
} from "@/ast/selectors";
import * as t from "@babel/types";

const TEXT_SIZES = [
  { value: "text-xs", px: 12, lh: "leading-4" },
  { value: "text-sm", px: 14, lh: "leading-5" },
  { value: "text-base", px: 16, lh: "leading-6" },
  { value: "text-lg", px: 18, lh: "leading-7" },
  { value: "text-xl", px: 20, lh: "leading-7" },
  { value: "text-2xl", px: 24, lh: "leading-8" },
  { value: "text-3xl", px: 30, lh: "leading-9" },
  { value: "text-4xl", px: 36, lh: "leading-10" },
];
const TEXT_SIZE_VALUES = new Set(TEXT_SIZES.map((s) => s.value));

const FONT_WEIGHTS = [
  { value: "font-thin", n: 100 },
  { value: "font-light", n: 300 },
  { value: "font-normal", n: 400 },
  { value: "font-medium", n: 500 },
  { value: "font-semibold", n: 600 },
  { value: "font-bold", n: 700 },
  { value: "font-extrabold", n: 800 },
];
const FONT_WEIGHT_VALUES = new Set(FONT_WEIGHTS.map((f) => f.value));

const TEXT_ALIGNS: { value: string; icon: AppIconName }[] = [
  { value: "text-left", icon: "AlignLeft" },
  { value: "text-center", icon: "AlignCenter" },
  { value: "text-right", icon: "AlignRight" },
  { value: "text-justify", icon: "AlignJustify" },
];
const TEXT_ALIGN_VALUES = new Set(TEXT_ALIGNS.map((a) => a.value));

const SPACING_SCALE = [
  { n: "0", px: 0 },
  { n: "0.5", px: 2 },
  { n: "1", px: 4 },
  { n: "1.5", px: 6 },
  { n: "2", px: 8 },
  { n: "2.5", px: 10 },
  { n: "3", px: 12 },
  { n: "4", px: 16 },
  { n: "5", px: 20 },
  { n: "6", px: 24 },
  { n: "8", px: 32 },
  { n: "10", px: 40 },
  { n: "12", px: 48 },
  { n: "16", px: 64 },
  { n: "20", px: 80 },
  { n: "24", px: 96 },
];

const RADIUS_OPTIONS = [
  { value: "rounded-none", px: 0 },
  { value: "rounded-sm", px: 2 },
  { value: "rounded", px: 4 },
  { value: "rounded-md", px: 6 },
  { value: "rounded-lg", px: 8 },
  { value: "rounded-xl", px: 12 },
  { value: "rounded-2xl", px: 16 },
  { value: "rounded-3xl", px: 24 },
  { value: "rounded-full", px: 9999 },
];
const RADIUS_VALUES = new Set(RADIUS_OPTIONS.map((r) => r.value));

const BORDER_WIDTHS = [
  { value: "border-0", px: 0 },
  { value: "border", px: 1 },
  { value: "border-2", px: 2 },
  { value: "border-4", px: 4 },
  { value: "border-8", px: 8 },
];
const BORDER_WIDTH_VALUES = new Set(BORDER_WIDTHS.map((b) => b.value));

const STATE_TABS = ["base", "hover", "focus", "active"];

const DISPLAY_OPTIONS: { value: string; icon: AppIconName; label: string }[] = [
  { value: "block", icon: "Square", label: "block" },
  { value: "flex", icon: "Rows", label: "flex" },
  { value: "grid", icon: "Columns", label: "grid" },
  { value: "inline", icon: "Minus", label: "inline" },
  { value: "hidden", icon: "EyeOff", label: "hidden" },
];
const DISPLAY_VALUES = new Set(DISPLAY_OPTIONS.map((d) => d.value));

const DIRECTION_OPTIONS: { value: string; icon: AppIconName }[] = [
  { value: "flex-row", icon: "ArrowRight" },
  { value: "flex-col", icon: "ArrowDown" },
  { value: "flex-row-reverse", icon: "ArrowLeft" },
  { value: "flex-col-reverse", icon: "ArrowUp" },
];
const DIRECTION_VALUES = new Set(DIRECTION_OPTIONS.map((d) => d.value));

const JUSTIFY_OPTIONS: { value: string; icon: AppIconName; label: string }[] = [
  { value: "justify-start", icon: "AlignHorizontalStart", label: "start" },
  { value: "justify-center", icon: "AlignHorizontalCenter", label: "center" },
  { value: "justify-end", icon: "AlignHorizontalEnd", label: "end" },
  { value: "justify-between", icon: "AlignHorizontalSpaceBetween", label: "between" },
  { value: "justify-around", icon: "AlignHorizontalSpaceAround", label: "around" },
];
const JUSTIFY_VALUES = new Set(JUSTIFY_OPTIONS.map((j) => j.value));

const ALIGN_OPTIONS: { value: string; icon: AppIconName; label: string }[] = [
  { value: "items-start", icon: "AlignVerticalStart", label: "start" },
  { value: "items-center", icon: "AlignVerticalCenter", label: "center" },
  { value: "items-end", icon: "AlignVerticalEnd", label: "end" },
  { value: "items-baseline", icon: "AlignStretch", label: "baseline" },
  { value: "items-stretch", icon: "StretchHorizontal", label: "stretch" },
];
const ALIGN_VALUES = new Set(ALIGN_OPTIONS.map((a) => a.value));

const SPACING_SIDES = ["t", "r", "b", "l"] as const;
type Side = (typeof SPACING_SIDES)[number];

function readSideSpacing(
  classes: string[],
  prefix: "p" | "m",
  side: Side,
): { cls: string | undefined; px: number } {
  const axis: "x" | "y" = side === "t" || side === "b" ? "y" : "x";
  const specific = classes.find((c) => new RegExp(`^${prefix}${side}-[\\d.]+$`).test(c));
  const axisC = classes.find((c) => new RegExp(`^${prefix}${axis}-[\\d.]+$`).test(c));
  const allC = classes.find((c) => new RegExp(`^${prefix}-[\\d.]+$`).test(c));
  const chosen = specific ?? axisC ?? allC;
  const num = chosen?.match(/-([\d.]+)$/)?.[1];
  const entry = SPACING_SCALE.find((s) => s.n === num);
  return { cls: chosen, px: entry?.px ?? 0 };
}

function pxToScale(px: number): string {
  let best = SPACING_SCALE[0];
  let bestDiff = Infinity;
  for (const s of SPACING_SCALE) {
    const d = Math.abs(s.px - px);
    if (d < bestDiff) {
      bestDiff = d;
      best = s;
    }
  }
  return best.n;
}

export function RightPanel() {
  const components = useProject((s) => s.components);
  const selectedId = useProject((s) => s.selectedComponentId);
  const selectedPath = useProject((s) => s.selectedElementPath);
  const selectElement = useProject((s) => s.selectElement);
  const setSource = useProject((s) => s.setSource);

  const [state, setState] = useState<string>("base");
  const [panel, setPanel] = useState<"design" | "props" | "layers">("design");
  const propValuesByComp = useProject((s) => s.propValues);
  const setPropValue = useProject((s) => s.setPropValue);

  const component = selectedId ? components[selectedId] : null;
  const path = selectedPath ?? "0";

  const rootSize = useMetrics((s) => (selectedId ? s.rootSizes[selectedId] : undefined));
  const selRect = useMetrics((s) => (selectedId ? s.selectedRects[selectedId] : undefined));
  const measured = path === "0"
    ? rootSize
    : selRect && selRect.path === path
      ? { w: selRect.w, h: selRect.h }
      : undefined;

  const classes = useMemo(() => {
    if (!component) return [];
    try {
      return getClassNameAtPath(component.source, path);
    } catch {
      return [];
    }
  }, [component, path]);

  const find = (pred: (c: string) => boolean) => classes.find(pred);

  const currentPadding = find((c) => /^p-/.test(c));
  const currentGap = find((c) => /^gap-/.test(c));
  const currentDisplay = find((c) => DISPLAY_VALUES.has(c));
  const currentDirection = find((c) => DIRECTION_VALUES.has(c));
  const currentJustify = find((c) => JUSTIFY_VALUES.has(c));
  const currentAlignItems = find((c) => ALIGN_VALUES.has(c));
  const currentWidth = find((c) => /^w-/.test(c));
  const currentHeight = find((c) => /^h-/.test(c));

  const currentSize = find((c) => TEXT_SIZE_VALUES.has(c));
  const currentWeight = find((c) => FONT_WEIGHT_VALUES.has(c));
  const currentAlign = find((c) => TEXT_ALIGN_VALUES.has(c));

  const currentBg = find((c) => /^bg-/.test(c));
  const currentTextColor = find(
    (c) => /^text-/.test(c) && !TEXT_SIZE_VALUES.has(c) && !TEXT_ALIGN_VALUES.has(c),
  );
  const currentBorderColor = find((c) => /^border-(?:[a-z]+)-\d+$/.test(c));

  const currentRadius = find((c) => RADIUS_VALUES.has(c));
  const currentBorderW = find((c) => BORDER_WIDTH_VALUES.has(c)) ?? "border-0";

  const baselineRef = useRef<string | null>(null);

  const captureBaseline = () => {
    if (component) baselineRef.current = component.source;
  };
  const clearBaseline = () => {
    baselineRef.current = null;
  };
  const cancelPreview = () => {
    if (component && baselineRef.current != null) {
      setSource(component.id, baselineRef.current);
    }
    baselineRef.current = null;
  };

  const swap = (oldClass: string | undefined, next: string) => {
    if (!component) return;
    try {
      const base = baselineRef.current ?? component.source;
      const updated = setClassAtPath(base, path, oldClass ?? next, next);
      setSource(component.id, updated);
    } catch (e) {
      console.error(e);
    }
  };

  const preview = (oldClass: string | undefined) => ({
    onOpen: captureBaseline,
    onHover: (v: string) => swap(oldClass, v),
    onCancel: cancelPreview,
  });
  const commit = (oldClass: string | undefined, next: string) => {
    swap(oldClass, next);
    clearBaseline();
  };
  const previewColor = (oldClass: string | undefined, prefix: string) => ({
    onOpen: captureBaseline,
    onHover: (name: string) => name && swap(oldClass, `${prefix}-${name}`),
    onCancel: cancelPreview,
  });

  const colorName = (cls: string | undefined, prefix: string): PaletteColor | undefined => {
    if (!cls) return undefined;
    const name = cls.replace(new RegExp(`^${prefix}-`), "");
    return PALETTE_BY_NAME.get(name);
  };

  const bgColor = colorName(currentBg, "bg");
  const textColor = colorName(currentTextColor, "text");
  const borderColor = colorName(currentBorderColor, "border");

  return (
    <aside className="flex w-[320px] shrink-0 flex-col overflow-x-hidden border-l border-stroke bg-panel text-[12px]">
      <div className="flex h-9 items-center gap-4 border-b border-stroke px-3 text-[11px] font-medium">
        <PanelTab icon="PaintBrush" label="Design" active={panel === "design"} onClick={() => setPanel("design")} />
        <PanelTab icon="Code" label="Props" active={panel === "props"} onClick={() => setPanel("props")} />
        <PanelTab icon="Layers" label="Layers" active={panel === "layers"} onClick={() => setPanel("layers")} />
      </div>

      {component ? (
      <div className="flex items-center gap-1 border-b border-stroke px-3 py-2 text-[10.5px] text-ink-muted">
        <span>{component.name}</span>
        <AppIcon name="ChevronRight" size={10} className="text-ink-faint" />
        <span className="font-mono text-[10px] text-ink-faint">{path}</span>
      </div>
      ) : null}

      {component ? (
      <div className="flex items-center gap-1 border-b border-stroke px-3 py-1.5">
        {STATE_TABS.map((s) => {
          const active = s === state;
          return (
            <button
              key={s}
              onClick={() => setState(s)}
              className={
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition " +
                (active
                  ? "bg-accent-tint text-accent-ink"
                  : "text-ink-muted hover:text-ink")
              }
            >
              <span
                className={
                  "size-1.5 rounded-full " +
                  (active ? "bg-accent" : "bg-ink-faint")
                }
              />
              {s}
            </button>
          );
        })}
      </div>
      ) : null}

      <div
        className={"flex-1 overflow-auto " + (state !== "base" ? "[&_.wnd-field]:!bg-emerald-50 [&_.wnd-field]:!border-emerald-300 [&_input]:!bg-transparent [&_input]:!text-emerald-900" : "")}
      >
        {panel === "props" && component ? (
          <PropsPanel
            component={component}
            path={path}
            values={propValuesByComp[component.id] ?? {}}
            setValue={(name, val) => setPropValue(component.id, name, val)}
          />
        ) : null}
        {panel === "design" && !component ? <DesignSystemPanel /> : null}
        {panel === "design" && component ? (
        <>
        <Group
          title="Layout"
          headerRight={
            <ResetButton
              onReset={() => {
                const toRemove = [currentDisplay, currentDirection, currentJustify, currentAlignItems, currentGap].filter(Boolean) as string[];
                if (!component || toRemove.length === 0) return;
                let src = component.source;
                for (const cls of toRemove) {
                  try { src = setClassAtPath(src, path, cls, ""); } catch {}
                }
                setSource(component.id, src);
              }}
            />
          }
        >
          <DualRow label="Display">
            <IconToggleGroup
              options={DISPLAY_OPTIONS}
              current={currentDisplay}
              onChange={(v) => swap(currentDisplay, v)}
              span={2}
            />
          </DualRow>
          <DualRow label="Direction">
            <IconToggleGroup
              options={DIRECTION_OPTIONS}
              current={currentDirection}
              onChange={(v) => swap(currentDirection, v)}
              span={2}
            />
          </DualRow>
          <DualRow label="Justify">
            <IconToggleGroup
              options={JUSTIFY_OPTIONS}
              current={currentJustify}
              onChange={(v) => swap(currentJustify, v)}
              span={2}
              showLabel
            />
          </DualRow>
          <DualRow label="Align">
            <IconToggleGroup
              options={ALIGN_OPTIONS}
              current={currentAlignItems}
              onChange={(v) => swap(currentAlignItems, v)}
              span={2}
              showLabel
            />
          </DualRow>
          <DualRow
            label="Gap"
            scrub={{
              current: currentGap ?? "gap-0",
              values: SPACING_SCALE.map((s) => `gap-${s.n}`),
              onChange: (v) => swap(currentGap, v),
              onCommit: clearBaseline,
              onStart: captureBaseline,
            }}
          >
            <SpacingSelect
              current={currentGap}
              prefix="gap"
              onChange={(v) => commit(currentGap, v)}
              preview={preview(currentGap)}
            />
            <InputBox
              value={String(spacingPx(currentGap, "gap-") ?? 0)}
              hint="px"
              readOnly
            />
          </DualRow>
        </Group>

        <Group title="Sizing">
          <DualRow label="Width">
            <InputBox
              value={stripPrefix(currentWidth, "w-") ?? ""}
              placeholder={!currentWidth && measured ? `${Math.round(measured.w)}px` : "auto"}
              hint={currentWidth ?? (measured ? "measured" : "—")}
              onCommit={(v) => swap(currentWidth, `w-${v}`)}
            />
            <InputBox value="100" hint="%" readOnly />
          </DualRow>
          <DualRow label="Height">
            <InputBox
              value={stripPrefix(currentHeight, "h-") ?? ""}
              placeholder={!currentHeight && measured ? `${Math.round(measured.h)}px` : "auto"}
              hint={currentHeight ?? (measured ? "measured" : "—")}
              onCommit={(v) => swap(currentHeight, `h-${v}`)}
            />
            <InputBox value="—" hint="" readOnly />
          </DualRow>
        </Group>

        <Group
          title="Spacing"
          headerRight={
            <ResetButton
              onReset={() => {
                if (!component) return;
                const toRemove = classes.filter((c) => /^(?:p|m)[trblxy]?-[\d.]+$/.test(c));
                if (toRemove.length === 0) return;
                let src = component.source;
                for (const cls of toRemove) {
                  try { src = setClassAtPath(src, path, cls, ""); } catch {}
                }
                setSource(component.id, src);
              }}
            />
          }
        >
          <BoxModel
            classes={classes}
            onStart={captureBaseline}
            onEnd={clearBaseline}
            onWrite={(prefix, side, px) => {
              const { cls } = readSideSpacing(classes, prefix, side);
              const n = pxToScale(px);
              swap(cls, `${prefix}${side}-${n}`);
            }}
          />
        </Group>

        <Group title="Typography">
          <DualRow label="Family">
            <InputBox value="Inter" hint="font-sans" readOnly full />
          </DualRow>
          <DualRow
            label="Size"
            scrub={{
              current: currentSize ?? "text-base",
              values: TEXT_SIZES.map((s) => s.value),
              onChange: (v) => swap(currentSize, v),
              onCommit: clearBaseline,
              onStart: captureBaseline,
            }}
          >
            <SelectBox
              value={currentSize ?? "text-base"}
              hint={String(TEXT_SIZES.find((s) => s.value === currentSize)?.px ?? 16)}
              options={TEXT_SIZES.map((s) => ({
                value: s.value,
                label: s.value.replace("text-", ""),
                right: `${s.px}px`,
              }))}
              onChange={(v) => commit(currentSize, v)}
              {...preview(currentSize)}
            />
            <InputBox
              value={String(TEXT_SIZES.find((s) => s.value === currentSize)?.px ?? 16)}
              hint={
                TEXT_SIZES.find((s) => s.value === currentSize)?.lh ?? "leading-6"
              }
              readOnly
            />
          </DualRow>
          <DualRow
            label="Weight"
            scrub={{
              current: currentWeight ?? "font-normal",
              values: FONT_WEIGHTS.map((f) => f.value),
              onChange: (v) => swap(currentWeight, v),
              onCommit: clearBaseline,
              onStart: captureBaseline,
            }}
          >
            <SelectBox
              value={currentWeight ?? "font-normal"}
              hint={String(
                FONT_WEIGHTS.find((f) => f.value === currentWeight)?.n ?? 400,
              )}
              options={FONT_WEIGHTS.map((f) => ({
                value: f.value,
                label: f.value.replace("font-", ""),
                right: String(f.n),
              }))}
              onChange={(v) => commit(currentWeight, v)}
              {...preview(currentWeight)}
            />
            <InputBox
              value={String(
                FONT_WEIGHTS.find((f) => f.value === currentWeight)?.n ?? 400,
              )}
              hint={currentWeight ?? "font-normal"}
              readOnly
            />
          </DualRow>
          <DualRow label="Align">
            <div className="col-span-2 flex items-center rounded-md border border-stroke bg-panel-soft p-0.5">
              {TEXT_ALIGNS.map((a) => {
                const active = currentAlign === a.value;
                return (
                  <button
                    key={a.value}
                    onClick={() => swap(currentAlign, a.value)}
                    className={
                      "flex flex-1 items-center justify-center h-6 rounded-[4px] transition " +
                      (active
                        ? "bg-white shadow-sm text-ink"
                        : "text-ink-muted hover:text-ink")
                    }
                  >
                    <AppIcon name={a.icon} size={13} />
                  </button>
                );
              })}
            </div>
          </DualRow>
        </Group>

        <Group title="Colors">
          <DualRow label="Fill">
            <ColorDropdown
              color={bgColor}
              onChange={(name) => commit(currentBg, `bg-${name}`)}
              full
              {...previewColor(currentBg, "bg")}
            />
          </DualRow>
          <DualRow label="Text">
            <ColorDropdown
              color={textColor}
              onChange={(name) => commit(currentTextColor, `text-${name}`)}
              full
              {...previewColor(currentTextColor, "text")}
            />
          </DualRow>
          <DualRow label="Border">
            <ColorDropdown
              color={borderColor}
              placeholder="none"
              onChange={(name) => commit(currentBorderColor, `border-${name}`)}
              full
              {...previewColor(currentBorderColor, "border")}
            />
          </DualRow>
        </Group>

        <Group title="Borders">
          <DualRow
            label="Radius"
            scrub={{
              current: currentRadius ?? "rounded-none",
              values: RADIUS_OPTIONS.map((r) => r.value),
              onChange: (v) => swap(currentRadius, v),
              onCommit: clearBaseline,
              onStart: captureBaseline,
            }}
          >
            <SelectBox
              value={currentRadius ?? "rounded-none"}
              hint={String(
                RADIUS_OPTIONS.find((r) => r.value === currentRadius)?.px ?? 0,
              )}
              options={RADIUS_OPTIONS.map((r) => ({
                value: r.value,
                label: r.value.replace("rounded", "rounded") || "rounded",
                right: `${r.px}px`,
              }))}
              onChange={(v) => commit(currentRadius, v)}
              {...preview(currentRadius)}
            />
            <InputBox value="all" hint="—" readOnly />
          </DualRow>
          <DualRow
            label="Width"
            scrub={{
              current: currentBorderW,
              values: BORDER_WIDTHS.map((b) => b.value),
              onChange: (v) => swap(currentBorderW, v),
              onCommit: clearBaseline,
              onStart: captureBaseline,
            }}
          >
            <SelectBox
              value={currentBorderW}
              hint={String(
                BORDER_WIDTHS.find((b) => b.value === currentBorderW)?.px ?? 0,
              )}
              options={BORDER_WIDTHS.map((b) => ({
                value: b.value,
                label: b.value,
                right: `${b.px}px`,
              }))}
              onChange={(v) => commit(currentBorderW, v)}
              {...preview(currentBorderW)}
            />
            <InputBox
              value={String(
                BORDER_WIDTHS.find((b) => b.value === currentBorderW)?.px ?? 0,
              )}
              hint={currentBorderW}
              readOnly
            />
          </DualRow>
        </Group>

        <Group title="Effects" headerRight={<AddButton />}>
          <div className="text-[10.5px] text-ink-faint">No effects</div>
        </Group>

        <LayersGroup
          source={component?.source ?? ""}
          selectedPath={path}
          onSelect={(p) => selectElement(p)}
        />
        </>
        ) : null}
      </div>
    </aside>
  );
}

function stripPrefix(value: string | undefined, prefix: string): string | null {
  if (!value) return null;
  if (!value.startsWith(prefix)) return null;
  return value.slice(prefix.length);
}

function spacingPx(value: string | undefined, prefix: string): number | null {
  if (!value) return null;
  const raw = value.slice(prefix.length);
  const entry = SPACING_SCALE.find((s) => s.n === raw);
  return entry?.px ?? null;
}

function PanelTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: AppIconName;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center gap-1.5 h-9 border-b-2 transition -mb-px " +
        (active
          ? "border-ink text-ink"
          : "border-transparent text-ink-muted hover:text-ink")
      }
    >
      <AppIcon name={icon} size={12} />
      {label}
    </button>
  );
}

function Group({
  title,
  children,
  headerRight,
}: {
  title: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-stroke">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-ink-soft"
        >
          <AppIcon name={open ? "ChevronDown" : "ChevronRight"} size={11} className="text-ink-faint" />
          {title}
        </button>
        {headerRight}
      </div>
      {open ? (
        <div className="flex flex-col gap-1.5 px-3 pb-3">{children}</div>
      ) : null}
    </div>
  );
}

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      onClick={onReset}
      className="text-[10px] text-ink-muted hover:text-ink"
    >
      Reset
    </button>
  );
}

function IconToggleGroup<T extends { value: string; icon: AppIconName; label?: string }>(
  { options, current, onChange, span, showLabel }: {
    options: T[];
    current: string | undefined;
    onChange: (v: string) => void;
    span?: 1 | 2;
    showLabel?: boolean;
  },
) {
  const activeLabel = options.find((o) => o.value === current)?.label;
  return (
    <div className={(span === 2 ? "col-span-2 " : "") + "flex flex-col gap-0.5"}>
      <div className="flex items-center rounded-md border border-stroke bg-panel-soft p-0.5">
        {options.map((o) => {
          const active = current === o.value;
          return (
            <button
              key={o.value}
              title={o.value}
              onClick={() => onChange(o.value)}
              className={
                "flex flex-1 items-center justify-center h-6 rounded-[4px] transition " +
                (active
                  ? "bg-white shadow-sm text-ink"
                  : "text-ink-muted hover:text-ink")
              }
            >
              <AppIcon name={o.icon} size={13} />
            </button>
          );
        })}
      </div>
      {showLabel ? (
        <span className="pl-1 text-[9.5px] text-ink-faint">{activeLabel ?? "—"}</span>
      ) : null}
    </div>
  );
}

function BoxModel({
  classes,
  onWrite,
  onStart,
  onEnd,
}: {
  classes: string[];
  onWrite: (prefix: "p" | "m", side: Side, px: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  const m = {
    t: readSideSpacing(classes, "m", "t"),
    r: readSideSpacing(classes, "m", "r"),
    b: readSideSpacing(classes, "m", "b"),
    l: readSideSpacing(classes, "m", "l"),
  };
  const p = {
    t: readSideSpacing(classes, "p", "t"),
    r: readSideSpacing(classes, "p", "r"),
    b: readSideSpacing(classes, "p", "b"),
    l: readSideSpacing(classes, "p", "l"),
  };
  return (
    <div className="col-span-full -mx-1 rounded-md border border-stroke bg-panel-soft px-2 py-3">
      <div className="relative">
        <span className="absolute left-1 top-1 text-[9px] font-medium uppercase tracking-wider text-ink-faint">
          Margin
        </span>
        <div className="mx-auto flex w-full flex-col items-center">
          <SideInput side="t" kind="m" value={m.t.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("m", "t", v)} />
          <div className="flex w-full items-center justify-between gap-1 py-1">
            <SideInput side="l" kind="m" value={m.l.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("m", "l", v)} />
            <div className="relative flex-1 rounded-sm bg-emerald-100/70 py-3">
              <div className="flex flex-col items-center">
                <SideInput side="t" kind="p" accent value={p.t.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("p", "t", v)} />
                <div className="flex w-full items-center justify-between gap-1 py-1">
                  <SideInput side="l" kind="p" accent value={p.l.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("p", "l", v)} />
                  <div className="h-6 flex-1" />
                  <SideInput side="r" kind="p" accent value={p.r.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("p", "r", v)} />
                </div>
                <SideInput side="b" kind="p" accent value={p.b.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("p", "b", v)} />
              </div>
            </div>
            <SideInput side="r" kind="m" value={m.r.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("m", "r", v)} />
          </div>
          <SideInput side="b" kind="m" value={m.b.px} onStart={onStart} onEnd={onEnd} onCommit={(v) => onWrite("m", "b", v)} />
        </div>
      </div>
    </div>
  );
}

const SIDE_ICON: Record<Side, AppIconName> = {
  t: "ArrowUp",
  r: "ArrowRight",
  b: "ArrowDown",
  l: "ArrowLeft",
};

function SideInput({
  value,
  accent,
  side,
  kind,
  onCommit,
  onStart,
  onEnd,
}: {
  value: number;
  accent?: boolean;
  side: Side;
  kind: "p" | "m";
  onCommit: (v: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  const [local, setLocal] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  useEffect(() => setLocal(String(value)), [value]);

  const beginScrub = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startVal = value;
    let moved = false;
    let lastVal = startVal;
    onStart?.();
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 2) {
        moved = true;
        setScrubbing(true);
      }
      const next = Math.max(0, Math.round(startVal + dx / 2));
      if (next !== lastVal) {
        lastVal = next;
        setLocal(String(next));
        onCommit(next);
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setScrubbing(false);
      onEnd?.();
      if (!moved) {
        // Treat as a plain click — focus the input for typing.
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const iconName = SIDE_ICON[side];
  const accentCls = accent ? "text-emerald-900" : "text-ink-muted";
  return (
    <div
      className={
        "group relative flex items-center justify-center rounded border border-transparent " +
        (scrubbing ? "border-accent bg-white " : "hover:border-stroke ")
      }
    >
      <button
        onMouseDown={beginScrub}
        title={`Scrub ${kind}${side}`}
        className={
          "grid h-5 w-3 shrink-0 place-items-center cursor-ew-resize opacity-0 group-hover:opacity-60 hover:!opacity-100 " +
          accentCls
        }
      >
        <AppIcon name={iconName} size={9} />
      </button>
      <input
        ref={inputRef}
        value={local}
        onMouseDown={(e) => {
          // Allow the parent div drag to handle scrub; if the user actually
          // clicks without moving we re-focus in the mouseup handler.
          if (document.activeElement !== inputRef.current) beginScrub(e);
        }}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const n = Number(local);
          if (!Number.isNaN(n) && n !== value) onCommit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={
          "h-5 w-8 bg-transparent text-center text-[10.5px] outline-none focus:cursor-text " +
          accentCls
        }
      />
    </div>
  );
}

function AddButton() {
  return (
    <button className="flex items-center gap-0.5 text-[10px] text-ink-muted hover:text-ink">
      <AppIcon name="Plus" size={11} /> Add
    </button>
  );
}

type ScrubConfig = {
  current: string;
  values: string[];
  onChange: (v: string) => void;
  onStart?: () => void;
  onCommit?: () => void;
};

function DualRow({
  label,
  children,
  scrub,
}: {
  label: string;
  children: React.ReactNode;
  scrub?: ScrubConfig;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[46px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5">
      {scrub ? (
        <ScrubLabel label={label} scrub={scrub} />
      ) : (
        <span className="truncate text-[10.5px] text-ink-muted">{label}</span>
      )}
      {children}
    </div>
  );
}

function ScrubLabel({ label, scrub }: { label: string; scrub: ScrubConfig }) {
  const [dragging, setDragging] = useState(false);
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startIdx = Math.max(0, scrub.values.indexOf(scrub.current));
    scrub.onStart?.();
    let moved = false;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 2) moved = true;
      const steps = Math.round(dx / 4);
      const idx = Math.min(
        scrub.values.length - 1,
        Math.max(0, startIdx + steps),
      );
      const next = scrub.values[idx];
      if (next && next !== scrub.current) scrub.onChange(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDragging(false);
      scrub.onCommit?.();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    setDragging(true);
    void moved;
  };
  return (
    <span
      onMouseDown={onMouseDown}
      title="Drag to scrub"
      className={
        "select-none truncate text-[10.5px] text-ink-muted cursor-ew-resize hover:text-ink " +
        (dragging ? "text-accent-ink" : "")
      }
    >
      {label}
    </span>
  );
}

function InputBox({
  value,
  hint,
  readOnly,
  full,
  placeholder,
  onCommit,
}: {
  value: string;
  hint: string;
  readOnly?: boolean;
  full?: boolean;
  placeholder?: string;
  onCommit?: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);
  return (
    <div
      className={
        "wnd-field flex h-7 items-center gap-1 rounded-md border border-stroke bg-white px-2 " +
        (full ? "col-span-2 " : "") +
        (readOnly ? "opacity-100" : "focus-within:border-accent")
      }
    >
      <input
        value={local}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onCommit?.(local)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="min-w-0 flex-1 bg-transparent text-[11px] text-ink placeholder:text-ink-faint/70 outline-none"
      />
      {hint ? (
        <span className="shrink-0 text-[10px] font-mono text-ink-faint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function useOutsideClick<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);
  return ref;
}

function SelectBox({
  value,
  hint,
  options,
  onChange,
  onOpen,
  onHover,
  onCancel,
}: {
  value: string;
  hint: string;
  options: { value: string; label: string; right?: string }[];
  onChange: (v: string) => void;
  onOpen?: () => void;
  onHover?: (v: string) => void;
  onCancel?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const close = (cancel: boolean) => {
    setOpen(false);
    if (cancel) onCancel?.();
  };
  const ref = useOutsideClick<HTMLDivElement>(open, () => close(true));
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((o) => !o);
        }}
        className="flex h-7 w-full items-center gap-1 wnd-field rounded-md border border-stroke bg-white px-2 hover:border-stroke-strong"
      >
        <span className="min-w-0 flex-1 truncate text-left text-[11px] text-ink">
          {hint}
        </span>
        <span className="shrink-0 text-[10px] font-mono text-ink-faint">
          {value.replace(/^text-|^font-|^rounded-?|^border-?/, "") || value}
        </span>
        <AppIcon name="ChevronDown" size={11} className="text-ink-faint" />
      </button>
      {open ? (
        <div
          onMouseLeave={() => onHover?.(value)}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 rounded-md border border-stroke bg-white p-1 shadow-lg"
        >
          <div className="flex items-center gap-1 rounded border border-stroke bg-panel-soft px-1.5 py-1">
            <AppIcon name="Search" size={11} className="text-ink-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
            />
          </div>
          <div className="mt-1 max-h-56 overflow-auto">
            {filtered.map((o) => {
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  onMouseEnter={() => onHover?.(o.value)}
                  onClick={() => {
                    onChange(o.value);
                    close(false);
                  }}
                  className={
                    "flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] " +
                    (active
                      ? "bg-accent-tint text-accent-ink"
                      : "text-ink hover:bg-panel-soft")
                  }
                >
                  <span className="flex-1 truncate text-left font-mono">
                    {o.label}
                  </span>
                  {o.right ? (
                    <span className="text-[10px] text-ink-faint">{o.right}</span>
                  ) : null}
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-[10.5px] text-ink-faint">
                No match
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SpacingSelect({
  current,
  prefix,
  onChange,
  preview,
}: {
  current: string | undefined;
  prefix: string;
  onChange: (v: string) => void;
  preview?: {
    onOpen?: () => void;
    onHover?: (v: string) => void;
    onCancel?: () => void;
  };
}) {
  const value = current ?? `${prefix}-0`;
  const label = value.replace(`${prefix}-`, "") || "0";
  const options = SPACING_SCALE.map((s) => ({
    value: `${prefix}-${s.n}`,
    label: `${prefix}-${s.n}`,
    right: `${s.px}px`,
  }));
  return (
    <SelectBox
      value={value}
      hint={label}
      options={options}
      onChange={onChange}
      {...preview}
    />
  );
}

function ColorDropdown({
  color,
  onChange,
  placeholder,
  full,
  onOpen,
  onHover,
  onCancel,
}: {
  color: PaletteColor | undefined;
  onChange: (name: string) => void;
  placeholder?: string;
  full?: boolean;
  onOpen?: () => void;
  onHover?: (name: string) => void;
  onCancel?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const close = (cancel: boolean) => {
    setOpen(false);
    if (cancel) onCancel?.();
  };
  const ref = useOutsideClick<HTMLDivElement>(open, () => close(true));
  const filtered = useMemo(
    () =>
      q
        ? PALETTE.filter((p) =>
            p.name.toLowerCase().includes(q.toLowerCase()),
          )
        : PALETTE,
    [q],
  );
  return (
    <div ref={ref} className={"relative " + (full ? "col-span-2" : "")}>
      <button
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((o) => !o);
        }}
        className="flex h-7 w-full items-center gap-2 rounded-md border border-stroke bg-white px-1.5 hover:border-stroke-strong"
      >
        {color ? (
          <span
            className="size-4 shrink-0 rounded-[4px] border border-stroke"
            style={{
              backgroundColor: color.hex === "transparent" ? "#fff" : color.hex,
              backgroundImage:
                color.hex === "transparent"
                  ? "linear-gradient(45deg,#eee 25%,transparent 25%,transparent 75%,#eee 75%),linear-gradient(45deg,#eee 25%,transparent 25%,transparent 75%,#eee 75%)"
                  : undefined,
              backgroundSize: "6px 6px",
              backgroundPosition: "0 0, 3px 3px",
            }}
          />
        ) : (
          <span className="size-4 shrink-0 rounded-[4px] border border-stroke bg-[linear-gradient(135deg,transparent_calc(50%-1px),#ef4444_calc(50%-1px),#ef4444_calc(50%+1px),transparent_calc(50%+1px))]" />
        )}
        <span className="min-w-0 flex-1 truncate text-left text-[11px] text-ink">
          {color?.name ?? placeholder ?? "—"}
        </span>
        <span className="shrink-0 font-mono text-[10px] uppercase text-ink-faint">
          {color?.hex ?? "—"}
        </span>
      </button>
      {open ? (
        <div
          onMouseLeave={() => onHover?.(color?.name ?? "")}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 rounded-md border border-stroke bg-white p-1 shadow-lg"
        >
          <div className="flex items-center gap-1 rounded border border-stroke bg-panel-soft px-1.5 py-1">
            <AppIcon name="Search" size={11} className="text-ink-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search color (e.g. emerald-600)"
              className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
            />
          </div>
          <div className="mt-1 max-h-64 overflow-auto">
            {filtered.map((p) => {
              const active = color?.name === p.name;
              return (
                <button
                  key={p.name}
                  onMouseEnter={() => onHover?.(p.name)}
                  onClick={() => {
                    onChange(p.name);
                    close(false);
                  }}
                  className={
                    "flex w-full items-center gap-2 rounded px-1.5 py-1 text-[11px] " +
                    (active ? "bg-accent-tint" : "hover:bg-panel-soft")
                  }
                >
                  <span
                    className="size-4 shrink-0 rounded-[4px] border border-stroke"
                    style={{
                      backgroundColor:
                        p.hex === "transparent" ? "#fff" : p.hex,
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-left font-mono text-ink">
                    {p.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase text-ink-faint">
                    {p.hex}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-[10.5px] text-ink-faint">
                No match
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PropsPanel({
  component,
  path,
  values,
  setValue,
}: {
  component: { id: string; source: string };
  path: string;
  values: Record<string, string>;
  setValue: (name: string, v: string) => void;
}) {
  const setSource = useProject((s) => s.setSource);
  const selectElement = useProject((s) => s.selectElement);
  const clearPropValue = useProject((s) => s.clearPropValue);

  const props = useMemo(() => {
    try {
      return listProps(component.source);
    } catch {
      return [];
    }
  }, [component.source]);

  const canBindHere = useMemo(() => {
    try {
      return isTextLeaf(component.source, path) && getTextAtPath(component.source, path) !== null;
    } catch {
      return false;
    }
  }, [component.source, path]);

  const selectionIsBound = useMemo(() => {
    return props.some((p) => p.usedAtPaths.includes(path));
  }, [props, path]);

  const [newName, setNewName] = useState("");

  const bind = () => {
    const text = getTextAtPath(component.source, path);
    if (text === null) return;
    const name = newName.trim() || "label";
    try {
      const { code } = bindTextPropAtPath(component.source, path, name, text);
      setSource(component.id, code);
      setNewName("");
    } catch (e) {
      console.error(e);
    }
  };

  const unbind = (propName: string) => {
    // Unbind at every usage path
    let code = component.source;
    try {
      const p = props.find((x) => x.name === propName);
      if (!p) return;
      for (const usage of p.usedAtPaths) {
        code = unbindPropAtPath(code, usage);
      }
      setSource(component.id, code);
      clearPropValue(component.id, propName);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Group title="Props" headerRight={null}>
      {canBindHere && !selectionIsBound ? (
        <div className="col-span-2 flex items-center gap-1.5 rounded-md border border-dashed border-stroke bg-panel-soft p-1.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="prop name"
            className="min-w-0 flex-1 rounded-md border border-stroke bg-white px-2 py-1 text-[11px] text-ink outline-none focus:border-accent"
          />
          <button
            onClick={bind}
            className="rounded-md bg-accent px-2 py-1 text-[10.5px] font-semibold text-white hover:brightness-105"
          >
            Bind text
          </button>
        </div>
      ) : null}
      {props.length === 0 ? (
        <div className="col-span-2 text-[10.5px] text-ink-faint">
          {canBindHere ? "Name a prop and bind the selected text." : "Select a text element to bind it to a prop."}
        </div>
      ) : null}
      {props.map((p) => {
        const override = values[p.name];
        const current = override ?? p.default;
        const isSelection = p.usedAtPaths.includes(path);
        return (
          <div key={p.name} className="col-span-2 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 text-[10.5px] text-ink">
                <span className="font-mono text-[10px] text-accent-ink">{p.name}</span>
                {p.usedAtPaths[0] ? (
                  <button
                    onClick={() => selectElement(p.usedAtPaths[0])}
                    className={
                      "rounded-full px-1.5 py-0.5 text-[9.5px] " +
                      (isSelection ? "bg-accent-tint text-accent-ink" : "bg-panel-soft text-ink-muted hover:text-ink")
                    }
                    title="Jump to bound element"
                  >
                    {p.usedAtPaths.length} use{p.usedAtPaths.length === 1 ? "" : "s"}
                  </button>
                ) : null}
              </div>
              <button
                onClick={() => unbind(p.name)}
                className="text-[10px] text-ink-faint hover:text-ink"
                title="Unbind"
              >
                unbind
              </button>
            </div>
            <div className="flex items-center gap-1">
              <InputBox
                value={current}
                hint={override !== undefined ? "override" : "default"}
                onCommit={(v) => setValue(p.name, v)}
                full
              />
            </div>
          </div>
        );
      })}
    </Group>
  );
}

function LayersGroup({
  source,
  selectedPath,
  onSelect,
}: {
  source: string;
  selectedPath: string;
  onSelect: (p: WonderPath) => void;
}) {
  const layers = useMemo(() => {
    if (!source) return [];
    try {
      const ast = parseSource(source);
      const root = findRootJSXElement(ast);
      if (!root) return [];
      const out: { path: string; depth: number; tag: string; className: string }[] = [];
      walkJSX(root, (el, p) => {
        const depth = p.split(".").length - 1;
        const name = el.openingElement.name;
        let tag = "?";
        if (t.isJSXIdentifier(name)) tag = name.name;
        const attr = getJSXAttr(el, "className");
        let cls = "";
        if (attr) {
          const v = attr.value;
          if (t.isStringLiteral(v)) cls = v.value;
          else if (t.isJSXExpressionContainer(v) && t.isStringLiteral(v.expression)) {
            cls = v.expression.value;
          }
        }
        out.push({ path: p, depth, tag, className: cls });
      });
      return out;
    } catch {
      return [];
    }
  }, [source]);

  return (
    <Group title="Layers">
      <div className="flex flex-col">
        {layers.map((l) => {
          const active = l.path === selectedPath;
          const clsPreview = l.className
            .split(/\s+/)
            .filter(Boolean)
            .map((c) => `.${c}`)
            .join("");
          return (
            <button
              key={l.path}
              onClick={() => onSelect(l.path)}
              className={
                "group flex items-center gap-1 rounded px-1 py-0.5 text-left text-[10.5px] " +
                (active ? "bg-accent-tint" : "hover:bg-panel-soft")
              }
              style={{ paddingLeft: 4 + l.depth * 10 }}
            >
              <AppIcon
                name="ChevronDown"
                size={10}
                className="shrink-0 text-ink-faint"
              />
              <span className="font-mono text-pink-600">&lt;{l.tag}&gt;</span>
              <span className="min-w-0 flex-1 truncate font-mono text-ink-muted">
                {clsPreview}
              </span>
              <AppIcon
                name="Eye"
                size={10}
                className="shrink-0 text-ink-faint opacity-0 group-hover:opacity-100"
              />
            </button>
          );
        })}
      </div>
    </Group>
  );
}
