// Optionaler Upstash-Ratelimiter. Wenn ENV fehlt, wird "allow" zurückgegeben.
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Lazy-Import, damit Build funktioniert, auch wenn Paket fehlt
let upstash: any = null;
function getRatelimiter() {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    if (!upstash) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Ratelimit } = require("@upstash/ratelimit");
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Redis } = require("@upstash/redis");
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
      upstash = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "1 m"), // 10 Requests / Minute
        analytics: false,
        prefix: "rl",
      });
    }
    return upstash;
  }
  return null;
}

export async function applyRateLimit(req: NextRequest, key: string) {
  const rl = getRatelimiter();
  if (!rl) return { allowed: true, limit: 0, remaining: 0, reset: 0 };

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    (req as any).ip ||
    "unknown";

  const id = `${key}:${ip}`;
  const result = await rl.limit(id);
  if (!result.success) {
    const res = NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    res.headers.set("Retry-After", String(result.reset));
    return res;
  }
  return { allowed: true, limit: result.limit, remaining: result.remaining, reset: result.reset };
}
