// ---------------------------------------------------------------------------
// Unlink — inline an imported child component into its caller's source.
//
// Why this exists:
//   Linking is great until you want to start customizing one specific use of
//   a component without forking the underlying file. Unlink takes
//   `<Button label="Hi" />` in the parent and replaces it with a verbatim
//   copy of Button's JSX body, with the parent's prop values baked in. From
//   that point the instance is independent — edits don't propagate back.
//
// What it can inline:
//   - Function/arrow components whose body is a single `return <jsx>`.
//     Hooks, helpers, early returns, anything stateful → we throw, because
//     inlining those would silently break behaviour. The user gets a clear
//     error and decides what to do.
//   - Destructured props (`function Btn({ label, onClick })`) and
//     `children`. Other prop access patterns (positional `props.x`, spread,
//     defaults referenced from inside helpers) aren't substituted.
//
// What we deliberately don't do:
//   - Touch imports. Deciding whether `import { Button } from "./Button"` is
//     still used after the unlink would require re-walking the JSX, and
//     getting it wrong silently breaks other instances. The caller can run
//     a follow-up "remove unused imports" pass — we'd rather leave a dead
//     import than delete a live one.
//   - Inline transitively. If Button itself uses a `<Card />`, unlinking
//     Button leaves `<Card />` in place. The user can unlink that
//     separately if they want.
// ---------------------------------------------------------------------------

import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import { parseSource, printSource } from "@/ast/parse";
import {
  findRootJSXElement,
  resolvePath,
  type WonderPath,
} from "@/ast/selectors";

const traverse =
  (traverseModule as unknown as { default?: typeof traverseModule }).default ??
  traverseModule;

type SubMap = Map<string, t.Expression>;
type JSXChild =
  | t.JSXText
  | t.JSXExpressionContainer
  | t.JSXSpreadChild
  | t.JSXElement
  | t.JSXFragment;

/** Replace the JSX element at `path` with the body of the component it
 *  references, with prop values from the parent baked in.
 *
 *  `lookupSource(name)` returns the source text of the imported child
 *  component, or null when the name doesn't resolve to anything we can
 *  inline (built-in tag, unresolved import, etc.). The function throws on
 *  any condition that would produce silently-wrong output — the caller
 *  surfaces the message to the user.
 */
