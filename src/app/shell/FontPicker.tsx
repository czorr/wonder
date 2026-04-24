// ---------------------------------------------------------------------------
// FontPicker — searchable dropdown for assigning a Google Font to a token.
//
// Used from TokensStudio's FontCard. Behavior:
//
//   - Shows the active primary family at the top of the card (read from
//     the stack via `primaryFamily`).
//   - Clicking the card opens a popover with a search input + filtered
//     list, keyboard-navigable (↑/↓/Enter/Esc).
//   - Each row renders its own name IN THE FONT IT REPRESENTS, and it
//     preloads that font on first hover/render via a dynamic <link>
//     injection. That gives the user an instant "yes, this is the font
//     I'm clicking on" signal without having to commit first.
//   - Picking a font calls `onPick(fontName)`. The parent builds the
//     final stack (role-aware fallback chain) and commits to tokens.
//   - A "Use custom stack…" escape hatch toggles into a free-form
//     textarea mode, same behavior as before — nothing the picker does
//     blocks advanced users from writing raw stacks.
// ---------------------------------------------------------------------------

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { AppIcon } from "@/app/icons";
import {
  GOOGLE_FONTS,
  googleFontsHref,
  isKnownGoogleFont,
  type GoogleFont,
  type GoogleFontCategory,
} from "@/project/googleFonts";

type Props = {
  /** Active primary family ("" if the stack starts with a system font). */
  value: string;
  /** Called when the user picks a Google Font. The parent reshapes the stack. */
  onPick: (name: string) => void;
  /**
   * Category filter applied to the list. Sans role → all categories except
   * monospace; mono → monospace only; display → serif + display. Narrowing
   * up front keeps the list relevant and makes scrolling feasible.
   */
  allowedCategories: ReadonlySet<GoogleFontCategory>;
  /** Human-readable role name, used in the picker header. */
  roleLabel: string;
};

// One global registry of "which Google Font names have had a preview link
// installed" — prevents the picker from re-adding <link>s every time it
// opens. The same dataset the main ProjectTokensStyle maintains is a
// SUPERSET of this (only fonts actually referenced by tokens), but here we
// preload every visible row so hover previews are instantaneous.
const PREVIEW_ATTR = "data-wonder-font-preview";
function ensurePreviewFont(name: string) {
  if (typeof document === "undefined") return;
  const existing = document.querySelector(`link[${PREVIEW_ATTR}="${name}"]`);
  if (existing) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = googleFontsHref([name]);
  link.setAttribute(PREVIEW_ATTR, name);
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
}

export function FontPicker({ value, onPick, allowedCategories, roleLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GOOGLE_FONTS.filter((f) => allowedCategories.has(f.category)).filter(
      (f) => !q || f.family.toLowerCase().includes(q),
    );
  }, [query, allowedCategories]);

  // Dismiss on outside click / Escape so the picker doesn't get stuck.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Focus the search input when the popover opens.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Preload font files for rows currently visible. We use an
  // IntersectionObserver on each row so only what the user actually scrolls
  // past gets requested — opening the picker and typing "Inter" shouldn't
  // kick off 150 parallel requests. Each observed row triggers
  // `ensurePreviewFont` exactly once.
  useEffect(() => {
    if (!open) return;
    const root = listRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const name = entry.target.getAttribute("data-font-name");
          if (name) ensurePreviewFont(name);
          observer.unobserve(entry.target);
        }
      },
      { root, rootMargin: "40px" },
    );
    root
      .querySelectorAll<HTMLElement>("[data-font-name]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [open, filtered]);

  // Keep the active index in range as the filter changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const commit = (name: string) => {
    onPick(name);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[activeIndex];
      if (pick) commit(pick.family);
    }
  };

  const displayLabel = value && isKnownGoogleFont(value) ? value : value || "— pick a font —";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-stroke bg-panel px-3 py-2 text-[12px] text-ink hover:border-stroke-strong"
      >
        <span className="flex items-center gap-2 truncate">
          <AppIcon name="Type" size={12} className="text-ink-faint" />
          <span className="truncate">{displayLabel}</span>
          {value && !isKnownGoogleFont(value) ? (
            <span className="rounded-full bg-panel-soft px-1.5 py-0.5 text-[9px] text-ink-faint">
              system / custom
            </span>
          ) : null}
        </span>
        <AppIcon
          name={open ? "ChevronUp" : "ChevronDown"}
          size={12}
          className="text-ink-faint"
        />
      </button>

      {open ? (
        <div
          ref={popoverRef}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 rounded-lg border border-stroke bg-panel shadow-lg"
        >
          <div className="flex items-center gap-2 border-b border-stroke px-3 py-2">
            <AppIcon name="Search" size={12} className="text-ink-faint" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Search Google Fonts for ${roleLabel}…`}
              className="flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-faint"
            />
            <span className="text-[10px] text-ink-faint">
              {filtered.length} / {GOOGLE_FONTS.filter((f) => allowedCategories.has(f.category)).length}
            </span>
          </div>
          <div
            ref={listRef}
            className="max-h-[320px] overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-ink-faint">
                No matches. Not in our catalog? Type the name directly in the
                custom stack below — the loader will fetch it from Google.
              </div>
            ) : (
              filtered.map((f, i) => (
                <FontRow
                  key={f.family}
                  font={f}
                  active={i === activeIndex}
                  selected={f.family === value}
                  onHover={() => setActiveIndex(i)}
                  onClick={() => commit(f.family)}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FontRow({
  font,
  active,
  selected,
  onHover,
  onClick,
}: {
  font: GoogleFont;
  active: boolean;
  selected: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  return (
    <div
      data-font-name={font.family}
      onMouseEnter={onHover}
      onClick={onClick}
      className={
        "flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 " +
        (active ? "bg-panel-soft" : "hover:bg-panel-soft")
      }
    >
      <div className="flex min-w-0 flex-col">
        <span
          className="truncate text-[14px] text-ink"
          style={{ fontFamily: `"${font.family}"` }}
        >
          {font.family}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-ink-faint">
          {font.category}
        </span>
      </div>
      {selected ? (
        <AppIcon name="Check" size={12} className="text-accent" />
      ) : null}
    </div>
  );
}
