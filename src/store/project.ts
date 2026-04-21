import { create } from "zustand";

export type ComponentId = string;

export type WonderComponent = {
  id: ComponentId;
  name: string;
  filename: string;
  folder: string;
  source: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type State = {
  components: Record<ComponentId, WonderComponent>;
  order: ComponentId[];
  selectedComponentId: ComponentId | null;
  selectedElementPath: string | null;
  openTabs: ComponentId[];
  activeTab: ComponentId | null;

  selectComponent: (id: ComponentId | null) => void;
  selectElement: (path: string | null) => void;
  setSource: (id: ComponentId, source: string) => void;
  moveFrame: (id: ComponentId, x: number, y: number) => void;
  openTab: (id: ComponentId) => void;
  closeTab: (id: ComponentId) => void;
  setActiveTab: (id: ComponentId) => void;
};

const STAT_TILE = `import { TrendingUp, DollarSign } from "lucide-react";

export default function StatTile() {
  return (
    <div className="flex flex-col gap-3 p-5 bg-white border border-gray-200 rounded-xl">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">Monthly recurring revenue</span>
        <div className="flex items-center justify-center size-8 rounded-lg bg-emerald-50">
          <DollarSign size={14} strokeWidth={2} className="text-emerald-700" />
        </div>
      </div>
      <div className="text-3xl font-semibold text-gray-900">$48,291</div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-emerald-700 font-medium">▲ 12.4%</span>
        <span className="text-gray-500">vs. last month</span>
      </div>
    </div>
  );
}
`;

const ACTIVE_USERS = `export default function ActiveUsers() {
  return (
    <div className="flex flex-col gap-3 p-5 bg-white border border-gray-200 rounded-xl w-[260px]">
      <div className="text-sm font-medium text-gray-600">Active users</div>
      <div className="text-3xl font-semibold text-gray-900">12,430</div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-rose-500 font-medium">▼ 2.1%</span>
        <span className="text-gray-500">last 7 days</span>
      </div>
    </div>
  );
}
`;

const ORDERS = `export default function Orders() {
  return (
    <div className="flex flex-col gap-3 p-5 bg-white border border-gray-200 rounded-xl w-[260px]">
      <div className="text-sm font-medium text-gray-600">Orders today</div>
      <div className="text-3xl font-semibold text-gray-900">384</div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-emerald-700 font-medium">▲ 8.7%</span>
        <span className="text-gray-500">vs. yest</span>
      </div>
    </div>
  );
}
`;

const BUTTON_PRIMARY = `export default function ButtonPrimary() {
  return (
    <button className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm">
      View report →
    </button>
  );
}
`;

const BADGE_SUCCESS = `export default function BadgeSuccess() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      Synced
    </span>
  );
}
`;

const seed: WonderComponent[] = [
  {
    id: "active-users",
    name: "ActiveUsers",
    filename: "ActiveUsers.tsx",
    folder: "dashboard",
    source: ACTIVE_USERS,
    x: 80,
    y: 120,
    width: 300,
    height: 170,
  },
  {
    id: "stat-tile",
    name: "StatTile",
    filename: "StatTile.tsx",
    folder: "dashboard",
    source: STAT_TILE,
    x: 420,
    y: 80,
    width: 380,
    height: 220,
  },
  {
    id: "orders",
    name: "Orders",
    filename: "Orders.tsx",
    folder: "dashboard",
    source: ORDERS,
    x: 840,
    y: 120,
    width: 300,
    height: 170,
  },
  {
    id: "button-primary",
    name: "ButtonPrimary",
    filename: "Button.tsx",
    folder: "primitives",
    source: BUTTON_PRIMARY,
    x: 340,
    y: 360,
    width: 180,
    height: 80,
  },
  {
    id: "badge-success",
    name: "BadgeSuccess",
    filename: "Badge.tsx",
    folder: "primitives",
    source: BADGE_SUCCESS,
    x: 600,
    y: 360,
    width: 180,
    height: 80,
  },
];

const components = Object.fromEntries(seed.map((c) => [c.id, c]));
const order = seed.map((c) => c.id);

export const useProject = create<State>((set) => ({
  components,
  order,
  selectedComponentId: "stat-tile",
  selectedElementPath: "0",
  openTabs: ["stat-tile"],
  activeTab: "stat-tile",

  selectComponent(id) {
    set((s) => ({
      selectedComponentId: id,
      selectedElementPath: id ? "0" : null,
      openTabs: id
        ? s.openTabs.includes(id)
          ? s.openTabs
          : [...s.openTabs, id]
        : s.openTabs,
      activeTab: id ?? s.activeTab,
    }));
  },
  selectElement(path) {
    set({ selectedElementPath: path });
  },
  setSource(id, source) {
    set((s) => ({
      components: {
        ...s.components,
        [id]: { ...s.components[id], source },
      },
    }));
  },
  moveFrame(id, x, y) {
    set((s) => ({
      components: {
        ...s.components,
        [id]: { ...s.components[id], x, y },
      },
    }));
  },
  openTab(id) {
    set((s) => ({
      openTabs: s.openTabs.includes(id) ? s.openTabs : [...s.openTabs, id],
      activeTab: id,
    }));
  },
  closeTab(id) {
    set((s) => {
      const tabs = s.openTabs.filter((t) => t !== id);
      return {
        openTabs: tabs,
        activeTab: s.activeTab === id ? (tabs[tabs.length - 1] ?? null) : s.activeTab,
      };
    });
  },
  setActiveTab(id) {
    set({ activeTab: id, selectedComponentId: id, selectedElementPath: "0" });
  },
}));
