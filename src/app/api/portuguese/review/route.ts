// src/app/api/portuguese/review/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { nextBox, nextReviewAt } from "@/lib/portuguese/leitner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:portuguese:review:post");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { wordId?: string; correct?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const wordId = typeof body.wordId === "string" ? body.wordId : "";
  const correct = body.correct === true;
  if (!wordId) {
    return NextResponse.json({ ok: false, error: "missing wordId" }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: existing, error: existingError } = await sb
    .from("portuguese_progress")
    .select("box,correct_count,wrong_count")
    .eq("user_id", userId)
    .eq("word_id", wordId)
    .maybeSingle();

  if (existingError) {
    console.error("portuguese review lookup error:", existingError.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  const currentBox = existing?.box ?? 0;
  const newBox = nextBox(currentBox, correct);
  const now = new Date();

  const row = {
    user_id: userId,
    word_id: wordId,
    box: newBox,
    next_review_at: nextReviewAt(newBox, now).toISOString(),
    correct_count: (existing?.correct_count ?? 0) + (correct ? 1 : 0),
    wrong_count: (existing?.wrong_count ?? 0) + (correct ? 0 : 1),
    last_reviewed_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const { error } = await sb
    .from("portuguese_progress")
    .upsert(row, { onConflict: "user_id,word_id" });

  if (error) {
    console.error("portuguese review upsert error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, box: newBox });
}
