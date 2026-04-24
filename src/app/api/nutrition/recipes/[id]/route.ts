// src/app/api/nutrition/recipes/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { applyRateLimit } from "@/lib/ratelimit";
import { getRecipeById, spoonacularEnabled } from "@/lib/nutrition/spoonacular";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rl = await applyRateLimit(req, "api:nutrition:recipe:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!spoonacularEnabled()) {
    return NextResponse.json(
      { ok: false, error: "spoonacular not configured" },
      { status: 503 },
    );
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  const recipe = await getRecipeById(id);
  if (!recipe) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: recipe });
}
