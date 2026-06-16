// src/lib/workspace-locks.ts
//
// Pro-Rolle-Sperren für Workspaces. Eine Sperre zeigt das Tool weiterhin an,
// blockt aber den Aufruf mit einem Hinweis. getToolGate() bündelt die
// bestehende Pro-Tool-Wartung (tool_status) und die neue Workspace-Sperre.

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToolStatusMap } from "@/lib/tool-status";
import { WORKSPACES, getWorkspaceForRoute } from "@/lib/workspaces";
import type { SessionInfo } from "@/lib/auth";

export type WorkspaceLock = { locked: boolean; message: string | null };
/** workspaceKey -> roleName -> Lock */
export type WorkspaceLockMap = Map<string, Map<string, WorkspaceLock>>;

const getWorkspaceLocksCached = cache(async (): Promise<WorkspaceLockMap> => {
  const result: WorkspaceLockMap = new Map();
  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("workspace_locks")
      .select("workspace_key, role, locked, message");

    if (error) {
      console.error("[workspace-locks] failed to load workspace_locks", error);
      return result;
    }

    for (const row of data ?? []) {
      const wsKey = String(row.workspace_key ?? "");
      const role = String(row.role ?? "").toLowerCase();
      if (!wsKey || !role) continue;
      if (!result.has(wsKey)) result.set(wsKey, new Map());
      result.get(wsKey)!.set(role, {
        locked: row.locked === true,
        message: typeof row.message === "string" ? row.message : null,
      });
    }
  } catch (error) {
    console.error("[workspace-locks] unexpected error", error);
  }
  return result;
});

export async function getWorkspaceLocks(): Promise<WorkspaceLockMap> {
  return getWorkspaceLocksCached();
}

/**
 * Rollen, die einem Workspace Zugriff gewähren (access_rules.allowed = true für
 * mindestens eine seiner Routen). Wird für die Sperr-Auswertung gebraucht, damit
 * nur tatsächlich zugriffsgewährende Rollen eine Sperre auslösen können.
 */
const getWorkspaceGrantingRolesCached = cache(async (): Promise<Map<string, Set<string>>> => {
  const result = new Map<string, Set<string>>();
  for (const ws of WORKSPACES) result.set(ws.key, new Set());

  try {
    const allRoutes = WORKSPACES.flatMap((ws) => ws.routeKeys);
    if (allRoutes.length === 0) return result;

    const sb = createAdminClient();
    const { data, error } = await sb
      .from("access_rules")
      .select("route, role, allowed")
      .in("route", allRoutes);

    if (error) {
      console.error("[workspace-locks] failed to load access_rules", error);
      return result;
    }

    for (const row of data ?? []) {
      if (row.allowed !== true) continue;
      const ws = getWorkspaceForRoute(String(row.route ?? ""));
      if (!ws) continue;
      result.get(ws.key)!.add(String(row.role ?? "").toLowerCase());
    }
  } catch (error) {
    console.error("[workspace-locks] unexpected error (granting roles)", error);
  }
  return result;
});

export type ToolGate = { blocked: boolean; message: string | null };

const UNLOCKED: ToolGate = { blocked: false, message: null };

/**
 * Entscheidet, ob ein Tool für die aktuelle Session aufrufbar ist.
 * Reihenfolge: Superadmin darf immer. Danach greift die Pro-Tool-Wartung
 * (tool_status). Zuletzt die Workspace-Sperre: blockiert, wenn ALLE Rollen
 * des Nutzers, die diesen Workspace freischalten, gesperrt sind (eine freie
 * Rolle behält Zugriff).
 */
export async function getToolGate(routeKey: string, session: SessionInfo): Promise<ToolGate> {
  if (session.isSuperAdmin) return UNLOCKED;

  // 1) Pro-Tool-Wartung (bestehend)
  const toolStatusMap = await getToolStatusMap();
  const toolStatus = toolStatusMap[routeKey];
  if (toolStatus && !toolStatus.enabled) {
    return { blocked: true, message: toolStatus.maintenanceMessage };
  }

  // 2) Workspace-Sperre (pro Rolle)
  const ws = getWorkspaceForRoute(routeKey);
  if (!ws) return UNLOCKED;

  const locks = await getWorkspaceLocks();
  const wsLocks = locks.get(ws.key);
  if (!wsLocks || wsLocks.size === 0) return UNLOCKED;

  const grantingRolesByWs = await getWorkspaceGrantingRolesCached();
  const wsGranting = grantingRolesByWs.get(ws.key) ?? new Set<string>();

  const userGrantingRoles = session.roles
    .map((r) => r.name.toLowerCase())
    .filter((name) => wsGranting.has(name));

  // Kein Zugriff über irgendeine Rolle → keine Sperre nötig.
  if (userGrantingRoles.length === 0) return UNLOCKED;

  const allLocked = userGrantingRoles.every((name) => wsLocks.get(name)?.locked === true);
  if (!allLocked) return UNLOCKED;

  const message =
    userGrantingRoles
      .map((name) => wsLocks.get(name)?.message)
      .find((m) => m && m.trim().length > 0) ?? null;

  return { blocked: true, message };
}

/**
 * Liefert für die Sidebar/Tools-Hub, ob ein Workspace für die Session gesperrt
 * ist (pro Rolle). Tools bleiben sichtbar, werden aber als „gesperrt" markiert.
 */
export async function getLockedWorkspaceKeys(session: SessionInfo): Promise<Set<string>> {
  const result = new Set<string>();
  if (session.isSuperAdmin) return result;

  const locks = await getWorkspaceLocks();
  if (locks.size === 0) return result;

  const grantingRolesByWs = await getWorkspaceGrantingRolesCached();

  for (const ws of WORKSPACES) {
    const wsLocks = locks.get(ws.key);
    if (!wsLocks || wsLocks.size === 0) continue;
    const wsGranting = grantingRolesByWs.get(ws.key) ?? new Set<string>();
    const userGrantingRoles = session.roles
      .map((r) => r.name.toLowerCase())
      .filter((name) => wsGranting.has(name));
    if (userGrantingRoles.length === 0) continue;
    if (userGrantingRoles.every((name) => wsLocks.get(name)?.locked === true)) {
      result.add(ws.key);
    }
  }
  return result;
}
