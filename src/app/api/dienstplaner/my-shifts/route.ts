// src/app/api/dienstplaner/my-shifts/route.ts
// Liefert kommende Schichten des Mitarbeiters, der mit dem aktuellen Clerk-User verknüpft ist.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LOOKAHEAD_DAYS = 30;
const DEFAULT_LIMIT = 10;

function berlinToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysIso(dateValue: string, days: number) {
  const d = new Date(`${dateValue}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type MyShiftEntry = {
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  comment: string | null;
};

export type MyShiftsResponse = {
  ok: true;
  linked: boolean;
  employee: { id: number; name: string; color: string } | null;
  today: string;
  shifts: MyShiftEntry[];
};

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:dienstplaner:my-shifts");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = createAdminClient();

  const { data: employee, error: empErr } = await sb
    .from("dienstplan_employees")
    .select("id, name, color, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (empErr) {
    console.error("[my-shifts] employee lookup failed", empErr.message);
    return NextResponse.json({ ok: false, error: "lookup_failed" }, { status: 500 });
  }

  const today = berlinToday();

  if (!employee || !employee.is_active) {
    const payload: MyShiftsResponse = {
      ok: true,
      linked: false,
      employee: null,
      today,
      shifts: [],
    };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  const end = addDaysIso(today, DEFAULT_LOOKAHEAD_DAYS);

  const { data: shiftRows, error: shiftErr } = await sb
    .from("dienstplan_shifts")
    .select("shift_date, start_time, end_time, break_minutes, comment")
    .eq("employee_id", employee.id)
    .gte("shift_date", today)
    .lte("shift_date", end)
    .order("shift_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(DEFAULT_LIMIT);

  if (shiftErr) {
    console.error("[my-shifts] shift lookup failed", shiftErr.message);
    return NextResponse.json({ ok: false, error: "lookup_failed" }, { status: 500 });
  }

  const shifts: MyShiftEntry[] = (shiftRows ?? []).filter(
    (r) => r.start_time !== null || r.end_time !== null
  );

  const payload: MyShiftsResponse = {
    ok: true,
    linked: true,
    employee: { id: employee.id, name: employee.name, color: employee.color },
    today,
    shifts,
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
