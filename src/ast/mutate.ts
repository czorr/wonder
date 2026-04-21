import * as t from "@babel/types";
import { parseSource, printSource } from "@/ast/parse";
import { findRootJSXElement, walkJSX } from "@/ast/selectors";

const ATTR_NAME = "data-wonder-path";

function hasWonderPath(el: t.JSXElement): boolean {
  return el.openingElement.attributes.some(
    (a) =>
      t.isJSXAttribute(a) &&
      t.isJSXIdentifier(a.name) &&
      a.name.name === ATTR_NAME,
  );
}

function setWonderPath(el: t.JSXElement, path: string) {
  const existing = el.openingElement.attributes.find(
    (a): a is t.JSXAttribute =>
      t.isJSXAttribute(a) &&
      t.isJSXIdentifier(a.name) &&
      a.name.name === ATTR_NAME,
  );
  const value = t.stringLiteral(path);
  if (existing) {
    existing.value = value;
    return;
  }
  el.openingElement.attributes.push(
    t.jsxAttribute(t.jsxIdentifier(ATTR_NAME), value),
  );
}

export function injectWonderPaths(code: string): string {
  const ast = parseSource(code);
  const root = findRootJSXElement(ast);
  if (!root) return code;
  walkJSX(root, (el, path) => {
    setWonderPath(el, path);
  });
  return printSource(ast);
}

export function stripWonderPaths(code: string): string {
  const ast = parseSource(code);
  const root = findRootJSXElement(ast);
  if (!root) return code;
  walkJSX(root, (el) => {
    if (!hasWonderPath(el)) return;
    el.openingElement.attributes = el.openingElement.attributes.filter(
      (a) =>
        !(
          t.isJSXAttribute(a) &&
          t.isJSXIdentifier(a.name) &&
          a.name.name === ATTR_NAME
        ),
    );
  });
  return printSource(ast);
}
