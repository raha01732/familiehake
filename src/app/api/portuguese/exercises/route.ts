// src/app/api/portuguese/exercises/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { geminiEnabled, chatJson } from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXERCISE_COUNT = 5;
const MIN_KNOWN_WORDS = 5;
const CONTEXT_WORDS_LIMIT = 25;

export type PortugueseExercise = {
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
};

type AiExercisesResponse = { exercises: PortugueseExercise[] };

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:portuguese:exercises:post");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!geminiEnabled()) {
    return NextResponse.json({ ok: false, error: "ai not configured" }, { status: 503 });
  }

  const sb = createAdminClient();

  const { data: progressRows, error: progressError } = await sb
    .from("portuguese_progress")
    .select("word_id")
    .eq("user_id", userId)
    .gte("box", 1)
    .order("last_reviewed_at", { ascending: false })
    .limit(CONTEXT_WORDS_LIMIT);

  if (progressError) {
    console.error("portuguese exercises progress error:", progressError.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  const wordIds = (progressRows ?? []).map((r) => r.word_id as string);
  if (wordIds.length < MIN_KNOWN_WORDS) {
    return NextResponse.json(
      { ok: false, error: "not enough words learned yet", minWords: MIN_KNOWN_WORDS },
      { status: 422 },
    );
  }

  const { data: words, error: wordsError } = await sb
    .from("portuguese_words")
    .select("term_pt,term_de,example_pt,example_de")
    .in("id", wordIds);

  if (wordsError) {
    console.error("portuguese exercises words error:", wordsError.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  const vocabList = (words ?? [])
    .map((w) => `- ${w.term_pt} = ${w.term_de}${w.example_pt ? ` (Beispiel: ${w.example_pt})` : ""}`)
    .join("\n");

  const system = [
    "Du bist ein Portugiesisch-Sprachlehrer für deutschsprachige Anfänger (europäisches Portugiesisch).",
    "Erstelle Multiple-Choice-Übungen NUR mit dem unten gegebenen Wortschatz - erfinde keine neuen Wörter.",
    "Mische drei Aufgabentypen: Portugiesisch->Deutsch übersetzen, Deutsch->Portugiesisch übersetzen,",
    "und einfache Lückensätze auf Portugiesisch (mit den bekannten Wörtern gebildet).",
    "Jede Aufgabe hat genau 4 Antwortmöglichkeiten, davon genau eine richtig, und eine kurze,",
    "freundliche Erklärung auf Deutsch. Antworte ausschließlich als JSON-Objekt der Form",
    '{"exercises":[{"question":"...","choices":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}',
  ].join(" ");

  const user = `Bekannter Wortschatz:\n${vocabList}\n\nErstelle genau ${EXERCISE_COUNT} Übungen.`;

  try {
    const result = await chatJson<AiExercisesResponse>({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.6,
      maxTokens: 1800,
    });

    const exercises = Array.isArray(result?.exercises) ? result.exercises.slice(0, EXERCISE_COUNT) : [];
    if (exercises.length === 0) {
      return NextResponse.json({ ok: false, error: "ai returned no exercises" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, data: exercises });
  } catch (error) {
    console.error("portuguese exercises AI error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "ai error" }, { status: 502 });
  }
}
