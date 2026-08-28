// src/app/api/portuguese/queue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NEW_WORDS_BATCH_SIZE = 8;

export type PortugueseQueueWord = {
  id: string;
  unit: number;
  term_pt: string;
  term_de: string;
  example_pt: string | null;
  example_de: string | null;
  box: number;
};

export type PortugueseQueueResponse = {
  ok: true;
  due: PortugueseQueueWord[];
  new: PortugueseQueueWord[];
  stats: {
    totalWords: number;
    started: number;
    mastered: number;
    dueCount: number;
  };
};

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:portuguese:queue:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = createAdminClient();

  const [wordsRes, progressRes] = await Promise.all([
    sb
      .from("portuguese_words")
      .select("id,unit,term_pt,term_de,example_pt,example_de")
      .order("unit", { ascending: true })
      .order("term_pt", { ascending: true }),
    sb
      .from("portuguese_progress")
      .select("word_id,box,next_review_at")
      .eq("user_id", userId),
  ]);

  if (wordsRes.error) {
    console.error("portuguese queue words error:", wordsRes.error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }
  if (progressRes.error) {
    console.error("portuguese queue progress error:", progressRes.error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  const words = wordsRes.data ?? [];
  const progressByWordId = new Map(
    (progressRes.data ?? []).map((p) => [p.word_id as string, p]),
  );

  const nowMs = Date.now();
  const due: PortugueseQueueWord[] = [];
  const notStarted: PortugueseQueueWord[] = [];
  let mastered = 0;

  for (const w of words) {
    const progress = progressByWordId.get(w.id);
    if (!progress) {
      notStarted.push({ ...w, box: 0 });
      continue;
    }
    if (progress.box >= 5) mastered += 1;
    const dueAt = progress.next_review_at ? new Date(progress.next_review_at as string).getTime() : 0;
    if (dueAt <= nowMs) {
      due.push({ ...w, box: progress.box });
    }
  }

  due.sort((a, b) => a.unit - b.unit);

  return NextResponse.json({
    ok: true,
    due: due.slice(0, 20),
    new: notStarted.slice(0, NEW_WORDS_BATCH_SIZE),
    stats: {
      totalWords: words.length,
      started: progressByWordId.size,
      mastered,
      dueCount: due.length,
    },
  } satisfies PortugueseQueueResponse);
}
