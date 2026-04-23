// ---------------------------------------------------------------------------
// LibraryPanel — the "Library" tab in the left sidebar.
//
// Renders every component in the project as a live thumbnail: each tile
// mounts a real Sandbox iframe running the actual bundled source, scaled
// down via CSS transform. The user sees exactly what the component looks
// like, not a cached screenshot that goes stale.
//
// Performance strategy:
//   - Iframes are expensive. We mount them lazily via IntersectionObserver
//     — a tile off-screen is just a placeholder. Scroll past the fold,
//     tiles light up; scroll back, they stay mounted (unmounting would
//     cause a flash and defeat the point).
//   - One bundle per component, cached until the source changes. Avoids
//     re-compiling the same JSX every time the panel re-renders.
//   - Tokens CSS is pushed on every token change so color/font edits
//     propagate to thumbnails in real time. Matches ComponentFrame.
//
// Interaction:
//   - Click      → select the component on the canvas + scroll into view.
//   - Drag       → drops onto any container as a full <MyComponent /> via
//                  the same primitive-drop MIME the sidebar uses. Lets
//                  users compose pages by dragging smaller pieces into
//                  bigger ones.
//
// What it is NOT (yet):
//   - A cross-project browser. Scope is the CURRENT project only —
//     future work is a shared "system" library pulled from a registry.
//   - A detail view. Clicking opens the component on the canvas; we don't
//     have a dedicated inspector here.
// ---------------------------------------------------------------------------

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppIcon } from "@/app/icons";
import { useProject, type WonderComponent } from "@/store/project";
import { Sandbox, type SandboxHandle } from "@/sandbox/Sandbox";
import { bundle } from "@/sandbox/bundler";
import { resolveAssets } from "@/sandbox/assetResolver";
import { useAssets } from "@/store/assets";
import { useTheme } from "@/store/theme";
import { tokensToSandboxCss } from "@/project/tokens";
import { isPrimitiveFolder } from "@/project/primitives";

type Filter = "all" | "primitives" | "components";

