import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import type { RecastAst } from "@/ast/parse";

const traverse = (
  traverseModule as unknown as { default?: typeof traverseModule }
).default ?? traverseModule;

export type WonderPath = string;

export const ROOT_PATH: WonderPath = "0";

export function findRootJSXElement(ast: RecastAst): t.JSXElement | null {
  let found: t.JSXElement | null = null;
  traverse(ast, {
    ReturnStatement(path) {
      if (found) return;
      const arg = path.node.argument;
      if (t.isJSXElement(arg)) {
        found = arg;
        path.stop();
      }
    },
    ArrowFunctionExpression(path) {
      if (found) return;
      const body = path.node.body;
      if (t.isJSXElement(body)) {
        found = body;
        path.stop();
      }
    },
  });
  return found;
}

export function jsxElementChildren(el: t.JSXElement): t.JSXElement[] {
  return el.children.filter((c): c is t.JSXElement => t.isJSXElement(c));
}

export function resolvePath(
  root: t.JSXElement,
  path: WonderPath,
): t.JSXElement | null {
  const parts = path.split(".").map(Number);
  if (parts.length === 0 || parts[0] !== 0) return null;
  let cur: t.JSXElement = root;
  for (let i = 1; i < parts.length; i++) {
    const kids = jsxElementChildren(cur);
    const next = kids[parts[i]];
    if (!next) return null;
    cur = next;
  }
  return cur;
}

export function walkJSX(
  root: t.JSXElement,
  visit: (el: t.JSXElement, path: WonderPath) => void,
  path: WonderPath = ROOT_PATH,
): void {
  visit(root, path);
  let i = 0;
  for (const child of root.children) {
    if (t.isJSXElement(child)) {
      walkJSX(child, visit, `${path}.${i}`);
      i++;
    }
  }
}

export function getJSXAttr(
  el: t.JSXElement,
  name: string,
): t.JSXAttribute | null {
  for (const attr of el.openingElement.attributes) {
    if (
      t.isJSXAttribute(attr) &&
      t.isJSXIdentifier(attr.name) &&
      attr.name.name === name
    ) {
      return attr;
    }
  }
  return null;
}
