import {
  ChevronDown,
  ChevronRight,
  Code2,
  Eye,
  Layers,
  Paintbrush,
  Plus,
  Search,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useProject } from "@/store/project";
import {
  getClassNameAtPath,
  setClassAtPath,
} from "@/ast/tailwind";
import { PALETTE, PALETTE_BY_NAME, type PaletteColor } from "@/ast/palette";
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

const TEXT_ALIGNS = [
  { value: "text-left", icon: AlignLeft },
  { value: "text-center", icon: AlignCenter },
  { value: "text-right", icon: AlignRight },
  { value: "text-justify", icon: AlignJustify },
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

export function RightPanel() {
  const components = useProject((s) => s.components);
  const selectedId = useProject((s) => s.selectedComponentId);
  const selectedPath = useProject((s) => s.selectedElementPath);
  const selectElement = useProject((s) => s.selectElement);
  const setSource = useProject((s) => s.setSource);

  const [state, setState] = useState<string>("base");

  const component = selectedId ? components[selectedId] : null;
  const path = selectedPath ?? "0";

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

  const swap = (oldClass: string | undefined, next: string) => {
    if (!component) return;
    try {
      const updated = setClassAtPath(
        component.source,
        path,
        oldClass ?? next,
        next,
      );
      setSource(component.id, updated);
    } catch (e) {
      console.error(e);
    }
  };

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
        <PanelTab icon={Paintbrush} label="Design" active />
        <PanelTab icon={Code2} label="Props" />
        <PanelTab icon={Layers} label="Layers" />
      </div>

      <div className="flex items-center gap-1 border-b border-stroke px-3 py-2 text-[10.5px] text-ink-muted">
        <span>{component?.name ?? "—"}</span>
        <ChevronRight size={10} className="text-ink-faint" strokeWidth={2} />
        <span className="font-mono text-[10px] text-ink-faint">{path}</span>
      </div>

      <div className="flex-1 overflow-auto">
        <Group title="Sizing">
          <DualRow label="Width">
            <InputBox
              value={stripPrefix(currentWidth, "w-") ?? "auto"}
              hint={currentWidth ?? "—"}
              onCommit={(v) => swap(currentWidth, `w-${v}`)}
            />
            <InputBox value="100" hint="%" readOnly />
          </DualRow>
          <DualRow label="Height">
            <InputBox
              value={stripPrefix(currentHeight, "h-") ?? "auto"}
              hint={currentHeight ?? "—"}
              onCommit={(v) => swap(currentHeight, `h-${v}`)}
            />
            <InputBox value="—" hint="" readOnly />
          </DualRow>
        </Group>

        <Group title="Spacing">
          <DualRow label="Padding">
            <SpacingSelect
              current={currentPadding}
              prefix="p"
              onChange={(v) => swap(currentPadding, v)}
            />
            <InputBox
              value={String(spacingPx(currentPadding, "p-") ?? 0)}
              hint="px"
              readOnly
            />
          </DualRow>
          <DualRow label="Gap">
            <SpacingSelect
              current={currentGap}
              prefix="gap"
              onChange={(v) => swap(currentGap, v)}
            />
            <InputBox
              value={String(spacingPx(currentGap, "gap-") ?? 0)}
              hint="px"
              readOnly
            />
          </DualRow>
        </Group>

        <Group title="Typography">
          <DualRow label="Family">
            <InputBox value="Inter" hint="font-sans" readOnly full />
          </DualRow>
          <DualRow label="Size">
            <SelectBox
              value={currentSize ?? "text-base"}
              hint={String(TEXT_SIZES.find((s) => s.value === currentSize)?.px ?? 16)}
              options={TEXT_SIZES.map((s) => ({
                value: s.value,
                label: s.value.replace("text-", ""),
                right: `${s.px}px`,
              }))}
              onChange={(v) => swap(currentSize, v)}
            />
            <InputBox
              value={String(TEXT_SIZES.find((s) => s.value === currentSize)?.px ?? 16)}
              hint={
                TEXT_SIZES.find((s) => s.value === currentSize)?.lh ?? "leading-6"
              }
              readOnly
            />
          </DualRow>
          <DualRow label="Weight">
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
              onChange={(v) => swap(currentWeight, v)}
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
                const Icon = a.icon;
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
                    <Icon size={13} strokeWidth={1.75} />
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
              onChange={(name) => swap(currentBg, `bg-${name}`)}
              full
            />
          </DualRow>
          <DualRow label="Text">
            <ColorDropdown
              color={textColor}
              onChange={(name) => swap(currentTextColor, `text-${name}`)}
              full
            />
          </DualRow>
          <DualRow label="Border">
            <ColorDropdown
              color={borderColor}
              placeholder="none"
              onChange={(name) => swap(currentBorderColor, `border-${name}`)}
              full
            />
          </DualRow>
          <div className="col-span-2 -mx-0 mt-1 flex items-center gap-1">
            {STATE_TABS.map((s) => {
              const active = s === state;
              return (
                <button
                  key={s}
                  onClick={() => setState(s)}
                  className={
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] " +
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
        </Group>

        <Group title="Borders">
          <DualRow label="Radius">
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
              onChange={(v) => swap(currentRadius, v)}
            />
            <InputBox value="all" hint="—" readOnly />
          </DualRow>
          <DualRow label="Width">
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
              onChange={(v) => swap(currentBorderW, v)}
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
  headerRight,
}: {
  title: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="border-b border-stroke">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-ink-soft"
        >
          <Chevron size={11} strokeWidth={2} className="text-ink-faint" />
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

function AddButton() {
  return (
    <button className="flex items-center gap-0.5 text-[10px] text-ink-muted hover:text-ink">
      <Plus size={11} strokeWidth={2} /> Add
    </button>
  );
}

function DualRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[46px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5">
      <span className="truncate text-[10.5px] text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

function InputBox({
  value,
  hint,
  readOnly,
  full,
  onCommit,
}: {
  value: string;
  hint: string;
  readOnly?: boolean;
  full?: boolean;
  onCommit?: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);
  return (
    <div
      className={
        "flex h-7 items-center gap-1 rounded-md border border-stroke bg-white px-2 " +
        (full ? "col-span-2 " : "") +
        (readOnly ? "opacity-100" : "focus-within:border-accent")
      }
    >
      <input
        value={local}
        readOnly={readOnly}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onCommit?.(local)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="min-w-0 flex-1 bg-transparent text-[11px] text-ink outline-none"
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
}: {
  value: string;
  hint: string;
  options: { value: string; label: string; right?: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useOutsideClick<HTMLDivElement>(open, () => setOpen(false));
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-full items-center gap-1 rounded-md border border-stroke bg-white px-2 hover:border-stroke-strong"
      >
        <span className="min-w-0 flex-1 truncate text-left text-[11px] text-ink">
          {hint}
        </span>
        <span className="shrink-0 text-[10px] font-mono text-ink-faint">
          {value.replace(/^text-|^font-|^rounded-?|^border-?/, "") || value}
        </span>
        <ChevronDown size={11} className="text-ink-faint" strokeWidth={2} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 rounded-md border border-stroke bg-white p-1 shadow-lg">
          <div className="flex items-center gap-1 rounded border border-stroke bg-panel-soft px-1.5 py-1">
            <Search size={11} className="text-ink-faint" strokeWidth={2} />
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
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
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
}: {
  current: string | undefined;
  prefix: string;
  onChange: (v: string) => void;
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
    />
  );
}

function ColorDropdown({
  color,
  onChange,
  placeholder,
  full,
}: {
  color: PaletteColor | undefined;
  onChange: (name: string) => void;
  placeholder?: string;
  full?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useOutsideClick<HTMLDivElement>(open, () => setOpen(false));
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
        onClick={() => setOpen((o) => !o)}
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
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 rounded-md border border-stroke bg-white p-1 shadow-lg">
          <div className="flex items-center gap-1 rounded border border-stroke bg-panel-soft px-1.5 py-1">
            <Search size={11} className="text-ink-faint" strokeWidth={2} />
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
                  onClick={() => {
                    onChange(p.name);
                    setOpen(false);
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
              <ChevronDown
                size={10}
                strokeWidth={2}
                className="shrink-0 text-ink-faint"
              />
              <span className="font-mono text-pink-600">&lt;{l.tag}&gt;</span>
              <span className="min-w-0 flex-1 truncate font-mono text-ink-muted">
                {clsPreview}
              </span>
              <Eye
                size={10}
                strokeWidth={1.75}
                className="shrink-0 text-ink-faint opacity-0 group-hover:opacity-100"
              />
            </button>
          );
        })}
      </div>
    </Group>
  );
}
