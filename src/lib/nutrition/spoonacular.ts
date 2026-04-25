// src/lib/nutrition/spoonacular.ts
import { env } from "@/lib/env";
import { getCachedJson, setCachedJson } from "@/lib/redis";
import { cacheKey } from "@/lib/cache-key";

const SEARCH_TTL = 60 * 60 * 6; // 6 h
const DETAIL_TTL = 60 * 60 * 24; // 24 h

export type SpoonacularRecipe = {
  id: number;
  title: string;
  image: string | null;
  readyInMinutes: number | null;
  servings: number | null;
  sourceUrl: string | null;
  summary: string | null;
  diets: string[];
  usedIngredients?: string[];
  missedIngredients?: string[];
  extendedIngredients?: Array<{ original: string }>;
  instructions?: string | null;
};

const BASE = "https://api.spoonacular.com";

export function spoonacularEnabled(): boolean {
  return Boolean(env().SPOONACULAR_API_KEY);
}

type SearchArgs = {
  ingredients: string[];
  diet: string | null;
  intolerances: string;
  number?: number;
};

/**
 * Suche mit Zutaten + Diät/Unverträglichkeiten.
 * Nutzt complexSearch (unterstützt diet + intolerances, anders als findByIngredients).
 */
export async function searchRecipes(args: SearchArgs): Promise<SpoonacularRecipe[]> {
  const key = env().SPOONACULAR_API_KEY;
  if (!key) return [];

  // Sortiere Zutaten für stabilen Cache-Key — "tomato,pasta" == "pasta,tomato"
  const normalized = {
    ingredients: [...args.ingredients].map((s) => s.toLowerCase().trim()).sort(),
    diet: args.diet ?? null,
    intolerances: args.intolerances
      ? args.intolerances.split(",").map((s) => s.trim()).sort().join(",")
      : "",
    number: args.number ?? 12,
  };
  const ck = cacheKey("spoon:search", normalized);
  const cached = await getCachedJson<SpoonacularRecipe[]>(ck);
  if (cached) return cached;

  const params = new URLSearchParams({
    apiKey: key,
    addRecipeInformation: "true",
    fillIngredients: "true",
    number: String(normalized.number),
    sort: "max-used-ingredients",
  });
  if (normalized.ingredients.length > 0) {
    params.set("includeIngredients", normalized.ingredients.join(","));
  }
  if (normalized.diet) params.set("diet", normalized.diet);
  if (normalized.intolerances) params.set("intolerances", normalized.intolerances);

  const res = await fetch(`${BASE}/recipes/complexSearch?${params}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("spoonacular search failed", res.status, await res.text().catch(() => ""));
    return [];
  }
  const json = await res.json().catch(() => ({}));
  const results: any[] = Array.isArray(json?.results) ? json.results : [];
  const mapped = results.map(mapRecipe);

  if (mapped.length > 0) {
    await setCachedJson(ck, mapped, SEARCH_TTL);
  }
  return mapped;
}

export async function getRecipeById(id: number | string): Promise<SpoonacularRecipe | null> {
  const key = env().SPOONACULAR_API_KEY;
  if (!key) return null;

  const ck = `spoon:recipe:${String(id)}`;
  const cached = await getCachedJson<SpoonacularRecipe>(ck);
  if (cached) return cached;

  const res = await fetch(
    `${BASE}/recipes/${encodeURIComponent(String(id))}/information?apiKey=${encodeURIComponent(key)}&includeNutrition=false`,
    { headers: { accept: "application/json" }, cache: "no-store" },
  );
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  if (!json) return null;
  const mapped = mapRecipe(json);
  await setCachedJson(ck, mapped, DETAIL_TTL);
  return mapped;
}

function mapRecipe(r: any): SpoonacularRecipe {
  return {
    id: Number(r?.id),
    title: String(r?.title ?? ""),
    image: r?.image ?? null,
    readyInMinutes: typeof r?.readyInMinutes === "number" ? r.readyInMinutes : null,
    servings: typeof r?.servings === "number" ? r.servings : null,
    sourceUrl: r?.sourceUrl ?? null,
    summary: typeof r?.summary === "string" ? stripHtml(r.summary) : null,
    diets: Array.isArray(r?.diets) ? r.diets.map(String) : [],
    usedIngredients: Array.isArray(r?.usedIngredients)
      ? r.usedIngredients.map((i: any) => String(i?.name ?? i?.original ?? "")).filter(Boolean)
      : undefined,
    missedIngredients: Array.isArray(r?.missedIngredients)
      ? r.missedIngredients.map((i: any) => String(i?.name ?? i?.original ?? "")).filter(Boolean)
      : undefined,
    extendedIngredients: Array.isArray(r?.extendedIngredients)
      ? r.extendedIngredients.map((i: any) => ({ original: String(i?.original ?? "") }))
      : undefined,
    instructions: typeof r?.instructions === "string" ? stripHtml(r.instructions) : null,
  };
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
