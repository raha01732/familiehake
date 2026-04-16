// src/app/api/admin/migrate-finance-categories/route.ts
// ONE-TIME migration route — DELETE THIS FILE after running!
//
// Trigger via:
//   curl -X POST https://deine-app.vercel.app/api/admin/migrate-finance-categories \
//     -H "Authorization: Bearer <CRON_SECRET>"
//
// Or open in browser as superadmin (GET request).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionInfo } from "@/lib/auth";
import { encryptValue } from "@/lib/finance-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAlreadyEncrypted(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const b64 = /^[A-Za-z0-9+/]+=*$/;
  return parts.every((p) => p.length >= 8 && b64.test(p));
}

export async function GET(req: NextRequest) {
  return handler(req);
}

async function handler(_req: NextRequest) {
  // Superadmin only
  const session = await getSessionInfo();
  if (!session.signedIn || !session.isSuperAdmin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = createAdminClient();

  const { data: rows, error } = await sb
    .from("finance_transactions")
    .select("id, user_id, category_enc");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let migrated = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const row of rows ?? []) {
    const { id, user_id, category_enc } = row;

    if (!category_enc || isAlreadyEncrypted(category_enc)) {
      skipped++;
      continue;
    }

    try {
      const encrypted = encryptValue(category_enc, user_id);
      const { error: updateError } = await sb
        .from("finance_transactions")
        .update({ category_enc: encrypted })
        .eq("id", id);

      if (updateError) {
        failures.push(`${id}: ${updateError.message}`);
      } else {
        migrated++;
      }
    } catch (err: unknown) {
      failures.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    migrated,
    skipped,
    failed: failures.length,
    failures,
  });
}
