export function Topbar() {
  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-panel px-3">
      <div className="flex items-center gap-2">
        <div className="size-5 rounded-sm bg-accent" />
        <span className="text-sm font-medium tracking-tight">Wonder</span>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted">
        <span>Untitled project</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>Sprint 0 · spike</span>
      </div>
    </header>
  );
}
