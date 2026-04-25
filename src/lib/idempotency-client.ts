// src/lib/idempotency-client.ts
// Browser-Helper: frischer Idempotency-Key je Submit.

export function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

export function idempotencyHeaders(key?: string): Record<string, string> {
  return { "Idempotency-Key": key ?? makeIdempotencyKey() };
}