export function unlinkAtPath(
  source: string,
  path: WonderPath,
  lookupSource: (componentName: string) => string | null,
): string {
  const ast = parseSource(source);
  const root = findRootJSXElement(ast);
  if (!root) throw new Error("No JSX root element found");
  const target = resolvePath(root, path);
  if (!target) throw new Error(`Path not found: ${path}`);

  const tagName = getOpeningTagName(target);
  if (!tagName) {
    throw new Error("Unlink only works on a named component element.");
  }
  // PascalCase = component; lowercase = host tag (`div`, `button`). Host
  // tags have nothing to inline.
  if (!/^[A-Z]/.test(tagName)) {
    throw new Error(
      `<${tagName}> is a host element, not an imported component — nothing to unlink.`,
    );
  }

  const childSource = lookupSource(tagName);
  if (childSource == null) {
    throw new Error(
      `Cannot find source for <${tagName}>. Make sure the component is imported and lives in this project.`,
    );
  }

  const childAst = parseSource(childSource);
  const childFn = findDefaultExportFn(childAst);
  if (!childFn) {
    throw new Error(
      `<${tagName}> has no default-exported function component to inline.`,
    );
  }
  const childJSX = pureReturnedJSX(childFn);
  if (!childJSX) {
    throw new Error(
      `<${tagName}> has logic (state, effects, helpers) that can't be safely inlined. Edit the file directly instead.`,
    );
  }

  const paramNames = destructuredParamNames(childFn);
  const sub = buildSubMap(target, new Set(paramNames));
  const childrenReplacement: JSXChild[] = target.children;

  const inlined = substituteInJSX(childJSX, sub, childrenReplacement);

  // Walk the parent AST and swap the target node by reference. We can't
  // use `resolvePath` again because path-based replacement requires the
  // parent path; reference identity is simpler and unambiguous.
  let replaced = false;
  traverse(ast, {
    JSXElement(p) {
      if (p.node === target) {
        p.replaceWith(t.cloneNode(inlined, true));
        replaced = true;
        p.skip();
      }
    },
  });
  if (!replaced) throw new Error("Failed to replace target element");

  return printSource(ast);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the simple identifier name of a JSX opening element, or null
 *  for member expressions (`<Foo.Bar />`) and namespaced tags. We only
 *  unlink simple-name components — qualifying members lookups isn't
 *  worth the complexity for v0. */
function getOpeningTagName(el: t.JSXElement): string | null {
  const name = el.openingElement.name;
  if (t.isJSXIdentifier(name)) return name.name;
  return null;
}

/** Find the default-exported function/arrow in a module's body. Handles
 *  `export default function X() {}`, `export default () => {}`, and
 *  `export default X` where `X` is declared above. Returns null for any
 *  shape we don't recognise (HOC wrappers, class components). */
function findDefaultExportFn(ast: t.File): t.Function | null {
  const program = ast.program;
  for (const stmt of program.body) {
    if (!t.isExportDefaultDeclaration(stmt)) continue;
    const d = stmt.declaration;
    if (
      t.isFunctionDeclaration(d) ||
      t.isArrowFunctionExpression(d) ||
      t.isFunctionExpression(d)
    ) {
      return d;
    }
    if (t.isIdentifier(d)) {
      const name = d.name;
      for (const s of program.body) {
        if (t.isFunctionDeclaration(s) && s.id?.name === name) return s;
        if (t.isVariableDeclaration(s)) {
          for (const decl of s.declarations) {
            if (
              t.isVariableDeclarator(decl) &&
              t.isIdentifier(decl.id) &&
              decl.id.name === name &&
              decl.init &&
              (t.isArrowFunctionExpression(decl.init) ||
                t.isFunctionExpression(decl.init))
            ) {
              return decl.init;
            }
          }
        }
      }
    }
  }
  return null;
}

/** Pull names out of a `function X({ a, b: c, d = 5, ...rest })` style
 *  param. We capture the destructured KEY name (so `b: c` adds "b", not
 *  "c"), because the JSX attribute on the parent uses the key. Rest
 *  patterns are recorded too — there isn't a single attribute they map to,
 *  but downstream substitution will skip them and they stay as-is in the
 *  inlined body for the user to clean up. */
function destructuredParamNames(fn: t.Function): string[] {
  const param = fn.params[0];
  if (!param || !t.isObjectPattern(param)) return [];
  const names: string[] = [];
  for (const p of param.properties) {
    if (t.isObjectProperty(p) && t.isIdentifier(p.key)) {
      names.push(p.key.name);
    } else if (t.isRestElement(p) && t.isIdentifier(p.argument)) {
      names.push(p.argument.name);
    }
  }
  return names;
}

/** A "pure" body is a single `return <jsx>;` (or a concise arrow with a
 *  JSX expression body). Anything else — `useState`, helper consts, early
 *  returns — and we bail. */
function pureReturnedJSX(fn: t.Function): t.JSXElement | null {
  const body = fn.body;
  if (t.isJSXElement(body)) return body;
  if (!t.isBlockStatement(body)) return null;
  if (body.body.length !== 1) return null;
  const stmt = body.body[0];
  if (!t.isReturnStatement(stmt)) return null;
  if (!t.isJSXElement(stmt.argument)) return null;
  return stmt.argument;
}

/** Map prop names to the expression the parent passed for that prop.
 *  String attrs become string literals; expression attrs use the inner
 *  expression directly; bare attrs (`<Btn primary />`) become `true`.
 *  Spread attributes are skipped — substituting them would require
 *  resolving an unknown bag of keys at unlink time. */
function buildSubMap(parent: t.JSXElement, paramNames: Set<string>): SubMap {
  const sub: SubMap = new Map();
  for (const attr of parent.openingElement.attributes) {
    if (!t.isJSXAttribute(attr)) continue;
    if (!t.isJSXIdentifier(attr.name)) continue;
    const name = attr.name.name;
    if (!paramNames.has(name)) continue;
    if (attr.value == null) {
      sub.set(name, t.booleanLiteral(true));
    } else if (t.isStringLiteral(attr.value)) {
      sub.set(name, attr.value);
    } else if (t.isJSXExpressionContainer(attr.value)) {
      const e = attr.value.expression;
      if (!t.isJSXEmptyExpression(e)) sub.set(name, e);
    }
  }
  return sub;
}

/** Walk a JSX element and:
 *    - replace `Identifier` references whose name is in `sub` with the
 *      corresponding parent expression,
 *    - replace `{children}` expression containers with the parent's
 *      children (single child is inlined directly; many children get
 *      wrapped in a fragment).
 *  Returns the (possibly-replaced) root.
 */
function substituteInJSX(
  jsx: t.JSXElement,
  sub: SubMap,
  childrenReplacement: JSXChild[],
): t.JSXElement {
  // Wrap in a synthetic file so babel-traverse has a Program to walk.
  // `t.cloneNode` keeps us safe against accidentally mutating the source
  // child AST that the caller might want to reuse.
  const cloned = t.cloneNode(jsx, true);
  const wrapper = t.file(t.program([t.expressionStatement(cloned)]));

  traverse(wrapper, {
    JSXExpressionContainer(p) {
      const expr = p.node.expression;
      if (!t.isIdentifier(expr)) return;

      // `{children}` → parent's children list.
      if (expr.name === "children") {
        const kids = childrenReplacement.map((c) => t.cloneNode(c, true));
        if (kids.length === 0) {
          p.remove();
          return;
        }
        if (kids.length === 1) {
          // A single JSXElement / Text / Container slots in directly. Text
          // and Container can be re-wrapped where required, but most of
          // the time the user will pass at least one element.
          const only = kids[0];
          if (t.isJSXElement(only) || t.isJSXFragment(only)) {
            p.replaceWith(only);
          } else if (t.isJSXText(only)) {
            // Convert to an expression container holding the text — keeps
            // the JSX tree well-formed.
            p.replaceWith(t.stringLiteral(only.value));
          } else if (t.isJSXExpressionContainer(only)) {
            p.replaceWith(only);
          } else {
            // JSXSpreadChild → wrap in fragment for safety.
            p.replaceWith(
              t.jsxFragment(
                t.jsxOpeningFragment(),
                t.jsxClosingFragment(),
                [only],
              ),
            );
          }
          p.skip();
          return;
        }
        p.replaceWith(
          t.jsxFragment(
            t.jsxOpeningFragment(),
            t.jsxClosingFragment(),
            kids,
          ),
        );
        p.skip();
        return;
      }

      // `{label}` etc. — substitute if we have a value for it.
      const repl = sub.get(expr.name);
      if (!repl) return;
      // The container expects an expression. Booleans/strings/etc. are all
      // fine inside `{...}`, but a bare string literal "Hi" inside JSX text
      // context would be rendered as quoted output — keep the container
      // wrapper so semantics match what the parent actually wrote.
      p.node.expression = t.cloneNode(repl, true);
      p.skip();
    },

    Identifier(p) {
      const name = p.node.name;
      if (name === "children") return; // handled above
      const repl = sub.get(name);
      if (!repl) return;
      // JSX tag names, JSX attribute names, and JSX member parts use
      // `JSXIdentifier` (a separate node type), so the `Identifier` visitor
      // never sees them — no need to guard. We DO need to skip object keys
      // and dotted member access (`obj.label`) where the trailing piece is
      // a normal Identifier and renaming it would corrupt the program.
      const parent = p.parent;
      if (
        t.isObjectProperty(parent) &&
        !parent.computed &&
        parent.key === p.node
      )
        return;
      if (
        t.isMemberExpression(parent) &&
        !parent.computed &&
        parent.property === p.node
      )
        return;
      p.replaceWith(t.cloneNode(repl, true));
      p.skip();
    },
  });

  const stmt = wrapper.program.body[0];
  if (t.isExpressionStatement(stmt) && t.isJSXElement(stmt.expression)) {
    return stmt.expression;
  }
  return cloned;
}
