export function RightPanel() {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-panel text-xs">
      <div className="border-b border-border px-3 py-2 font-medium uppercase tracking-wide text-muted">
        Inspector
      </div>
      <div className="flex-1 px-3 py-2 text-muted">
        Select an element to edit its properties.
      </div>
    </aside>
  );
}
