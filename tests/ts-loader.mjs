// tests/ts-loader.mjs
import { readFile } from "node:fs/promises";
import ts from "typescript";

export async function resolve(specifier, context, defaultResolve) {
  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".ts")) {
    const source = await readFile(new URL(url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: url,
    });
    return { format: "module", source: outputText };
  }

  return defaultLoad(url, context, defaultLoad);
}
