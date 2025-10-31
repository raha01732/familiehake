import { NextRequest, NextResponse } from "next/server";
import { canAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const route = new URL(req.url).searchParams.get("route") || "";
  const allowed = route ? await canAccess(route) : false;
  return NextResponse.json({ allowed });
}
