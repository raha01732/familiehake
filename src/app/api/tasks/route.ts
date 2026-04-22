// src/app/api/tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";
import { formatUserDisplayName } from "@/lib/user-display";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  assignee: string | null;
  assignee_user_id: string | null;
  assignee_name: string | null;
  due_date: string | null;
  category: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type DbTaskRow = Omit<Task, "assignee_name">;

async function resolveAssigneeNames(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return map;

  try {
    const client = await clerkClient();
    const res = await client.users.getUserList({ userId: unique, limit: Math.max(unique.length, 1) });
    for (const u of res.data) {
      map.set(
        u.id,
        formatUserDisplayName({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          username: u.username,
          emailAddresses: u.emailAddresses?.map((e) => ({ emailAddress: e.emailAddress })) ?? null,
        })
      );
    }
  } catch (e) {
    console.error("tasks: clerk name resolution failed:", e);
  }
  return map;
}

function withAssigneeName(row: DbTaskRow, names: Map<string, string>): Task {
  return {
    ...row,
    assignee_name: row.assignee_user_id ? names.get(row.assignee_user_id) ?? null : null,
  };
}

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
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("tasks GET error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  const rows = (data ?? []) as DbTaskRow[];
  const names = await resolveAssigneeNames(rows.map((r) => r.assignee_user_id ?? "").filter(Boolean));
  const enriched = rows.map((r) => withAssigneeName(r, names));

  return NextResponse.json({ ok: true, data: enriched });
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
    assignee_user_id?: string | null;
    due_date?: string | null;
    category?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const {
    title,
    description,
    status = "todo",
    priority = "medium",
    assignee,
    assignee_user_id,
    due_date,
    category,
  } = body;

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
  if (assignee_user_id && (typeof assignee_user_id !== "string" || assignee_user_id.length > 128)) {
    return NextResponse.json({ ok: false, error: "invalid assignee_user_id" }, { status: 400 });
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
      assignee_user_id: assignee_user_id?.trim() || null,
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

  const row = data as DbTaskRow;
  const names = await resolveAssigneeNames(row.assignee_user_id ? [row.assignee_user_id] : []);
  return NextResponse.json({ ok: true, data: withAssigneeName(row, names) }, { status: 201 });
}
