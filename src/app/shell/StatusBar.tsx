import { GitBranch } from "lucide-react";

export function StatusBar() {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t border-stroke bg-panel px-3 text-[10.5px] text-ink-muted">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-accent" />
          sandbox · ready
        </span>
        <Sep />
        <span>esbuild 42ms</span>
        <Sep />
        <span>tailwind 18ms</span>
        <Sep />
        <span className="text-ink-faint">v4.0.3</span>
      </div>
      <div className="flex items-center gap-3">
        <span>5 components</span>
        <Sep />
        <span>autosave · 2s ago</span>
        <Sep />
        <span>50 snapshots</span>
        <Sep />
        <span className="flex items-center gap-1">
          <GitBranch size={11} strokeWidth={1.75} />
          main
        </span>
      </div>
    </div>
  );
}

function Sep() {
  return <span className="text-ink-faint">·</span>;
}
