// src/app/api/nutrition/favorites/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";
import { withIdempotency } from "@/lib/idempotency";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type NutritionFavorite = {
  id: string;
  source: "spoonacular" | "ai";
  external_id: string | null;
  title: string;
  image_url: string | null;
  summary: string | null;
  ingredients: string[];
  instructions: string | null;
  ready_in_minutes: number | null;
  servings: number | null;
  diet: string | null;
  source_url: string | null;
  created_at: string;
};

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:nutrition:fav:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("nutrition_favorites")
    .select(
      "id,source,external_id,title,image_url,summary,ingredients,instructions,ready_in_minutes,servings,diet,source_url,created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("nutrition favorites GET error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:nutrition:fav:post");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Partial<NutritionFavorite>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  return withIdempotency(req, userId, () => insertFavorite(userId, body));
}

async function insertFavorite(
  userId: string,
  body: Partial<NutritionFavorite>,
): Promise<NextResponse> {
  const source = body.source;
  if (source !== "spoonacular" && source !== "ai") {
    return NextResponse.json({ ok: false, error: "invalid source" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 300) {
    return NextResponse.json({ ok: false, error: "invalid title" }, { status: 400 });
  }
  const ingredients = Array.isArray(body.ingredients)
    ? body.ingredients.filter((x): x is string => typeof x === "string").slice(0, 80)
    : [];

  const row = {
    user_id: userId,
    source,
    external_id: body.external_id ?? null,
    title,
    image_url: body.image_url ?? null,
    summary: body.summary ?? null,
    ingredients,
    instructions: body.instructions ?? null,
    ready_in_minutes:
      typeof body.ready_in_minutes === "number" ? body.ready_in_minutes : null,
    servings: typeof body.servings === "number" ? body.servings : null,
    diet: body.diet ?? null,
    source_url: body.source_url ?? null,
  };

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("nutrition_favorites")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    // Duplicate for the same external recipe
    if (error.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "already saved" },
        { status: 409 },
      );
    }
    console.error("nutrition favorites POST error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  await logAudit({
    action: "nutrition_favorite_create",
    actorUserId: userId,
    actorEmail: null,
    target: `nutrition_favorites:${data.id}`,
    detail: { source, title },
  });

  return NextResponse.json({ ok: true, data }, { status: 201 });
}
