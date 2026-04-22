import { parse as babelParse } from "@babel/parser";
import * as t from "@babel/types";
import { parseSource, printSource } from "@/ast/parse";
import {
  findRootJSXElement,
  resolvePath,
  type WonderPath,
} from "@/ast/selectors";

export function parseJSXSnippet(snippet: string): t.JSXElement {
  const mod = babelParse(`const __wonder_snippet = ${snippet};`, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });
  const decl = mod.program.body[0];
  if (!t.isVariableDeclaration(decl)) throw new Error("Invalid JSX snippet");
  const init = decl.declarations[0]?.init;
  if (!t.isJSXElement(init)) throw new Error("Snippet must be a JSX element");
  return init;
}

/**
 * Inserts `snippet` as a child of the JSX element at `path`.
 *
 * @param index  Zero-based sibling index among JSXElement children of the target.
 *               `0` inserts at the beginning, `N` inserts after the Nth element child.
 *               Omit or pass a value ≥ child count to append at the end.
 */
export function insertChildAtPath(
  code: string,
  path: WonderPath,
  snippet: string,
  index?: number,
): string {
  const ast = parseSource(code);
  const root = findRootJSXElement(ast);
  if (!root) throw new Error("No JSX root element found");
  const target = resolvePath(root, path);
  if (!target) throw new Error(`Path not found: ${path}`);
  const child = parseJSXSnippet(snippet);

  if (target.openingElement.selfClosing) {
    target.openingElement.selfClosing = false;
    target.closingElement = t.jsxClosingElement(
      t.cloneNode(target.openingElement.name, true),
    );
  }

  const children = target.children;
  const elementChildCount = children.filter((c) => t.isJSXElement(c)).length;
  const appendMode =
    index === undefined ||
    index === null ||
    index >= elementChildCount ||
    index < 0;

  if (appendMode) {
    children.push(t.jsxText("\n  "), child, t.jsxText("\n"));
    return printSource(ast);
  }

  // Insert BEFORE the Nth JSXElement child, preserving surrounding indentation.
  let seen = 0;
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (!t.isJSXElement(c)) continue;
    if (seen === index) {
      // Pull leading whitespace-only JSXText (indentation for the sibling we
      // insert before) so the new node and its marker slot in cleanly.
      let insertAt = i;
      if (
        insertAt > 0 &&
        t.isJSXText(children[insertAt - 1]) &&
        /^\s*$/.test((children[insertAt - 1] as t.JSXText).value)
      ) {
        insertAt -= 1;
      }
      children.splice(insertAt, 0, t.jsxText("\n  "), child);
      return printSource(ast);
    }
    seen++;
  }

  // Fallback (shouldn't happen given bounds check above): append.
  children.push(t.jsxText("\n  "), child, t.jsxText("\n"));
  return printSource(ast);
}

export function removeAtPath(code: string, path: WonderPath): string {
  if (path === "0") throw new Error("Cannot remove root element");
  const parts = path.split(".").map(Number);
  const parentPath = parts.slice(0, -1).join(".");
  const childIdx = parts[parts.length - 1];
  const ast = parseSource(code);
  const root = findRootJSXElement(ast);
  if (!root) throw new Error("No JSX root element found");
  const parent = resolvePath(root, parentPath);
  if (!parent) throw new Error(`Parent not found: ${parentPath}`);

  // Find the Nth JSXElement child of parent and remove it (and any immediately
  // adjacent whitespace-only JSXText nodes so we don't leave orphan indentation).
  let seen = 0;
  const children = parent.children;
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (!t.isJSXElement(c)) continue;
    if (seen === childIdx) {
      let from = i;
      let to = i + 1;
      if (
        from > 0 &&
        t.isJSXText(children[from - 1]) &&
        /^\s*$/.test((children[from - 1] as t.JSXText).value)
      ) {
        from -= 1;
      }
      if (
        to < children.length &&
        t.isJSXText(children[to]) &&
        /^\s*$/.test((children[to] as t.JSXText).value)
      ) {
        to += 1;
      }
      children.splice(from, to - from);
      return printSource(ast);
    }
    seen++;
  }
  throw new Error(`Child not found at path: ${path}`);
}
