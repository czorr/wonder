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

export function insertChildAtPath(
  code: string,
  path: WonderPath,
  snippet: string,
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

  target.children.push(t.jsxText("\n  "), child, t.jsxText("\n"));
  return printSource(ast);
}
