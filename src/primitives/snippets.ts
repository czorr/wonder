import type { AppIconName } from "@/app/icons";

export type PrimitiveId =
  | "div"
  | "button"
  | "input"
  | "text"
  | "image"
  | "icon"
  | "flex"
  | "grid"
  | "card";

export type Primitive = {
  id: PrimitiveId;
  label: string;
  /** App-registry icon name (from `src/app/icons.tsx`). The sidebar palette
   *  renders this via `<AppIcon />`, same as the rest of the chrome. */
  icon: AppIconName;
  /** JSX fragment inserted as child of a selected element */
  snippet: string;
  /** Display name for generated new components */
  componentName: string;
  /** Default frame size hint (metadata; actual size comes from DOM) */
  size: { w: number; h: number };
};

export const PRIMITIVES: Primitive[] = [
  {
    id: "div",
    label: "div",
    icon: "Square",
    snippet: `<div className="flex items-center justify-center h-24 w-60 rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500">Container</div>`,
    componentName: "Block",
    size: { w: 240, h: 96 },
  },
  {
    id: "button",
    label: "Button",
    icon: "Button",
    snippet: `<button className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800">Click me</button>`,
    componentName: "Button",
    size: { w: 140, h: 44 },
  },
  {
    id: "input",
    label: "Input",
    icon: "Input",
    snippet: `<input className="w-64 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-gray-400 focus:outline-none" placeholder="Type something..." />`,
    componentName: "Input",
    size: { w: 256, h: 40 },
  },
  {
    id: "text",
    label: "Text",
    icon: "Type",
    snippet: `<p className="max-w-xs text-sm leading-6 text-gray-700">The quick brown fox jumps over the lazy dog.</p>`,
    componentName: "Text",
    size: { w: 288, h: 44 },
  },
  {
    id: "image",
    label: "Image",
    icon: "Image",
    snippet: `<img src="https://placehold.co/240x160" alt="" className="h-40 w-60 rounded-lg object-cover" />`,
    componentName: "Image",
    size: { w: 240, h: 160 },
  },
  {
    id: "icon",
    label: "Icon",
    icon: "Sparkles",
    snippet: `<div className="grid size-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.39 4.84L20 8l-4 3.9.94 5.5L12 15l-4.94 2.4L8 11.9 4 8l5.61-1.16L12 2z"/></svg></div>`,
    componentName: "IconBadge",
    size: { w: 40, h: 40 },
  },
  {
    id: "flex",
    label: "Flex",
    icon: "Rows",
    snippet: `<div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="size-10 rounded-full bg-gray-200" />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-900">Jane Cooper</span>
        <span className="text-xs text-gray-500">jane@example.com</span>
      </div>
    </div>`,
    componentName: "FlexRow",
    size: { w: 280, h: 76 },
  },
  {
    id: "grid",
    label: "Grid",
    icon: "LayoutGrid",
    snippet: `<div className="grid grid-cols-3 gap-3 p-4">
      <div className="aspect-square rounded-lg bg-gray-100" />
      <div className="aspect-square rounded-lg bg-gray-100" />
      <div className="aspect-square rounded-lg bg-gray-100" />
      <div className="aspect-square rounded-lg bg-gray-100" />
      <div className="aspect-square rounded-lg bg-gray-100" />
      <div className="aspect-square rounded-lg bg-gray-100" />
    </div>`,
    componentName: "GridBlock",
    size: { w: 320, h: 240 },
  },
  {
    id: "card",
    label: "Card",
    icon: "LayoutTemplate",
    snippet: `<div className="flex w-72 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">Card title</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">New</span>
      </div>
      <div className="text-2xl font-semibold text-gray-900">$12,430</div>
      <div className="text-xs text-gray-500">Updated 2 minutes ago</div>
    </div>`,
    componentName: "Card",
    size: { w: 288, h: 140 },
  },
];

export function buildComponentSource(primitive: Primitive, name: string): string {
  return `export default function ${name}() {
  return (
    ${primitive.snippet}
  );
}
`;
}
