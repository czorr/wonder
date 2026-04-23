// ---------------------------------------------------------------------------
// PixelGridLoader.
//
// 3×3 pixel-grid spinner rendered on top of a component while the agent is
// editing it. The centre pixel stays lit at full opacity and the 8 perimeter
// pixels chase each other clockwise — each pixel runs the same
// `pixgrid-pulse` keyframe (opacity 0.18 → 1) with a staggered delay so the
// effect reads as a rotating ring.
//
// Keyframes live in `src/styles/globals.css` so the animation survives HMR
// without needing a <style> tag per instance.
//
// Inspired by github.com/czorr/pixgrid — Wonder-sized (small) and tinted
// with our accent green (#10b981).
// ---------------------------------------------------------------------------

type Props = {
  /** Pixel size in px. Defaults to 6 — legible on canvas overlays. */
  pixel?: number;
  /** Gap between pixels in px. Defaults to 2. */
  gap?: number;
  /** Cycle duration in ms. Defaults to 1200. */
  duration?: number;
};

// Indices of the 3×3 grid traversed clockwise starting from top-left.
// Used to assign the animation-delay so the "lit" pixel appears to rotate.
//   0 1 2
//   3 4 5
//   6 7 8
const CLOCKWISE = [0, 1, 2, 5, 8, 7, 6, 3];

export function PixelGridLoader({
  pixel = 6,
  gap = 2,
  duration = 1200,
}: Props) {
  const step = duration / CLOCKWISE.length;

  return (
    <div
      className="grid grid-cols-3"
      style={{ gap, width: pixel * 3 + gap * 2, height: pixel * 3 + gap * 2 }}
      role="status"
      aria-label="Editing"
    >
      {Array.from({ length: 9 }).map((_, i) => {
        const isCenter = i === 4;
        const orderIdx = CLOCKWISE.indexOf(i);
        const style: React.CSSProperties = {
          width: pixel,
          height: pixel,
          backgroundColor: "var(--color-accent)",
          borderRadius: 1,
        };
        if (!isCenter) {
          style.animation = `pixgrid-pulse ${duration}ms ease-in-out infinite`;
          style.animationDelay = `${orderIdx * step}ms`;
        }
        return <span key={i} style={style} />;
      })}
    </div>
  );
}
