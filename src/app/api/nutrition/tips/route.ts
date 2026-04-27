// src/app/api/nutrition/tips/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { applyRateLimit } from "@/lib/ratelimit";
import { geminiEnabled, chat } from "@/lib/nutrition/gemini";
import { search as tavilySearch, tavilyEnabled, type TavilyResult } from "@/lib/nutrition/tavily";
import { allergyLabels, dietLabel } from "@/lib/nutrition/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type NutritionTipResponse = {
  answer: string;
  sources: Array<{ title: string; url: string }>;
  usedWebSearch: boolean;
};

/**
 * POST /api/nutrition/tips
 * body: { question: string, diet?: string, allergies?: string[], useWeb?: boolean }
 */
export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:nutrition:tips:post");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    question?: string;
    diet?: string;
    allergies?: string[];
    useWeb?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 600) {
    return NextResponse.json({ ok: false, error: "invalid question" }, { status: 400 });
  }

  if (!geminiEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: "GEMINI_API_KEY fehlt — Ernährungstipps sind deaktiviert.",
      },
      { status: 503 },
    );
  }

  const diet = typeof body.diet === "string" ? body.diet : null;
  const allergies = Array.isArray(body.allergies)
    ? body.allergies.filter((a): a is string => typeof a === "string").slice(0, 10)
    : [];
  const useWeb = Boolean(body.useWeb) && tavilyEnabled();

  let webContext = "";
  let sources: Array<{ title: string; url: string }> = [];
  if (useWeb) {
    const webQuery = buildWebQuery(question, diet, allergies);
    const web = await tavilySearch({ query: webQuery, maxResults: 5 });
    if (web.results.length > 0) {
      webContext = formatWebContext(web.results);
      sources = web.results.map((r) => ({ title: r.title, url: r.url }));
    }
  }

  const system = `Du bist ein deutschsprachiger Ernährungs- und Gesundheits-Assistent für eine Familie.
Gib präzise, praktische Tipps in klarem Deutsch. Schreibe in kurzen Absätzen oder Stichpunkten.
Du bist kein Arzt — bei medizinischen Themen weise freundlich auf Rücksprache mit Fachpersonal hin.
Beachte strikt die Ernährungsweise und Allergien des Nutzers.
Wenn dir Web-Recherche bereitgestellt wird, zitiere relevante Aussagen und nenne Quellen als [Nummer] passend zur Reihenfolge der Quellen.`;

  const userParts = [
    `Frage: ${question}`,
    `Ernährungsweise: ${dietLabel(diet)}.`,
    `Allergien/Unverträglichkeiten: ${
      allergies.length > 0 ? allergyLabels(allergies).join(", ") : "keine"
    }.`,
  ];
  if (webContext) {
    userParts.push(`\nAktuelle Web-Recherche (nutze sie, zitiere passend):\n${webContext}`);
  }

  try {
    const answer = await chat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: userParts.join("\n") },
      ],
      temperature: 0.5,
      maxTokens: 900,
    });

    const response: NutritionTipResponse = {
      answer: answer.trim(),
      sources,
      usedWebSearch: useWeb && sources.length > 0,
    };
    return NextResponse.json({ ok: true, data: response });
  } catch (err) {
    console.error("nutrition tips failed", err);
    return NextResponse.json(
      { ok: false, error: "AI-Antwort fehlgeschlagen." },
      { status: 502 },
    );
  }
}

function buildWebQuery(question: string, diet: string | null, allergies: string[]): string {
  const parts = [question];
  if (diet && diet !== "normal") parts.push(dietLabel(diet));
  if (allergies.length > 0) parts.push(`ohne ${allergyLabels(allergies).join(", ")}`);
  return parts.join(" ");
}

function formatWebContext(results: TavilyResult[]): string {
  return results
    .map((r, i) => {
      const snippet = r.content.replace(/\s+/g, " ").slice(0, 600);
      return `[${i + 1}] ${r.title}\n${snippet}\nQuelle: ${r.url}`;
    })
    .join("\n\n");
}
