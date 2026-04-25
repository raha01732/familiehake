// src/lib/cache-key.ts
import { createHash } from "node:crypto";

/**
 * Deterministischer Cache-Key aus einem Input-Objekt.
 * Sortiert Keys rekursiv, damit {a:1,b:2} und {b:2,a:1} denselben Hash liefern.
 */
export function cacheKey(prefix: string, input: unknown): string {
  const hash = createHash("sha256")
    .update(stableStringify(input))
    .digest("hex")
    .slice(0, 24);
  return `${prefix}:${hash}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
