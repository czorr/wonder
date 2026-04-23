// ---------------------------------------------------------------------------
// "Extract from components" modal — the interactive half of DS-Extract.
//
// Workflow:
//   1. On open, run `extractFromSources` over the current project.
//   2. Seed per-row assignments with `suggestAssignments` (greedy match by
//      family kind + shade tier).
//   3. Let the user override each row's target via dropdown.
//   4. "Apply" calls `applyExtraction` (pure) and dispatches the single
//      store action `applyDesignSystemExtraction` so undo rolls everything
//      back in one step.
//
// Scope explicitly limited to colors: see the header comment in extract.ts
// for what's intentionally out of scope (fonts, radii, arbitrary values).
// ---------------------------------------------------------------------------

import { useMemo, useState, useEffect } from "react";
import { AppIcon } from "@/app/icons";
import { useProject } from "@/store/project";
import {
  applyExtraction,
  extractFromSources,
  suggestAssignments,
  type Assignment,
  type ExtractedColor,
} from "@/project/extract";

type Props = { onClose: () => void };

export function ExtractDesignSystemModal({ onClose }: Props) {
  const components = useProject((s) => s.components);
  const order = useProject((s) => s.order);
  const tokens = useProject((s) => s.tokens);
  const applyDs = useProject((s) => s.applyDesignSystemExtraction);

  // Run the analyzer once per open. Components can mutate under us while the
  // modal is open (agent editing in background), but we freeze the snapshot
  // on mount — re-running mid-flow would shuffle the user's assignments.
  const extraction = useMemo(
    () => extractFromSources(components, order),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [assignments, setAssignments] = useState<Assignment[]>(() =>
    suggestAssignments(extraction.colors, tokens),
  );

  // Esc to close — standard modal behavior.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const activeAssignments = assignments.filter((a) => a.target !== null);
  const componentsAffected = useMemo(() => {
    const affected = new Set<string>();
    for (const asn of activeAssignments) {
      const found = extraction.colors.find(
        (c) => c.paletteName === asn.paletteName,
      );
      if (found) for (const id of found.componentIds) affected.add(id);
    }
    return affected.size;
  }, [activeAssignments, extraction.colors]);

  const apply = () => {
    const result = applyExtraction({
      components,
      order,
      tokens,
      assignments,
    });
    applyDs({ tokens: result.tokens, sources: result.sources });
    onClose();
  };

  // Build the dropdown option list once from current tokens. Every existing
  // family × (DEFAULT + named shades) is pickable, plus "skip". Intentionally
  // static within the session — if the user wants a brand new family they
  // exit, create it in the panel, and re-open extraction.
  const dropdownOptions = useMemo(() => buildTargetOptions(tokens), [tokens]);

  const setRow = (paletteName: string, target: Assignment["target"]) => {
    setAssignments((prev) =>
      prev.map((a) =>
        a.paletteName === paletteName ? { ...a, target } : a,
      ),
    );
  };

  const skipAll = () =>
    setAssignments((prev) => prev.map((a) => ({ ...a, target: null })));

  const rerunSuggest = () =>
    setAssignments(suggestAssignments(extraction.colors, tokens));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[85vh] w-[720px] flex-col overflow-hidden rounded-xl border border-stroke bg-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stroke px-4 py-3">
          <div className="flex items-center gap-2">
            <AppIcon name="Sparkles" size={14} className="text-accent" />
            <span className="text-[13px] font-semibold text-ink">
              Extract design system from components
            </span>
          </div>
          <button
            onClick={onClose}
            className="grid size-6 place-items-center rounded-md text-ink-muted hover:bg-panel-soft hover:text-ink"
          >
            <AppIcon name="X" size={14} />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-stroke bg-panel-soft px-4 py-2 text-[11.5px] text-ink-muted">
          <span>
            Found{" "}
            <span className="font-semibold text-ink">
              {extraction.colors.length}
            </span>{" "}
            palette colors across{" "}
            <span className="font-semibold text-ink">{order.length}</span>{" "}
            components. Assign each to a token, or skip to leave the class
            as-is. Renames happen inside <code className="font-mono">className</code>{" "}
            strings — dynamic classes (<code className="font-mono">cn()</code>,
            template literals) are not touched.
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={rerunSuggest}
              className="rounded-md px-2 py-1 text-[10.5px] text-ink-muted hover:bg-panel hover:text-ink"
            >
              Re-suggest
            </button>
            <button
              onClick={skipAll}
              className="rounded-md px-2 py-1 text-[10.5px] text-ink-muted hover:bg-panel hover:text-ink"
            >
              Skip all
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {extraction.unparseableIds.length > 0 ? (
            <div className="mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[10.5px] text-amber-900">
              {extraction.unparseableIds.length} component(s) failed to parse
              and were skipped: {extraction.unparseableIds.join(", ")}. Fix
              the source or re-run.
            </div>
          ) : null}

          {extraction.colors.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-10 text-[11px] text-ink-faint">
              No palette colors found. Add some
              <code className="mx-1 font-mono">bg-*</code> /
              <code className="mx-1 font-mono">text-*</code> classes in your
              components first.
            </div>
          ) : (
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-ink-faint">
                <tr className="border-b border-stroke">
                  <th className="px-4 py-2 text-left font-medium">Color</th>
                  <th className="px-4 py-2 text-left font-medium">Usage</th>
                  <th className="px-4 py-2 text-left font-medium">Target</th>
                  <th className="px-4 py-2 text-left font-medium">Rewrite</th>
                </tr>
              </thead>
              <tbody>
                {extraction.colors.map((color) => {
                  const asn = assignments.find(
                    (a) => a.paletteName === color.paletteName,
                  );
                  return (
                    <ColorRow
                      key={color.paletteName}
                      color={color}
                      assignment={asn?.target ?? null}
                      options={dropdownOptions}
                      onChange={(t) => setRow(color.paletteName, t)}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-stroke bg-panel px-4 py-3">
          <span className="text-[10.5px] text-ink-muted">
            {activeAssignments.length} assignment
            {activeAssignments.length === 1 ? "" : "s"} across{" "}
            {componentsAffected} component
            {componentsAffected === 1 ? "" : "s"}. Undo rolls the whole batch
            back.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-[12px] font-medium text-ink-soft hover:bg-panel-soft"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              disabled={activeAssignments.length === 0}
              className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply {activeAssignments.length > 0 ? activeAssignments.length : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function ColorRow({
  color,
  assignment,
  options,
  onChange,
}: {
  color: ExtractedColor;
  assignment: { family: string; shade: string } | null;
  options: TargetOption[];
  onChange: (t: Assignment["target"]) => void;
}) {
  const valueKey = assignment
    ? `${assignment.family}.${assignment.shade}`
    : "__skip__";

  const rewritePreview = assignment
    ? (assignment.shade === "DEFAULT"
        ? `bg-${color.paletteName} → bg-${assignment.family}`
        : `bg-${color.paletteName} → bg-${assignment.family}-${assignment.shade}`)
    : null;

  return (
    <tr className="border-b border-stroke/60 last:border-b-0 hover:bg-panel-soft/40">
      <td className="px-4 py-2 align-middle">
        <div className="flex items-center gap-2">
          <span
            className="size-5 shrink-0 rounded-[4px] border border-stroke"
            style={{
              backgroundColor:
                color.hex === "transparent" ? "transparent" : color.hex,
              backgroundImage:
                color.hex === "transparent"
                  ? "linear-gradient(45deg,#eee 25%,transparent 25%,transparent 75%,#eee 75%),linear-gradient(45deg,#eee 25%,transparent 25%,transparent 75%,#eee 75%)"
                  : undefined,
              backgroundSize: "6px 6px",
              backgroundPosition: "0 0, 3px 3px",
            }}
          />
          <div className="flex flex-col">
            <span className="font-mono text-[11px] text-ink">
              {color.paletteName}
            </span>
            <span className="font-mono text-[9.5px] uppercase text-ink-faint">
              {color.hex}
            </span>
          </div>
        </div>
      </td>
      <td className="px-4 py-2 align-middle">
        <div className="flex flex-col">
          <span className="text-[11px] text-ink">
            {color.count} {color.count === 1 ? "use" : "uses"}
          </span>
          <span className="text-[10px] text-ink-faint">
            in {color.componentIds.length} component
            {color.componentIds.length === 1 ? "" : "s"}
          </span>
        </div>
      </td>
      <td className="px-4 py-2 align-middle">
        <select
          value={valueKey}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__skip__") onChange(null);
            else {
              const [family, shade] = v.split(".");
              onChange({ family, shade });
            }
          }}
          className="w-full rounded-md border border-stroke bg-panel px-2 py-1 text-[11px] text-ink outline-none focus:border-accent"
        >
          <option value="__skip__">Skip</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2 align-middle">
        {rewritePreview ? (
          <div className="flex items-center gap-1 font-mono text-[10px]">
            <span className="text-ink-muted">bg-{color.paletteName}</span>
            <AppIcon name="ArrowRight" size={10} className="text-ink-faint" />
            <span className="rounded bg-accent-tint px-1 py-0.5 text-accent-ink">
              bg-
              {assignment!.shade === "DEFAULT"
                ? assignment!.family
                : `${assignment!.family}-${assignment!.shade}`}
            </span>
          </div>
        ) : (
          <span className="flex items-center gap-1 text-[10px] text-ink-faint">
            <AppIcon name="CircleSlash" size={10} /> leave as-is
          </span>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Target options derived from current tokens.
//
// We list every family.shade that ALREADY exists, plus the standard "soft"
// / "tint" / "ink" extension slots for each family (these may not exist yet
// but are reasonable extension points). Creating a brand-new family inline
// would bloat the modal; users do that in the Design System panel and
// re-open the modal.
// ---------------------------------------------------------------------------

type TargetOption = { value: string; label: string };

function buildTargetOptions(tokens: {
  colors: Record<string, Record<string, string>>;
}): TargetOption[] {
  const out: TargetOption[] = [];
  const standardExtensions = ["soft", "tint", "ink", "raised", "sunken"];

  for (const family of Object.keys(tokens.colors)) {
    const shades = tokens.colors[family];
    // DEFAULT first
    const keys = ["DEFAULT", ...Object.keys(shades).filter((k) => k !== "DEFAULT")];
    const seen = new Set<string>();
    for (const shade of keys) {
      if (seen.has(shade)) continue;
      seen.add(shade);
      out.push({
        value: `${family}.${shade}`,
        label:
          shade === "DEFAULT"
            ? `${family} (DEFAULT)`
            : `${family}-${shade}`,
      });
    }
    // Offer extension slots (soft/tint/ink/raised/sunken) the family doesn't
    // have yet — these feel natural enough that pre-populating them beats
    // forcing a panel detour.
    for (const ext of standardExtensions) {
      if (seen.has(ext)) continue;
      out.push({
        value: `${family}.${ext}`,
        label: `${family}-${ext}  (new shade)`,
      });
    }
  }
  return out;
}
