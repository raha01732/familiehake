// src/lib/idempotency.ts
import { NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis";

const TTL_SECONDS = 60; // 1 Minute reicht für Doppel-Submits
const MAX_KEY_LEN = 120;

type StoredResult = {
  status: number;
  body: unknown;
};

function redisKey(userId: string, idempotencyKey: string): string {
  return `idem:${userId}:${idempotencyKey}`;
}

function extractKey(req: Request): string | null {
  const raw = req.headers.get("idempotency-key");
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_KEY_LEN) return null;
  // Nur harmlose Zeichen akzeptieren, damit nichts Seltsames in den Key kommt
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Führt `handler` aus und cached die Antwort unter (userId, Idempotency-Key).
 * Wenn Redis nicht konfiguriert ist oder der Header fehlt, wird ohne Caching
 * einfach der Handler ausgeführt — das Feature ist optional.
 *
 * Wichtig: Nur gecached wenn Status 2xx. 4xx/5xx dürfen retried werden.
 */
export async function withIdempotency(
  req: Request,
  userId: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const key = extractKey(req);
  const client = key ? getRedisClient() : null;

  if (!client || !key) {
    return handler();
  }

  const rkey = redisKey(userId, key);
  try {
    const existing = await client.get<StoredResult>(rkey);
    if (existing && typeof existing === "object" && "status" in existing) {
      return NextResponse.json(existing.body, {
        status: existing.status,
        headers: { "X-Idempotent-Replay": "1" },
      });
    }
  } catch {
    // Bei Cache-Fehlern einfach durchreichen
  }

  const res = await handler();

  if (res.status >= 200 && res.status < 300) {
    try {
      const cloned = res.clone();
      const body = await cloned.json().catch(() => null);
      if (body != null) {
        await client.set(rkey, { status: res.status, body }, { ex: TTL_SECONDS });
      }
    } catch {
      // Caching ist optional
    }
  }

  return res;
}
