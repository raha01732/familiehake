// src/app/api/tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";
import { withIdempotency } from "@/lib/idempotency";
import { formatUserDisplayName } from "@/lib/user-display";
import { notifyTaskAssigned } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type TaskAssignee = {
  user_id: string;
  display_name: string;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  assignee: string | null;
  assignees: TaskAssignee[];
  due_date: string | null;
  category: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type DbTaskRow = Omit<Task, "assignees">;
type DbAssigneeRow = { task_id: string; user_id: string };

/** Resolve Clerk user_ids → display names. One batch call. */
export async function resolveDisplayNames(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return out;

  try {
    const client = await clerkClient();
    const res = await client.users.getUserList({ userId: unique, limit: Math.max(unique.length, 1) });
    for (const u of res.data) {
      out.set(
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
  return out;
}

function buildAssigneeList(
  userIds: string[],
  names: Map<string, string>
): TaskAssignee[] {
  return userIds.map((id) => ({
    user_id: id,
    display_name: names.get(id) ?? id,
  }));
}

/** Replace the entire assignee set for a task (delete-then-insert). */
export async function replaceTaskAssignees(taskId: string, userIds: string[]): Promise<void> {
  const sb = createAdminClient();
  const clean = Array.from(new Set(userIds.map((s) => s.trim()).filter(Boolean)));

  await sb.from("task_board_task_assignees").delete().eq("task_id", taskId);
  if (clean.length === 0) return;

  await sb
    .from("task_board_task_assignees")
    .insert(clean.map((user_id) => ({ task_id: taskId, user_id })));
}

/** GET /api/tasks — returns all tasks with their assignees. */
export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "api:tasks:get");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = createAdminClient();
  const { data: taskRows, error: taskErr } = await sb
    .from("task_board_tasks")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (taskErr) {
    console.error("tasks GET error:", taskErr.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  const rows = (taskRows ?? []) as DbTaskRow[];
  const taskIds = rows.map((r) => r.id);

  let assigneeRows: DbAssigneeRow[] = [];
  if (taskIds.length > 0) {
    const { data: aRows, error: aErr } = await sb
      .from("task_board_task_assignees")
      .select("task_id, user_id")
      .in("task_id", taskIds);
    if (aErr) {
      console.error("tasks GET assignee error:", aErr.message);
    } else {
      assigneeRows = aRows ?? [];
    }
  }

  const byTask = new Map<string, string[]>();
  for (const a of assigneeRows) {
    const arr = byTask.get(a.task_id) ?? [];
    arr.push(a.user_id);
    byTask.set(a.task_id, arr);
  }

  const names = await resolveDisplayNames(assigneeRows.map((a) => a.user_id));

  const enriched: Task[] = rows.map((r) => ({
    ...r,
    assignees: buildAssigneeList(byTask.get(r.id) ?? [], names),
  }));

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
    assignee_user_ids?: string[] | null;
    due_date?: string | null;
    category?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  return withIdempotency(req, userId, () => insertTask(userId, body));
}

async function insertTask(
  userId: string,
  body: {
    title: string;
    description?: string | null;
    status?: string;
    priority?: string;
    assignee?: string | null;
    due_date?: string | null;
    category?: string | null;
  },
): Promise<NextResponse> {
  const { title, description, status = "todo", priority = "medium", assignee, due_date, category } = body;
  const {
    title,
    description,
    status = "todo",
    priority = "medium",
    assignee,
    assignee_user_ids,
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
  if (assignee_user_ids !== undefined && assignee_user_ids !== null) {
    if (!Array.isArray(assignee_user_ids) || assignee_user_ids.some((s) => typeof s !== "string" || s.length > 128)) {
      return NextResponse.json({ ok: false, error: "invalid assignee_user_ids" }, { status: 400 });
    }
    if (assignee_user_ids.length > 20) {
      return NextResponse.json({ ok: false, error: "too many assignees" }, { status: 400 });
    }
  }

  const sb = createAdminClient();

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

  const row = data as DbTaskRow;
  const ids = Array.isArray(assignee_user_ids) ? assignee_user_ids : [];
  if (ids.length > 0) {
    await replaceTaskAssignees(row.id, ids);
  }

  await logAudit({
    action: "task_create",
    actorUserId: userId,
    actorEmail: null,
    target: `task_board_tasks:${row.id}`,
    detail: { title: row.title, status, assignees: ids },
  });

  if (ids.length > 0) {
    await notifyTaskAssigned({
      taskId: row.id,
      taskTitle: row.title,
      actorUserId: userId,
      newAssigneeIds: ids,
    });
  }

  const names = await resolveDisplayNames(ids);
  const enriched: Task = { ...row, assignees: buildAssigneeList(ids, names) };

  return NextResponse.json({ ok: true, data: enriched }, { status: 201 });
}
