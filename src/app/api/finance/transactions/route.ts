// src/app/api/finance/transactions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { encryptValue, decryptValue } from "@/lib/finance-crypto";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type FinanceTransaction = {
  id: string;
  type: "income" | "expense";
  amount: number;
  description: string | null;
  category: string;
  transaction_date: string;
  created_at: string;
};

/** GET /api/finance/transactions?month=YYYY-MM */
export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:finance:transactions:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ ok: false, error: "invalid month parameter" }, { status: 400 });
  }

  const [year, mon] = month.split("-").map(Number);
  const from = month + "-01";
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("finance_transactions")
    .select("id,type,amount_enc,description_enc,category_enc,transaction_date,created_at")
    .eq("user_id", userId)
    .gte("transaction_date", from)
    .lte("transaction_date", to)
    .order("transaction_date", { ascending: false });

  if (error) {
    console.error("finance GET error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  const transactions: FinanceTransaction[] = (data ?? []).map((row) => {
    let amount = 0;
    let description: string | null = null;
    let category = "sonstiges";
    try {
      amount = parseFloat(decryptValue(row.amount_enc, userId));
    } catch {
      amount = 0;
    }
    if (row.description_enc) {
      try {
        description = decryptValue(row.description_enc, userId);
      } catch {
        description = null;
      }
    }
    try {
      category = decryptValue(row.category_enc, userId);
    } catch {
      category = "sonstiges";
    }
    return {
      id: row.id,
      type: row.type as "income" | "expense",
      amount,
      description,
      category,
      transaction_date: row.transaction_date,
      created_at: row.created_at,
    };
  });

  return NextResponse.json({ ok: true, data: transactions });
}

/** POST /api/finance/transactions */
export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:finance:transactions:post");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: {
    type: string;
    amount: number;
    description?: string | null;
    category: string;
    transaction_date: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const { type, amount, description, category, transaction_date } = body;

  if (!["income", "expense"].includes(type)) {
    return NextResponse.json({ ok: false, error: "invalid type" }, { status: 400 });
  }
  if (typeof amount !== "number" || amount <= 0 || amount > 9_999_999) {
    return NextResponse.json({ ok: false, error: "invalid amount" }, { status: 400 });
  }
  if (!category || typeof category !== "string" || category.length > 64) {
    return NextResponse.json({ ok: false, error: "invalid category" }, { status: 400 });
  }
  if (!transaction_date || !/^\d{4}-\d{2}-\d{2}$/.test(transaction_date)) {
    return NextResponse.json({ ok: false, error: "invalid date" }, { status: 400 });
  }

  const amount_enc = encryptValue(String(amount), userId);
  const category_enc = encryptValue(category, userId);
  const description_enc =
    description && description.trim()
      ? encryptValue(description.trim().slice(0, 500), userId)
      : null;

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("finance_transactions")
    .insert({
      user_id: userId,
      type,
      amount_enc,
      description_enc,
      category_enc,
      transaction_date,
    })
    .select("id,type,transaction_date,created_at")
    .single();

  if (error) {
    console.error("finance POST error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  await logAudit({
    action: "finance_transaction_create",
    actorUserId: userId,
    actorEmail: null,
    target: `finance_transactions:${data.id}`,
    detail: { type, transaction_date },
  });

  const result: FinanceTransaction = {
    id: data.id,
    type: data.type as "income" | "expense",
    amount,
    description: description?.trim() ?? null,
    category,
    transaction_date: data.transaction_date,
    created_at: data.created_at,
  };

  return NextResponse.json({ ok: true, data: result }, { status: 201 });
}
