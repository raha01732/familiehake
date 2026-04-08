// /workspace/familiehake/tests/ts-loader.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ERR_MODULE_NOT_FOUND" &&
      context.parentURL &&
      !specifier.endsWith(".ts") &&
      (specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/"))
    ) {
      const parentPath = fileURLToPath(context.parentURL);
      const resolvedPath = path.resolve(path.dirname(parentPath), `${specifier}.ts`);
      return {
        shortCircuit: true,
        url: pathToFileURL(resolvedPath).href,
      };
    }

    throw error;
  }
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
    return { format: "module", source: outputText, shortCircuit: true };
  }

  return defaultLoad(url, context, defaultLoad);
}
