// src/app/api/tasks/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";
import { notifyTaskAssigned } from "@/lib/notify";
import {
  replaceTaskAssignees,
  resolveDisplayNames,
  type Task,
} from "@/app/api/tasks/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/tasks/[id] */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const rl = await applyRateLimit(req, "api:tasks:patch");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  let body: {
    title?: string;
    description?: string | null;
    status?: string;
    priority?: string;
    assignee?: string | null;
    assignee_user_ids?: string[] | null;
    due_date?: string | null;
    category?: string | null;
    position?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: existing } = await sb
    .from("task_board_tasks")
    .select("id,status")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.title?.trim()) patch.title = body.title.trim().slice(0, 300);
  if ("description" in body) patch.description = body.description?.trim() || null;
  if (body.status !== undefined) {
    if (!["todo", "in_progress", "done"].includes(body.status)) {
      return NextResponse.json({ ok: false, error: "invalid status" }, { status: 400 });
    }
    patch.status = body.status;
    if (body.status !== existing.status) {
      const { data: maxRow } = await sb
        .from("task_board_tasks")
        .select("position")
        .eq("status", body.status)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      patch.position = maxRow ? (maxRow.position ?? 0) + 1 : 0;
    }
  }
  if (body.priority !== undefined) {
    if (!["low", "medium", "high"].includes(body.priority)) {
      return NextResponse.json({ ok: false, error: "invalid priority" }, { status: 400 });
    }
    patch.priority = body.priority;
  }
  if ("assignee" in body) patch.assignee = body.assignee?.trim() || null;
  if ("due_date" in body) {
    if (body.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) {
      return NextResponse.json({ ok: false, error: "invalid due_date" }, { status: 400 });
    }
    patch.due_date = body.due_date || null;
  }
  if ("category" in body) patch.category = body.category?.trim() || null;
  if (typeof body.position === "number" && !(body.status !== undefined && body.status !== existing.status)) {
    patch.position = body.position;
  }

  let touchedAssignees = false;
  if ("assignee_user_ids" in body) {
    const v = body.assignee_user_ids;
    if (v !== null && v !== undefined) {
      if (!Array.isArray(v) || v.some((s) => typeof s !== "string" || s.length > 128)) {
        return NextResponse.json({ ok: false, error: "invalid assignee_user_ids" }, { status: 400 });
      }
      if (v.length > 20) {
        return NextResponse.json({ ok: false, error: "too many assignees" }, { status: 400 });
      }
    }
    touchedAssignees = true;
  }

  const onlyUpdatedAt = Object.keys(patch).length === 1;
  if (onlyUpdatedAt && !touchedAssignees) {
    return NextResponse.json({ ok: false, error: "no fields to update" }, { status: 400 });
  }

  let updated: Omit<Task, "assignees">;
  if (onlyUpdatedAt) {
    const { data: current, error: curErr } = await sb
      .from("task_board_tasks")
      .select("*")
      .eq("id", id)
      .single();
    if (curErr || !current) {
      console.error("tasks PATCH reload error:", curErr?.message);
      return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
    }
    updated = current as Omit<Task, "assignees">;
  } else {
    const { data, error } = await sb
      .from("task_board_tasks")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      console.error("tasks PATCH error:", error?.message);
      return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
    }
    updated = data as Omit<Task, "assignees">;
  }

  let newlyAssigned: string[] = [];
  if (touchedAssignees) {
    const ids = Array.isArray(body.assignee_user_ids) ? body.assignee_user_ids : [];
    const { data: priorRows } = await sb
      .from("task_board_task_assignees")
      .select("user_id")
      .eq("task_id", id);
    const prior = new Set((priorRows ?? []).map((r) => r.user_id));
    newlyAssigned = ids.filter((uid) => !prior.has(uid));
    await replaceTaskAssignees(id, ids);
  }

  const { data: assigneeRows } = await sb
    .from("task_board_task_assignees")
    .select("user_id")
    .eq("task_id", id);
  const userIds = (assigneeRows ?? []).map((r) => r.user_id);
  const names = await resolveDisplayNames(userIds);
  const enriched: Task = {
    ...updated,
    assignees: userIds.map((uid) => ({ user_id: uid, display_name: names.get(uid) ?? uid })),
  };

  await logAudit({
    action: "task_update",
    actorUserId: userId,
    actorEmail: null,
    target: `task_board_tasks:${id}`,
  });

  if (newlyAssigned.length > 0) {
    await notifyTaskAssigned({
      taskId: id,
      taskTitle: enriched.title,
      actorUserId: userId,
      newAssigneeIds: newlyAssigned,
    });
  }

  return NextResponse.json({ ok: true, data: enriched });
}

/** DELETE /api/tasks/[id] */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const rl = await applyRateLimit(req, "api:tasks:delete");
  if (rl instanceof NextResponse) return rl;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const sb = createAdminClient();

  const { data: existing } = await sb
    .from("task_board_tasks")
    .select("id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  // Junction rows cascade via FK on delete
  const { error } = await sb.from("task_board_tasks").delete().eq("id", id);

  if (error) {
    console.error("tasks DELETE error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  await logAudit({
    action: "task_delete",
    actorUserId: userId,
    actorEmail: null,
    target: `task_board_tasks:${id}`,
  });

  return NextResponse.json({ ok: true });
}
