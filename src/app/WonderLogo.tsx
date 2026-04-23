// ---------------------------------------------------------------------------
// Wonder brand mark.
//
// The logo artwork is a square with its own green background baked in — it
// is NOT a transparent glyph. That means wherever we show it we need to
// clip the corners so it reads as an app icon, not a raw PNG. Corner
// radius scales with the display size following the iOS-ish 22% rule,
// clamped at both ends so tiny (16px) marks still look crisp and big
// (128px) marks don't go round-rect-into-circle.
//
// Usage:
//   <WonderLogo size={18} />         // header chrome
//   <WonderLogo size={56} />         // launcher hero
//   <WonderLogo size={128} shadow /> // splash surfaces
//
// Intentional limits:
//   - No color/tint prop — the mark is brand-locked to its green.
//   - No text variant (wordmark + logo). Consumers compose that themselves
//     with a <span>.
// ---------------------------------------------------------------------------

import logoUrl from "@/assets/wonder-logo.png";

export type WonderLogoProps = {
  /** Pixel size of the square. Radius is derived from this. */
  size: number;
  /** Drop a soft brand-tinted shadow (for marketing/launcher surfaces). */
  shadow?: boolean;
  className?: string;
  alt?: string;
};

/**
 * Compute a corner radius that feels right at the given size. Roughly
 * 22% of width (Apple's squircle target), clamped so micro and XL
 * renderings stay legible.
 *
 *   16px → 4px   (toolbar/menu)
 *   24px → 5px
 *   32px → 7px
 *   56px → 12px  (launcher hero)
 *   96px → 21px
 *   128px → 28px (splash)
 */
function radiusForSize(size: number): number {
  const raw = Math.round(size * 0.22);
  // Floor stops 16→4 from collapsing visually at DPI boundaries; ceiling
  // stops huge marks from looking like lozenges.
  return Math.min(Math.max(raw, 3), 32);
}

export function WonderLogo({
  size,
  shadow,
  className,
  alt = "Wonder",
}: WonderLogoProps) {
  const radius = radiusForSize(size);
  return (
    <img
      src={logoUrl}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      className={
        "shrink-0 select-none" +
        (shadow
          ? " shadow-[0_10px_30px_-10px_rgba(16,185,129,0.5)]"
          : "") +
        (className ? " " + className : "")
      }
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        // Hint the browser to skip dragging the raw image — we've already
        // got drag semantics on parent elements (tauri window-drag,
        // component cards, etc.).
        WebkitUserDrag: "none",
      } as React.CSSProperties}
    />
  );
}