export function LibraryPanel() {
  const components = useProject((s) => s.components);
  const order = useProject((s) => s.order);
  const selectComponent = useProject((s) => s.selectComponent);
  const tokens = useProject((s) => s.tokens);
  const tokensCss = useMemo(() => tokensToSandboxCss(tokens), [tokens]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = order
      .map((id) => components[id])
      .filter(Boolean) as WonderComponent[];
    return rows.filter((c) => {
      const isPrim = isPrimitiveFolder(c.folder);
      if (filter === "primitives" && !isPrim) return false;
      if (filter === "components" && isPrim) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.filename.toLowerCase().includes(q)
      );
    });
  }, [components, order, query, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-md border border-stroke bg-panel-soft px-2 py-1.5 transition focus-within:border-accent/40 focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.08)]">
          <AppIcon name="Search" size={12} className="text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search library…"
            className="flex-1 bg-transparent text-[11px] text-ink placeholder:text-ink-faint outline-none"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              title="Clear"
              className="grid size-4 place-items-center rounded text-ink-faint hover:bg-stroke hover:text-ink-muted"
            >
              <AppIcon name="X" size={10} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1 px-3 pt-3">
        {(
          [
            ["all", "All"],
            ["primitives", "Primitives"],
            ["components", "Components"],
          ] as const
        ).map(([key, label]) => {
          const active = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={
                "rounded-full px-2 py-0.5 text-[10.5px] font-medium transition " +
                (active
                  ? "bg-ink text-panel"
                  : "text-ink-muted hover:bg-panel-soft hover:text-ink")
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 py-3">
        {list.length === 0 ? (
          <div className="mx-1 flex items-center gap-2 rounded-md border border-dashed border-stroke bg-panel-soft/40 px-3 py-4 text-[11px] text-ink-faint">
            <AppIcon name="Library" size={13} className="text-ink-faint" />
            <span>
              {query
                ? "Nothing matches your search."
                : "No components in this project yet."}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {list.map((c) => (
              <LibraryTile
                key={c.id}
                component={c}
                tokensCss={tokensCss}
                onSelect={() => selectComponent(c.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single tile. Boots into a lightweight placeholder and upgrades to a
// live Sandbox iframe the first time the user scrolls it into view.
// ---------------------------------------------------------------------------

/** Target draw size of the live iframe. We render the component at full
 *  desktop-ish width and then scale the whole frame down with CSS
 *  `transform`. Scaling (instead of resizing the iframe) keeps the
 *  component's own breakpoints intact — a md:flex layout still shows its
 *  md: state even though the tile is tiny. */
const TILE_RENDER_WIDTH = 480;
const TILE_RENDER_HEIGHT = 320;

function LibraryTile({
  component,
  tokensCss,
  onSelect,
}: {
  component: WonderComponent;
  tokensCss: string;
  onSelect: () => void;
}) {
  const hostRef = useRef<HTMLButtonElement | null>(null);
  const sandboxRef = useRef<SandboxHandle | null>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const assetsVersion = useAssets(
    (s) => s.order.length + "|" + s.order.join(","),
  );

  // IntersectionObserver — once the tile pokes into the viewport, flip
  // `visible` and mount the iframe. We never un-flip; unmounting would
  // cause a jarring flash when the user scrolls back up, and the memory
  // cost of a handful of mounted iframes is fine for a library view.
  useEffect(() => {
    const node = hostRef.current;
    if (!node || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px 0px" }, // warm up just below the fold
    );
    io.observe(node);
    return () => io.disconnect();
  }, [visible]);

  // Push tokens + bundled source whenever anything reachable changes.
  // Guarded by `ready` so we don't double-render before the iframe has
  // announced itself (Sandbox buffers pre-ready payloads, but the extra
  // render would just get thrown away).
  useEffect(() => {
    if (!ready) return;
    sandboxRef.current?.setTokensCss(tokensCss);
  }, [ready, tokensCss]);

  // Thumbnails flip with the app theme so the library faithfully reflects
  // what the user will see on the canvas. Pre-ready-safe via the Sandbox
  // handle's buffer — a tile that mounts while we're in dark mode boots
  // straight into its dark palette.
  const theme = useTheme((s) => s.theme);
  useEffect(() => {
    sandboxRef.current?.setTheme(theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const resolved = resolveAssets(component.source);
      const res = await bundle(resolved);
      if (cancelled) return;
      if (res.ok) sandboxRef.current?.render(res.code);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, component.source, assetsVersion]);

  /** Drag-out: mirrors the primitive payload so the canvas drop handler
   *  can insert the component as a JSX reference. We emit a
   *  `<ComponentName />` snippet instead of the raw source so drops
   *  instantiate rather than inline the internals — that's what users
   *  expect when dragging from a library. */
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/x-wonder-primitive",
      JSON.stringify({
        snippet: `<${component.name} />`,
        componentName: component.name,
        size: { w: component.width, h: component.height },
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
    document.querySelectorAll<HTMLIFrameElement>("iframe").forEach((f) =>
      f.contentWindow?.postMessage(
        { type: "wonder:dragStart", size: { w: component.width, h: component.height } },
        "*",
      ),
    );
  };

  const onDragEnd = () => {
    document.querySelectorAll<HTMLIFrameElement>("iframe").forEach((f) =>
      f.contentWindow?.postMessage({ type: "wonder:dragEnd" }, "*"),
    );
  };

  const isPrim = isPrimitiveFolder(component.folder);

  return (
    <button
      ref={hostRef}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      title={`${component.name} · ${component.folder}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-stroke bg-panel transition hover:border-accent/50 hover:shadow-[0_2px_10px_-4px_rgba(0,0,0,0.08)]"
    >
      <div
        className="relative overflow-hidden bg-panel-soft/60 transition group-hover:bg-panel-soft"
        style={{ height: 110 }}
      >
        {/* An inner layer sized to the FULL render dims, transform-scaled
             so the iframe thinks it has a real desktop-ish canvas. We
             center it in the preview area. */}
        {visible ? (
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 origin-center"
            style={{
              width: TILE_RENDER_WIDTH,
              height: TILE_RENDER_HEIGHT,
              transform: `translate(-50%, -50%) scale(${Math.min(
                220 / TILE_RENDER_WIDTH,
                110 / TILE_RENDER_HEIGHT,
              )})`,
            }}
          >
            <Sandbox
              ref={sandboxRef}
              onReady={() => setReady(true)}
              className="border-0"
              style={{
                width: TILE_RENDER_WIDTH,
                height: TILE_RENDER_HEIGHT,
                background: "transparent",
              }}
            />
          </div>
        ) : (
          <PlaceholderShimmer />
        )}
      </div>
      <div className="flex items-center gap-1 border-t border-stroke px-2 py-1">
        <AppIcon
          name={isPrim ? "Sparkles" : "FileCode"}
          size={11}
          className={isPrim ? "text-accent" : "text-ink-faint"}
        />
        <span className="flex-1 truncate text-left text-[10.5px] font-medium text-ink">
          {component.name}
        </span>
      </div>
    </button>
  );
}

// A subtle shimmer so off-screen tiles don't look broken while waiting
// for IntersectionObserver to fire. Matches the muted palette of the rest
// of the panel.
function PlaceholderShimmer() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        className="h-12 w-20 rounded-md bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200"
        style={{
          backgroundSize: "200% 100%",
          animation: "wonderShimmer 1.4s ease-in-out infinite",
        }}
      />
      <style>
        {`
        @keyframes wonderShimmer {
          0% { background-position: 100% 0%; }
          100% { background-position: -100% 0%; }
        }
        `}
      </style>
    </div>
  );
}
