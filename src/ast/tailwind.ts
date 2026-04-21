import * as t from "@babel/types";
import { parseSource, printSource } from "@/ast/parse";
import {
  findRootJSXElement,
  getJSXAttr,
  resolvePath,
  type WonderPath,
} from "@/ast/selectors";

function classNameString(attr: t.JSXAttribute): string | null {
  const v = attr.value;
  if (t.isStringLiteral(v)) return v.value;
  if (
    t.isJSXExpressionContainer(v) &&
    t.isStringLiteral(v.expression)
  ) {
    return v.expression.value;
  }
  return null;
}

function splitClasses(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

export function getClassNameAtPath(
  code: string,
  path: WonderPath,
): string[] {
  const ast = parseSource(code);
  const root = findRootJSXElement(ast);
  if (!root) return [];
  const target = resolvePath(root, path);
  if (!target) return [];
  const attr = getJSXAttr(target, "className");
  if (!attr) return [];
  const str = classNameString(attr);
  if (str === null) return [];
  return splitClasses(str);
}

export function setClassAtPath(
  code: string,
  path: WonderPath,
  oldClass: string,
  newClass: string,
): string {
  const ast = parseSource(code);
  const root = findRootJSXElement(ast);
  if (!root) throw new Error("No JSX root element found");
  const target = resolvePath(root, path);
  if (!target) throw new Error(`Path not found: ${path}`);
  const attr = getJSXAttr(target, "className");
  if (!attr) throw new Error(`No className at path ${path}`);
  const v = attr.value;
  let literal: t.StringLiteral;
  if (t.isStringLiteral(v)) {
    literal = v;
  } else if (
    t.isJSXExpressionContainer(v) &&
    t.isStringLiteral(v.expression)
  ) {
    literal = v.expression;
  } else {
    throw new Error("className is not a static string");
  }
  const classes = splitClasses(literal.value);
  const idx = classes.indexOf(oldClass);
  if (idx === -1) {
    classes.push(newClass);
  } else {
    classes[idx] = newClass;
  }
  literal.value = classes.join(" ");
  return printSource(ast);
}
