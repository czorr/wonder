import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import { parseSource, printSource, type RecastAst } from "@/ast/parse";
import {
  findRootJSXElement,
  resolvePath,
  walkJSX,
  type WonderPath,
} from "@/ast/selectors";

const traverse = (
  traverseModule as unknown as { default?: typeof traverseModule }
).default ?? traverseModule;

export type PropInfo = {
  name: string;
  default: string;
  usedAtPaths: WonderPath[];
};

function findComponentFunction(ast: RecastAst): {
  params: (t.Identifier | t.Pattern | t.RestElement)[];
  setParams: (p: (t.Identifier | t.Pattern | t.RestElement)[]) => void;
} | null {
  let result: {
    params: (t.Identifier | t.Pattern | t.RestElement)[];
    setParams: (p: (t.Identifier | t.Pattern | t.RestElement)[]) => void;
  } | null = null;

  traverse(ast, {
    ExportDefaultDeclaration(path) {
      if (result) return;
      const decl = path.node.declaration;
      if (
        t.isFunctionDeclaration(decl) ||
        t.isFunctionExpression(decl) ||
        t.isArrowFunctionExpression(decl)
      ) {
        result = {
          params: decl.params,
          setParams: (p) => {
            decl.params = p;
          },
        };
        path.stop();
      }
    },
    FunctionDeclaration(path) {
      if (result) return;
      // Top-level function that is later exported
      result = {
        params: path.node.params,
        setParams: (p) => {
          path.node.params = p;
        },
      };
      path.stop();
    },
  });

  return result;
}

function getDestructurePattern(
  params: (t.Identifier | t.Pattern | t.RestElement)[],
): t.ObjectPattern | null {
  if (params.length === 0) return null;
  const first = params[0];
  if (t.isObjectPattern(first)) return first;
  return null;
}

function ensureDestructurePattern(
  fn: {
    params: (t.Identifier | t.Pattern | t.RestElement)[];
    setParams: (p: (t.Identifier | t.Pattern | t.RestElement)[]) => void;
  },
): t.ObjectPattern {
  const existing = getDestructurePattern(fn.params);
  if (existing) return existing;
  const pattern = t.objectPattern([]);
  fn.setParams([pattern, ...fn.params]);
  return pattern;
}

function defaultToLiteral(value: string): t.Expression {
  const asNum = Number(value);
  if (value.trim() !== "" && !Number.isNaN(asNum) && String(asNum) === value) {
    return t.numericLiteral(asNum);
  }
  return t.stringLiteral(value);
}

function literalToString(lit: t.Expression | null | undefined): string {
  if (!lit) return "";
  if (t.isStringLiteral(lit)) return lit.value;
  if (t.isNumericLiteral(lit)) return String(lit.value);
  if (t.isBooleanLiteral(lit)) return String(lit.value);
  return "";
}

export function listProps(code: string): PropInfo[] {
  const ast = parseSource(code);
  const fn = findComponentFunction(ast);
  if (!fn) return [];
  const pattern = getDestructurePattern(fn.params);
  if (!pattern) return [];

  const props: Record<string, PropInfo> = {};
  for (const p of pattern.properties) {
    if (!t.isObjectProperty(p)) continue;
    if (!t.isIdentifier(p.key)) continue;
    const name = p.key.name;
    let def = "";
    if (t.isAssignmentPattern(p.value)) {
      def = literalToString(p.value.right as t.Expression);
    }
    props[name] = { name, default: def, usedAtPaths: [] };
  }

  const root = findRootJSXElement(ast);
  if (root) {
    walkJSX(root, (el, path) => {
      for (const child of el.children) {
        if (
          t.isJSXExpressionContainer(child) &&
          t.isIdentifier(child.expression) &&
          props[child.expression.name]
        ) {
          props[child.expression.name].usedAtPaths.push(path);
        }
      }
    });
  }

  return Object.values(props);
}

function deriveUniqueName(base: string, taken: Set<string>): string {
  const clean = base.replace(/[^a-zA-Z0-9]/g, "").replace(/^[0-9]+/, "");
  const root = clean ? clean[0].toLowerCase() + clean.slice(1) : "value";
  if (!taken.has(root)) return root;
  let i = 2;
  while (taken.has(`${root}${i}`)) i++;
  return `${root}${i}`;
}

export function bindTextPropAtPath(
  code: string,
  path: WonderPath,
  requestedName: string,
  defaultValue: string,
): { code: string; name: string } {
  const ast = parseSource(code);
  const root = findRootJSXElement(ast);
  if (!root) throw new Error("No JSX root");
  const el = resolvePath(root, path);
  if (!el) throw new Error(`Path not found: ${path}`);
  for (const child of el.children) {
    if (t.isJSXElement(child)) {
      throw new Error("Element has nested elements; cannot bind text");
    }
  }

  const fn = findComponentFunction(ast);
  if (!fn) throw new Error("No component function found");
  const pattern = ensureDestructurePattern(fn);

  const taken = new Set<string>();
  for (const p of pattern.properties) {
    if (t.isObjectProperty(p) && t.isIdentifier(p.key)) taken.add(p.key.name);
  }
  const name = taken.has(requestedName)
    ? deriveUniqueName(requestedName, taken)
    : requestedName;

  pattern.properties.push(
    t.objectProperty(
      t.identifier(name),
      t.assignmentPattern(t.identifier(name), defaultToLiteral(defaultValue)),
      false,
      true, // shorthand
    ),
  );

  el.children = [t.jsxExpressionContainer(t.identifier(name))];

  return { code: printSource(ast), name };
}

export function unbindPropAtPath(
  code: string,
  path: WonderPath,
): string {
  const ast = parseSource(code);
  const root = findRootJSXElement(ast);
  if (!root) throw new Error("No JSX root");
  const el = resolvePath(root, path);
  if (!el) throw new Error(`Path not found: ${path}`);

  // Find the prop name referenced in children
  let propName: string | null = null;
  for (const child of el.children) {
    if (
      t.isJSXExpressionContainer(child) &&
      t.isIdentifier(child.expression)
    ) {
      propName = child.expression.name;
      break;
    }
  }
  if (!propName) return code;

  // Replace with default text from pattern
  const fn = findComponentFunction(ast);
  const pattern = fn ? getDestructurePattern(fn.params) : null;
  let defaultText = "";
  if (pattern) {
    for (const p of pattern.properties) {
      if (
        t.isObjectProperty(p) &&
        t.isIdentifier(p.key) &&
        p.key.name === propName &&
        t.isAssignmentPattern(p.value)
      ) {
        defaultText = literalToString(p.value.right as t.Expression);
      }
    }
  }

  el.children = [t.jsxText(defaultText)];

  // Remove prop from signature if no longer used
  if (pattern && root) {
    let stillUsed = false;
    walkJSX(root, (e) => {
      for (const c of e.children) {
        if (
          t.isJSXExpressionContainer(c) &&
          t.isIdentifier(c.expression) &&
          c.expression.name === propName
        ) {
          stillUsed = true;
        }
      }
    });
    if (!stillUsed) {
      pattern.properties = pattern.properties.filter((p) => {
        if (t.isObjectProperty(p) && t.isIdentifier(p.key)) {
          return p.key.name !== propName;
        }
        return true;
      });
      if (pattern.properties.length === 0 && fn) {
        fn.setParams(fn.params.filter((_, i) => i !== 0));
      }
    }
  }

  return printSource(ast);
}
