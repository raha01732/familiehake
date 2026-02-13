// /workspace/familiehake/src/lib/cron-auth.ts
import type { NextRequest } from "next/server";

export function isAuthorizedCronRequest(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return true;
  }

  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  return token === expected;
}
