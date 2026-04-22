// src/app/api/users/list/route.ts
// Leichtgewichtige Verzeichnis-API für UI-Dropdowns (z.B. Aufgaben-Zuweisung).
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { applyRateLimit } from "@/lib/ratelimit";
import { formatUserDisplayName } from "@/lib/user-display";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type UserDirectoryEntry = {
  id: string;
  displayName: string;
};

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:users:list");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const client = await clerkClient();
    const list = await client.users.getUserList({ limit: 200, orderBy: "-created_at" });

    const data: UserDirectoryEntry[] = list.data
      .map((u) => ({
        id: u.id,
        displayName: formatUserDisplayName({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          username: u.username,
          emailAddresses: u.emailAddresses?.map((e) => ({ emailAddress: e.emailAddress })) ?? null,
        }),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("users/list error:", e);
    return NextResponse.json({ ok: false, error: "clerk error" }, { status: 500 });
  }
}
