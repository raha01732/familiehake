// src/app/api/nutrition/recipes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { applyRateLimit } from "@/lib/ratelimit";
import {
  searchRecipes,
  spoonacularEnabled,
  type SpoonacularRecipe,
} from "@/lib/nutrition/spoonacular";
import {
  aiGatewayEnabled,
  chatJson,
} from "@/lib/nutrition/ai-gateway";
import {
  mapDietToSpoonacular,
  mapAllergiesToSpoonacular,
  dietLabel,
  allergyLabels,
} from "@/lib/nutrition/constants";
import { getCachedJson, setCachedJson } from "@/lib/redis";
import { cacheKey } from "@/lib/cache-key";

const AI_RECIPE_TTL = 60 * 60; // 1 h — KI-Ergebnisse sind nicht deterministisch, aber Kosten sparen

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type NutritionRecipe = {
  source: "spoonacular" | "ai";
  externalId: string | null;
  title: string;
  image: string | null;
  summary: string | null;
  readyInMinutes: number | null;
  servings: number | null;
  ingredients: string[];
  instructions: string | null;
  usedIngredients?: string[];
  missedIngredients?: string[];
  sourceUrl: string | null;
};

type AiRecipe = {
  title: string;
  summary?: string;
  readyInMinutes?: number;
  servings?: number;
  ingredients: string[];
  instructions: string;
};

type AiRecipeResponse = { recipes: AiRecipe[] };

/**
 * GET /api/nutrition/recipes?ingredients=tomato,pasta&diet=vegan&allergies=gluten,dairy
 *
 * Versucht zuerst Spoonacular. Wenn kein Key gesetzt ist oder keine Treffer:
 * Fallback auf AI Gateway, das deutsche Rezepte direkt erzeugt.
 */
export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:nutrition:recipes:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const ingredients = parseList(sp.get("ingredients")).slice(0, 10);
  const diet = sp.get("diet");
  const allergies = parseList(sp.get("allergies")).slice(0, 10);

  if (ingredients.length === 0) {
    return NextResponse.json(
      { ok: false, error: "no ingredients provided" },
      { status: 400 },
    );
  }

  if (spoonacularEnabled()) {
    const spooned = await searchRecipes({
      ingredients,
      diet: mapDietToSpoonacular(diet),
      intolerances: mapAllergiesToSpoonacular(allergies),
      number: 12,
    });

    if (spooned.length > 0) {
      return NextResponse.json({
        ok: true,
        source: "spoonacular",
        data: spooned.map(toDtoFromSpoonacular),
      });
    }
  }

  // AI-Fallback (oder primär, wenn kein Spoonacular-Key vorhanden)
  if (!aiGatewayEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Keine Rezept-Quelle konfiguriert. Bitte SPOONACULAR_API_KEY oder AI_GATEWAY_API_KEY setzen.",
      },
      { status: 503 },
    );
  }

  const aiCacheKey = cacheKey("nutrition:ai-recipes", {
    ingredients: [...ingredients].map((s) => s.toLowerCase().trim()).sort(),
    diet: diet ?? null,
    allergies: [...allergies].sort(),
  });
  const cachedAi = await getCachedJson<AiRecipeResponse>(aiCacheKey);
  if (cachedAi) {
    return NextResponse.json({
      ok: true,
      source: "ai",
      cached: true,
      data: cachedAi.recipes.map(toDtoFromAi),
    });
  }

  try {
    const aiData = await generateAiRecipes({ ingredients, diet, allergies });
    if (aiData.recipes.length > 0) {
      await setCachedJson(aiCacheKey, aiData, AI_RECIPE_TTL);
    }
    return NextResponse.json({
      ok: true,
      source: "ai",
      data: aiData.recipes.map(toDtoFromAi),
    });
  } catch (err) {
    console.error("ai recipe generation failed", err);
    return NextResponse.json(
      { ok: false, error: "AI-Rezeptgenerierung fehlgeschlagen." },
      { status: 502 },
    );
  }
}

function parseList(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toDtoFromSpoonacular(r: SpoonacularRecipe): NutritionRecipe {
  const ingredients = (r.extendedIngredients ?? [])
    .map((x) => x.original.trim())
    .filter(Boolean);
  return {
    source: "spoonacular",
    externalId: String(r.id),
    title: r.title,
    image: r.image,
    summary: r.summary,
    readyInMinutes: r.readyInMinutes,
    servings: r.servings,
    ingredients,
    instructions: r.instructions ?? null,
    usedIngredients: r.usedIngredients,
    missedIngredients: r.missedIngredients,
    sourceUrl: r.sourceUrl,
  };
}

function toDtoFromAi(r: AiRecipe): NutritionRecipe {
  return {
    source: "ai",
    externalId: null,
    title: r.title,
    image: null,
    summary: r.summary ?? null,
    readyInMinutes: typeof r.readyInMinutes === "number" ? r.readyInMinutes : null,
    servings: typeof r.servings === "number" ? r.servings : null,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    instructions: r.instructions ?? null,
    sourceUrl: null,
  };
}

async function generateAiRecipes(args: {
  ingredients: string[];
  diet: string | null;
  allergies: string[];
}): Promise<AiRecipeResponse> {
  const dietText = dietLabel(args.diet);
  const allergyText =
    args.allergies.length > 0
      ? allergyLabels(args.allergies).join(", ")
      : "keine";

  const system = `Du bist ein deutschsprachiger Ernährungs- und Rezept-Assistent.
Du erstellst klare, familientaugliche Rezepte. Du hältst die Ernährungsweise und Unverträglichkeiten strikt ein.
Antworte ausschließlich als JSON, ohne Markdown-Zäune, nach folgendem Schema:
{
  "recipes": [
    {
      "title": "string",
      "summary": "string (1-2 Sätze)",
      "readyInMinutes": number,
      "servings": number,
      "ingredients": ["500 g Tomaten", "2 EL Olivenöl", ...],
      "instructions": "Fließtext mit nummerierten Schritten getrennt durch Zeilenumbrüche."
    }
  ]
}
Gib 3 Rezepte zurück.`;

  const user = `Zutaten, die verfügbar sind: ${args.ingredients.join(", ")}.
Ernährungsweise: ${dietText}.
Allergien/Unverträglichkeiten zu vermeiden: ${allergyText}.
Mengen sind für 2-4 Personen auszulegen. Zeige realistische Kochzeiten.`;

  return await chatJson<AiRecipeResponse>({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.6,
    maxTokens: 2000,
  });
}
