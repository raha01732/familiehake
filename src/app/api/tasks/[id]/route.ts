// src/app/api/tasks/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyRateLimit } from "@/lib/ratelimit";
import { logAudit } from "@/lib/audit";
import { formatUserDisplayName } from "@/lib/user-display";

async function resolveAssigneeName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const client = await clerkClient();
    const u = await client.users.getUser(userId);
    return formatUserDisplayName({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      username: u.username,
      emailAddresses: u.emailAddresses?.map((e) => ({ emailAddress: e.emailAddress })) ?? null,
    });
  } catch {
    return null;
  }
}

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
    assignee_user_id?: string | null;
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
    // When moving to a different column, place task at the end of the target column
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
  if ("assignee_user_id" in body) {
    const v = body.assignee_user_id;
    if (v !== null && v !== undefined && (typeof v !== "string" || v.length > 128)) {
      return NextResponse.json({ ok: false, error: "invalid assignee_user_id" }, { status: 400 });
    }
    patch.assignee_user_id = v?.trim() || null;
  }
  if ("due_date" in body) {
    if (body.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) {
      return NextResponse.json({ ok: false, error: "invalid due_date" }, { status: 400 });
    }
    patch.due_date = body.due_date || null;
  }
  if ("category" in body) patch.category = body.category?.trim() || null;
  // Only apply explicit position if no status change triggered auto-positioning
  if (typeof body.position === "number" && !(body.status !== undefined && body.status !== existing.status)) {
    patch.position = body.position;
  }

  // Guard: if only updated_at was set, there is nothing to update
  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ ok: false, error: "no fields to update" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("task_board_tasks")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("tasks PATCH error:", error.message);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }

  await logAudit({
    action: "task_update",
    actorUserId: userId,
    actorEmail: null,
    target: `task_board_tasks:${id}`,
  });

  const assignee_name = await resolveAssigneeName(data.assignee_user_id);
  return NextResponse.json({ ok: true, data: { ...data, assignee_name } });
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
