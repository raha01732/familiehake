// /workspace/familiehake/tests/ts-loader.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveAliasedPath(specifier) {
  if (specifier.startsWith("@/")) {
    return path.resolve(PROJECT_ROOT, "src", specifier.slice(2));
  }
  return null;
}

async function tryWithExtensions(basePath) {
  // Mirrors Node's ESM extension probe for our TS sources.
  const candidates = [`${basePath}.ts`, `${basePath}.tsx`, path.join(basePath, "index.ts")];
  for (const c of candidates) {
    try {
      const { stat } = await import("node:fs/promises");
      await stat(c);
      return c;
    } catch {
      // try next
    }
  }
  return `${basePath}.ts`; // fall back, will surface its own error
}

export async function resolve(specifier, context, defaultResolve) {
  // tsconfig path alias: "@/*" → "src/*"
  const aliased = resolveAliasedPath(specifier);
  if (aliased) {
    const resolvedPath = await tryWithExtensions(aliased);
    return {
      shortCircuit: true,
      url: pathToFileURL(resolvedPath).href,
    };
  }

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
