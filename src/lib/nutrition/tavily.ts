// src/lib/nutrition/tavily.ts
// Tavily Web Search — freier Tier: 1.000 Requests / Monat.
import { env } from "@/lib/env";
import { getCachedJson, setCachedJson } from "@/lib/redis";
import { cacheKey } from "@/lib/cache-key";

const TAVILY_TTL = 60 * 60 * 6; // 6 h — Ernährungsrecherchen altern langsam

export type TavilyResult = {
  title: string;
  url: string;
  content: string;
};

export type TavilySearchResponse = {
  answer: string | null;
  results: TavilyResult[];
};

export function tavilyEnabled(): boolean {
  return Boolean(env().TAVILY_API_KEY);
}

type SearchArgs = {
  query: string;
  maxResults?: number;
  includeAnswer?: boolean;
};

export async function search(args: SearchArgs): Promise<TavilySearchResponse> {
  const key = env().TAVILY_API_KEY;
  if (!key) return { answer: null, results: [] };

  const ck = cacheKey("tavily:search", {
    q: args.query.toLowerCase().trim(),
    max: args.maxResults ?? 5,
    inc: args.includeAnswer ?? true,
  });
  const cached = await getCachedJson<TavilySearchResponse>(ck);
  if (cached) return cached;

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query: args.query,
      search_depth: "basic",
      include_answer: args.includeAnswer ?? true,
      max_results: args.maxResults ?? 5,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    console.error("tavily search failed", res.status, await res.text().catch(() => ""));
    return { answer: null, results: [] };
  }
  const json: any = await res.json().catch(() => ({}));
  const results: TavilyResult[] = Array.isArray(json?.results)
    ? json.results.map((r: any) => ({
        title: String(r?.title ?? ""),
        url: String(r?.url ?? ""),
        content: String(r?.content ?? ""),
      }))
    : [];
  const response: TavilySearchResponse = {
    answer: typeof json?.answer === "string" ? json.answer : null,
    results,
  };

  if (results.length > 0) {
    await setCachedJson(ck, response, TAVILY_TTL);
  }
  return response;
}
