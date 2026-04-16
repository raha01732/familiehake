// src/app/api/tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  assignee: string | null;
  due_date: string | null;
  category: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** GET /api/tasks — returns all tasks (shared board) */
export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:tasks:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("task_board_tasks")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    console.error("tasks GET error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: data ?? [] });
}

/** POST /api/tasks */
export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:tasks:post");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: {
    title: string;
    description?: string | null;
    status?: string;
    priority?: string;
    assignee?: string | null;
    due_date?: string | null;
    category?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const { title, description, status = "todo", priority = "medium", assignee, due_date, category } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0 || title.length > 300) {
    return NextResponse.json({ ok: false, error: "invalid title" }, { status: 400 });
  }
  if (!["todo", "in_progress", "done"].includes(status)) {
    return NextResponse.json({ ok: false, error: "invalid status" }, { status: 400 });
  }
  if (!["low", "medium", "high"].includes(priority)) {
    return NextResponse.json({ ok: false, error: "invalid priority" }, { status: 400 });
  }
  if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    return NextResponse.json({ ok: false, error: "invalid due_date" }, { status: 400 });
  }

  const sb = createAdminClient();

  // Append at the end of the chosen column
  const { data: maxRow } = await sb
    .from("task_board_tasks")
    .select("position")
    .eq("status", status)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = maxRow ? (maxRow.position ?? 0) + 1 : 0;

  const { data, error } = await sb
    .from("task_board_tasks")
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      status,
      priority,
      assignee: assignee?.trim() || null,
      due_date: due_date || null,
      category: category?.trim() || null,
      position,
      created_by: userId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("tasks POST error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  await logAudit({
    action: "task_create",
    actorUserId: userId,
    actorEmail: null,
    target: `task_board_tasks:${data.id}`,
    detail: { title: data.title, status },
  });

  return NextResponse.json({ ok: true, data }, { status: 201 });
}
