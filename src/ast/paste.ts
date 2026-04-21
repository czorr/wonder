import { parse as babelParse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

const ALLOWED_PREFIXES = [
  "react",
  "react-dom",
  "react/",
  "react-dom/",
  "motion",
  "motion/",
  "framer-motion",
  "lucide-react",
  "@iconify/react",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
];

function isAllowedImport(source: string): boolean {
  return ALLOWED_PREFIXES.some(
    (p) => source === p || source.startsWith(p + "/") || source === p.replace(/\/$/, ""),
  );
}

const STUB_RUNTIME = `
const __wonderStub = (name) => {
  const C = (props) => {
    const { children, className, src, alt, asChild: _a, ...rest } = props || {};
    const reactAny = (typeof React !== "undefined") ? React : null;
    if (src && reactAny) return reactAny.createElement("img", { src, alt, className, ...rest });
    if (reactAny) return reactAny.createElement("div", { className, "data-wonder-stub": name, ...rest }, children);
    return null;
  };
  C.displayName = name;
  return C;
};
const __wonderCn = (...args) => {
  const out = [];
  const walk = (v) => {
    if (!v) return;
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") {
      for (const k in v) if (v[k]) out.push(k);
    }
  };
  walk(args);
  return out.join(" ");
};
const __wonderStubNs = (label) => new Proxy({}, {
  get: (_, prop) => {
    if (prop === "__esModule") return true;
    return __wonderStub(label + "." + String(prop));
  },
});
`;

const CN_NAMES = new Set(["cn", "clsx", "cx", "twMerge", "classNames"]);

function parse(code: string) {
  return babelParse(code, {
    sourceType: "module",
    allowImportExportEverywhere: true,
    plugins: ["jsx", "typescript"],
  });
}

function hasAnyExport(ast: t.File): boolean {
  return ast.program.body.some(
    (n) =>
      t.isExportDefaultDeclaration(n) ||
      t.isExportNamedDeclaration(n) ||
      t.isExportAllDeclaration(n),
  );
}

function isBareJSX(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed.startsWith("<")) return false;
  try {
    babelParse(`const __x = ${trimmed};`, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
    return true;
  } catch {
    return false;
  }
}

/** Find the best React component export and return its name. */
function findComponentName(ast: t.File): string | null {
  let defaultName: string | null = null;
  let namedName: string | null = null;

  for (const node of ast.program.body) {
    if (t.isExportDefaultDeclaration(node)) {
      const d = node.declaration;
      if (t.isFunctionDeclaration(d) && d.id) defaultName = d.id.name;
      else if (t.isIdentifier(d)) defaultName = d.name;
    }
    if (t.isExportNamedDeclaration(node) && node.declaration) {
      const d = node.declaration;
      if (t.isFunctionDeclaration(d) && d.id && /^[A-Z]/.test(d.id.name)) {
        namedName = namedName ?? d.id.name;
      }
      if (t.isVariableDeclaration(d)) {
        for (const decl of d.declarations) {
          if (t.isIdentifier(decl.id) && /^[A-Z]/.test(decl.id.name)) {
            namedName = namedName ?? decl.id.name;
          }
        }
      }
    }
  }
  return defaultName ?? namedName;
}

/** Rewrite imports: allowed stay; unknown become stub declarations. Ensure a default export. */
function transformPastedModule(code: string, fallbackName: string): { source: string; name: string } | null {
  let ast: t.File;
  try {
    ast = parse(code);
  } catch {
    return null;
  }

  const stubDecls: t.Statement[] = [];
  const newBody: t.Statement[] = [];
  let needsStubRuntime = false;
  let hasReactImport = false;

  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node)) {
      const src = node.source.value;
      if (src === "react") hasReactImport = true;
      if (isAllowedImport(src)) {
        newBody.push(node);
        continue;
      }
      needsStubRuntime = true;
      for (const spec of node.specifiers) {
        if (t.isImportDefaultSpecifier(spec)) {
          stubDecls.push(
            t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier(spec.local.name),
                t.callExpression(t.identifier("__wonderStub"), [t.stringLiteral(spec.local.name)]),
              ),
            ]),
          );
        } else if (t.isImportNamespaceSpecifier(spec)) {
          stubDecls.push(
            t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier(spec.local.name),
                t.callExpression(t.identifier("__wonderStubNs"), [t.stringLiteral(spec.local.name)]),
              ),
            ]),
          );
        } else if (t.isImportSpecifier(spec)) {
          const imported = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value;
          const init = CN_NAMES.has(imported)
            ? t.identifier("__wonderCn")
            : t.callExpression(t.identifier("__wonderStub"), [t.stringLiteral(imported)]);
          stubDecls.push(
            t.variableDeclaration("const", [
              t.variableDeclarator(t.identifier(spec.local.name), init),
            ]),
          );
        }
      }
      continue;
    }
    newBody.push(node);
  }

  ast.program.body = newBody;

  // Ensure React is imported (stub runtime uses it).
  if (needsStubRuntime && !hasReactImport) {
    ast.program.body.unshift(
      t.importDeclaration(
        [t.importNamespaceSpecifier(t.identifier("React"))],
        t.stringLiteral("react"),
      ),
    );
  }

  // Insert stub runtime + stub decls after imports.
  if (needsStubRuntime) {
    const runtimeAst = parse(STUB_RUNTIME);
    let insertAt = 0;
    for (let i = 0; i < ast.program.body.length; i++) {
      if (t.isImportDeclaration(ast.program.body[i])) insertAt = i + 1;
      else break;
    }
    ast.program.body.splice(insertAt, 0, ...runtimeAst.program.body, ...stubDecls);
  }

  // Determine component name & ensure default export.
  let name = findComponentName(ast) ?? fallbackName;
  const hasDefault = ast.program.body.some((n) => t.isExportDefaultDeclaration(n));

  if (!hasDefault) {
    // Convert named export of `name` to default-aliased, or append `export default name`.
    ast.program.body.push(
      t.exportDefaultDeclaration(t.identifier(name)),
    );
  }

  // Strip TS type-only things that babel generator is fine with; generator handles TSX.
  const out = generate(ast, { retainLines: false, jsescOption: { minimal: true } }, code);
  return { source: out.code + "\n", name };
}

/** If `code` looks like a React component (or bare JSX), return normalized TSX source. */
export function normalizePastedComponent(
  code: string,
  fallbackName: string,
): { source: string; name: string } | null {
  const trimmed = code.trim();
  if (trimmed.length < 3) return null;

  // Bare JSX: wrap into a default-export component, no imports to rewrite.
  if (!trimmed.startsWith("import") && !trimmed.includes("export") && isBareJSX(trimmed)) {
    const source = `export default function ${fallbackName}() {
  return (
    ${trimmed}
  );
}
`;
    return { source, name: fallbackName };
  }

  // Try full-module parse + import rewrite.
  try {
    const ast = parse(trimmed);
    if (hasAnyExport(ast) || ast.program.body.some((n) => t.isImportDeclaration(n))) {
      return transformPastedModule(trimmed, fallbackName);
    }
  } catch {
    // fall through
  }

  if (isBareJSX(trimmed)) {
    const source = `export default function ${fallbackName}() {
  return (
    ${trimmed}
  );
}
`;
    return { source, name: fallbackName };
  }

  return null;
}
