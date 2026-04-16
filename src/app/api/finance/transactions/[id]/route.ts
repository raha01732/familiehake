// src/app/api/finance/transactions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { encryptValue } from "@/lib/finance-crypto";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** PUT /api/finance/transactions/[id] */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const rl = await applyRateLimit(req, "api:finance:transactions:put");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  let body: {
    type?: string;
    amount?: number;
    description?: string | null;
    category?: string;
    transaction_date?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const sb = createAdminClient();

  // Verify ownership before update
  const { data: existing } = await sb
    .from("finance_transactions")
    .select("id,user_id")
    .eq("id", id)
    .single();

  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.type !== undefined) {
    if (!["income", "expense"].includes(body.type)) {
      return NextResponse.json({ ok: false, error: "invalid type" }, { status: 400 });
    }
    patch.type = body.type;
  }
  if (body.amount !== undefined) {
    if (typeof body.amount !== "number" || body.amount <= 0 || body.amount > 9_999_999) {
      return NextResponse.json({ ok: false, error: "invalid amount" }, { status: 400 });
    }
    patch.amount_enc = encryptValue(String(body.amount), userId);
  }
  if (body.description !== undefined) {
    patch.description_enc =
      body.description && body.description.trim()
        ? encryptValue(body.description.trim().slice(0, 500), userId)
        : null;
  }
  if (body.category !== undefined) {
    if (typeof body.category !== "string" || body.category.length > 64) {
      return NextResponse.json({ ok: false, error: "invalid category" }, { status: 400 });
    }
    patch.category_enc = encryptValue(body.category, userId);
  }
  if (body.transaction_date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.transaction_date)) {
      return NextResponse.json({ ok: false, error: "invalid date" }, { status: 400 });
    }
    patch.transaction_date = body.transaction_date;
  }

  const { error } = await sb.from("finance_transactions").update(patch).eq("id", id);

  if (error) {
    console.error("finance PUT error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  await logAudit({
    action: "finance_transaction_update",
    actorUserId: userId,
    actorEmail: null,
    target: `finance_transactions:${id}`,
  });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/finance/transactions/[id] */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const rl = await applyRateLimit(req, "api:finance:transactions:delete");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const sb = createAdminClient();

  // Verify ownership before delete
  const { data: existing } = await sb
    .from("finance_transactions")
    .select("id,user_id")
    .eq("id", id)
    .single();

  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const { error } = await sb.from("finance_transactions").delete().eq("id", id);

  if (error) {
    console.error("finance DELETE error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  await logAudit({
    action: "finance_transaction_delete",
    actorUserId: userId,
    actorEmail: null,
    target: `finance_transactions:${id}`,
  });

  return NextResponse.json({ ok: true });
}
