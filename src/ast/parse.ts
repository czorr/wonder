import * as recast from "recast";
import { parse as babelParse } from "@babel/parser";

export type RecastAst = ReturnType<typeof recast.parse>;

const parser = {
  parse(source: string) {
    return babelParse(source, {
      sourceType: "module",
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: ["jsx", "typescript"],
      tokens: true,
    });
  },
};

export function parseSource(code: string): RecastAst {
  return recast.parse(code, { parser });
}

export function printSource(ast: RecastAst): string {
  return recast.print(ast, { quote: "double" }).code;
}
