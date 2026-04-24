// src/lib/nutrition/ai-gateway.ts
// Direct fetch to Vercel AI Gateway (OpenAI-compatible endpoint)
import { env } from "@/lib/env";

const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";
const DEFAULT_MODEL = "openai/gpt-4o-mini";

export function aiGatewayEnabled(): boolean {
  return Boolean(env().AI_GATEWAY_API_KEY);
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
  const key = env().AI_GATEWAY_API_KEY;
  if (!key) throw new Error("AI_GATEWAY_API_KEY is not configured");

  const model = args.model || env().AI_GATEWAY_MODEL || DEFAULT_MODEL;

  const res = await fetch(`${GATEWAY_BASE}/chat/completions`, {
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
    throw new Error(`AI Gateway ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("AI Gateway returned no content");
  }
  return content;
}

export async function chatJson<T = unknown>(args: ChatArgs): Promise<T> {
  const key = env().AI_GATEWAY_API_KEY;
  if (!key) throw new Error("AI_GATEWAY_API_KEY is not configured");

  const model = args.model || env().AI_GATEWAY_MODEL || DEFAULT_MODEL;

  const res = await fetch(`${GATEWAY_BASE}/chat/completions`, {
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
    throw new Error(`AI Gateway ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("AI Gateway returned no content");
  }
  return JSON.parse(content) as T;
}
