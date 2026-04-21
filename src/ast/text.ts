import * as t from "@babel/types";
import { parseSource, printSource } from "@/ast/parse";
import {
  findRootJSXElement,
  resolvePath,
  type WonderPath,
} from "@/ast/selectors";

export function getTextAtPath(code: string, path: WonderPath): string | null {
  const ast = parseSource(code);
  const root = findRootJSXElement(ast);
  if (!root) return null;
  const el = resolvePath(root, path);
  if (!el) return null;
  const parts: string[] = [];
  for (const child of el.children) {
    if (t.isJSXText(child)) parts.push(child.value);
    else if (
      t.isJSXExpressionContainer(child) &&
      t.isStringLiteral(child.expression)
    ) {
      parts.push(child.expression.value);
    } else if (t.isJSXElement(child)) {
      return null;
    }
  }
  return parts.join("").trim() || null;
}

export function isTextLeaf(code: string, path: WonderPath): boolean {
  const ast = parseSource(code);
  const root = findRootJSXElement(ast);
  if (!root) return false;
  const el = resolvePath(root, path);
  if (!el) return false;
  for (const child of el.children) {
    if (t.isJSXElement(child)) return false;
  }
  return true;
}

export function setTextAtPath(
  code: string,
  path: WonderPath,
  newText: string,
): string {
  const ast = parseSource(code);
  const root = findRootJSXElement(ast);
  if (!root) throw new Error("No JSX root");
  const el = resolvePath(root, path);
  if (!el) throw new Error(`Path not found: ${path}`);
  for (const child of el.children) {
    if (t.isJSXElement(child)) {
      throw new Error("Element has nested elements; cannot edit text");
    }
  }
  el.children = [t.jsxText(newText)];
  return printSource(ast);
}
