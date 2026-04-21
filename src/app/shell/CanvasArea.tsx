export function CanvasArea() {
  return (
    <section className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-bg">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="relative text-center text-muted">
        <div className="text-sm">Canvas</div>
        <div className="mt-1 text-xs opacity-70">
          tldraw lands here in Sprint 1
        </div>
      </div>
    </section>
  );
}
