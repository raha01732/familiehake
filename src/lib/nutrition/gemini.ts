// src/lib/nutrition/gemini.ts
// Direct fetch to Google Gemini (OpenAI-compatible REST endpoint).
import { env } from "@/lib/env";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_MODEL = "gemini-2.5-flash";

export function geminiEnabled(): boolean {
  return Boolean(env().GEMINI_API_KEY);
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatArgs = {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export async function chat(args: ChatArgs): Promise<string> {
  const key = env().GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");

  const model = args.model || env().GEMINI_MODEL || DEFAULT_MODEL;

  const res = await fetch(`${GEMINI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: args.messages,
      temperature: args.temperature ?? 0.7,
      max_tokens: args.maxTokens ?? 1200,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Gemini returned no content");
  }
  return content;
}

export async function chatJson<T = unknown>(args: ChatArgs): Promise<T> {
  const key = env().GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");

  const model = args.model || env().GEMINI_MODEL || DEFAULT_MODEL;

  const res = await fetch(`${GEMINI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: args.messages,
      temperature: args.temperature ?? 0.4,
      max_tokens: args.maxTokens ?? 1400,
      response_format: { type: "json_object" },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Gemini returned no content");
  }
  return JSON.parse(content) as T;
}
