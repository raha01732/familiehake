// /workspace/familiehake/src/app/admin/settings/page.tsx
import RoleGate from "@/components/RoleGate";
import { Settings2, Plus, Save, ShieldCheck, Wrench, Lock } from "lucide-react";
import { ROUTE_DESCRIPTORS } from "@/lib/access-map";
import { checkDatabaseLive } from "@/lib/access-db";
import { TOOL_LINKS } from "@/lib/navigation";
import { WORKSPACES } from "@/lib/workspaces";
import { discoverAppRoutes } from "@/lib/route-discovery";
import { normalizeRouteKey } from "@/lib/route-access";
import { env } from "@/lib/env";
import { getRoleFromPublicMetadata } from "@/lib/clerk-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const metadata = { title: "Rollen & Berechtigungen" };

type DbRole = {
  name: string;
  label: string;
  rank: number;
};

type DbRule = {
  route: string;
  role: string;
  allowed: boolean;
};

type DbToolStatus = {
  route_key: string;
  enabled: boolean | null;
  maintenance_message: string | null;
};

/* ===================== Data ===================== */

async function getAdminStatus() {
  const user = await currentUser();
  const role = getRoleFromPublicMetadata(user?.publicMetadata);
  const isAdmin =
    !!user && (role === "admin" || role === "superadmin" || user.id === env().PRIMARY_SUPERADMIN_ID);
  return { isAdmin, role, user };
}

function normalizeRoleKey(role: string) {
  return role.trim().toLowerCase();
}

async function getData() {
  const sb = createAdminClient();

  // IMPORTANT: throwOnError() sorgt dafür, dass Supabase Fehler nicht "verschluckt" werden.
  const [rolesRes, rulesRes, toolStatusRes, workspaceLocksRes] = await Promise.all([
    sb.from("roles").select("name,label,rank").order("rank", { ascending: false }).throwOnError(),
    sb.from("access_rules").select("route,role,allowed").order("route", { ascending: true }).throwOnError(),
    sb
      .from("tool_status")
      .select("route_key,enabled,maintenance_message")
      .in(
        "route_key",
        TOOL_LINKS.map((link) => link.routeKey)
      )
      .throwOnError(),
    sb.from("workspace_locks").select("workspace_key,role,locked,message").throwOnError(),
  ]);

  const roleList: DbRole[] = (rolesRes.data ?? []) as unknown as DbRole[];
  const ruleList: DbRule[] = (rulesRes.data ?? []) as unknown as DbRule[];
  const toolStatusRows: DbToolStatus[] = (toolStatusRes.data ?? []) as unknown as DbToolStatus[];
  const workspaceLockRows = (workspaceLocksRes.data ?? []) as unknown as {
    workspace_key: string;
    role: string;
    locked: boolean | null;
    message: string | null;
  }[];
  const discoveredRoutes = await discoverAppRoutes();

  // Matrix: route -> role -> allowed
  const matrix = new Map<string, Map<string, boolean>>();
  for (const r of ruleList) {
    const normalizedRoute = normalizeRouteKey(String(r.route ?? ""));
    const normalizedRole = normalizeRoleKey(String(r.role ?? ""));
    if (!normalizedRoute) continue;
    if (!normalizedRole) continue;
    if (!matrix.has(normalizedRoute)) matrix.set(normalizedRoute, new Map());
    matrix.get(normalizedRoute)!.set(normalizedRole, !!r.allowed);
  }

  // Statische Routen-Descriptors sicherstellen
  for (const descriptor of ROUTE_DESCRIPTORS) {
    const normalizedRoute = normalizeRouteKey(descriptor.route);
    if (!normalizedRoute) continue;
    if (!matrix.has(normalizedRoute)) matrix.set(normalizedRoute, new Map());
  }

  // Discovered Routes sicherstellen
  for (const route of discoveredRoutes) {
    const normalizedRoute = normalizeRouteKey(route);
    if (!normalizedRoute) continue;
    if (!matrix.has(normalizedRoute)) matrix.set(normalizedRoute, new Map());
  }

  const routes = Array.from(matrix.keys()).sort((a, b) => a.localeCompare(b));
  const toolStatusByRoute = new Map(
    toolStatusRows.map((row) => [
      row.route_key,
      {
        enabled: typeof row.enabled === "boolean" ? row.enabled : true,
        maintenanceMessage:
          typeof row.maintenance_message === "string" ? row.maintenance_message : "",
      },
    ])
  );

  const toolStatusList = TOOL_LINKS.map((tool) => {
    const status = toolStatusByRoute.get(tool.routeKey);
    return {
      routeKey: tool.routeKey,
      label: tool.label,
      enabled: status?.enabled ?? true,
      maintenanceMessage: status?.maintenanceMessage ?? "",
    };
  });

  // Workspace-Sperren: pro Workspace gesperrte Rollen + Hinweistext
  const lockedRolesByWs = new Map<string, Set<string>>();
  const messageByWs = new Map<string, string>();
  for (const row of workspaceLockRows) {
    const wsKey = String(row.workspace_key ?? "");
    const role = normalizeRoleKey(String(row.role ?? ""));
    if (!wsKey || !role) continue;
    if (row.locked === true) {
      if (!lockedRolesByWs.has(wsKey)) lockedRolesByWs.set(wsKey, new Set());
      lockedRolesByWs.get(wsKey)!.add(role);
    }
    if (typeof row.message === "string" && row.message.trim() && !messageByWs.has(wsKey)) {
      messageByWs.set(wsKey, row.message);
    }
  }
  const workspaceLockList = WORKSPACES.map((ws) => ({
    key: ws.key,
    label: ws.label,
    lockedRoles: lockedRolesByWs.get(ws.key) ?? new Set<string>(),
    message: messageByWs.get(ws.key) ?? "",
  }));

  return { roles: roleList, routes, matrix, toolStatusList, workspaceLockList };
}

/* ===================== Actions ===================== */

function buildFieldName(route: string, role: string) {
  return `access:${route}:${role}`;
}

function buildToolEnabledFieldName(routeKey: string) {
  return `toolStatusEnabled:${routeKey}`;
}

function buildToolMessageFieldName(routeKey: string) {
  return `toolStatusMessage:${routeKey}`;
}

function buildWorkspaceLockFieldName(workspaceKey: string, role: string) {
  return `wsLock:${workspaceKey}:${role}`;
}

function buildWorkspaceMessageFieldName(workspaceKey: string) {
  return `wsLockMsg:${workspaceKey}`;
}

async function upsertAccessAction(formData: FormData): Promise<void> {
  "use server";
  const sb = createAdminClient();

  try {
    const [rolesRes, routesRes] = await Promise.all([
      sb.from("roles").select("name").throwOnError(),
      sb.from("access_rules").select("route").throwOnError(),
    ]);

    const roleNames = (rolesRes.data ?? []).map((r: any) => normalizeRoleKey(String(r.name)));

    const routeSet = new Set<string>();
    for (const row of routesRes.data ?? []) {
      if (row?.route) {
        const normalizedRoute = normalizeRouteKey(String(row.route));
        if (normalizedRoute) routeSet.add(normalizedRoute);
      }
    }

    for (const descriptor of ROUTE_DESCRIPTORS) {
      const normalizedRoute = normalizeRouteKey(descriptor.route);
      if (normalizedRoute) routeSet.add(normalizedRoute);
    }

    const discoveredRoutes = await discoverAppRoutes();
    for (const route of discoveredRoutes) {
      const normalizedRoute = normalizeRouteKey(route);
      if (normalizedRoute) routeSet.add(normalizedRoute);
    }

    const routeList = Array.from(routeSet).sort((a, b) => a.localeCompare(b));

    const payload = routeList.flatMap((route) =>
      roleNames.map((role) => ({
        route,
        role: normalizeRoleKey(role),
        allowed: formData.has(buildFieldName(route, role)),
      }))
    );

    if (payload.length > 0) {
      const upsertRes = await sb.from("access_rules").upsert(payload, { onConflict: "route,role" });
      if (upsertRes.error) throw upsertRes.error;
    }
  } catch (error) {
    console.error("access_rules_save_failed", error);
    revalidatePath("/admin/settings");
    const errorDetail = error instanceof Error ? error.message : "unknown_error";
    redirect(`/admin/settings?error=1&errorDetail=${encodeURIComponent(errorDetail)}`);
  }

  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}

async function addRouteAction(formData: FormData): Promise<void> {
  "use server";
  const routeRaw = String(formData.get("route") ?? "").trim();
  if (!routeRaw) {
    redirect("/admin/settings?error=1&errorDetail=route_missing");
  }
  const route = normalizeRouteKey(routeRaw);
  if (!route) {
    redirect("/admin/settings?error=1&errorDetail=route_invalid");
  }

  const sb = createAdminClient();

  // Für alle bekannten Rollen einen Default-Eintrag (NONE)
  try {
    const rolesRes = await sb.from("roles").select("name").throwOnError();
    const roleNames = (rolesRes.data ?? []).map((r: any) => normalizeRoleKey(String(r.name)));

    if (roleNames.length === 0) {
      redirect("/admin/settings?error=1&errorDetail=no_roles_found");
    }

    const payload = roleNames.map((name) => ({
      route,
      role: name,
      allowed: false,
    }));

    const upsertRes = await sb.from("access_rules").upsert(payload, { onConflict: "route,role" });
    if (upsertRes.error) throw upsertRes.error;
  } catch (error) {
    console.error("access_rules_add_route_failed", error);
    revalidatePath("/admin/settings");
    const errorDetail = error instanceof Error ? error.message : "unknown_error";
    redirect(`/admin/settings?error=1&errorDetail=${encodeURIComponent(errorDetail)}`);
  }

  revalidatePath("/admin/settings");
  redirect("/admin/settings?added=1");
}

async function upsertToolStatusAction(formData: FormData): Promise<void> {
  "use server";
  const sb = createAdminClient();

  try {
    const existingRes = await sb
      .from("tool_status")
      .select("route_key,enabled,maintenance_message")
      .in(
        "route_key",
        TOOL_LINKS.map((tool) => tool.routeKey)
      )
      .throwOnError();

    const existingByRoute = new Map(
      (existingRes.data ?? []).map((row: { route_key: string; enabled: boolean | null; maintenance_message: string | null }) => [
        row.route_key,
        {
          enabled: typeof row.enabled === "boolean" ? row.enabled : true,
          maintenanceMessage: typeof row.maintenance_message === "string" ? row.maintenance_message : "",
        },
      ])
    );

    const payload = TOOL_LINKS.map((tool) => {
      const messageRaw = String(formData.get(buildToolMessageFieldName(tool.routeKey)) ?? "").trim();
      return {
        route_key: tool.routeKey,
        enabled: formData.has(buildToolEnabledFieldName(tool.routeKey)),
        maintenance_message: messageRaw || null,
      };
    });

    if (payload.length > 0) {
      const upsertRes = await sb.from("tool_status").upsert(payload, { onConflict: "route_key" });
      if (upsertRes.error) throw upsertRes.error;

      const actor = await currentUser();
      for (const item of payload) {
        const previous = existingByRoute.get(item.route_key);
        const wasEnabled = previous?.enabled ?? true;
        const isEnabled = typeof item.enabled === "boolean" ? item.enabled : true;
        const maintenanceReason = item.maintenance_message ?? "";
        const reasonChanged =
          maintenanceReason.trim() !== (previous?.maintenanceMessage ?? "").trim();
        const maintenanceModeWasEnabled = !wasEnabled;
        const maintenanceModeIsEnabled = !isEnabled;
        if (!maintenanceModeIsEnabled) continue;
        if (maintenanceModeWasEnabled && !reasonChanged) continue;

        await logAudit({
          action: "tool_maintenance_enabled",
          actorUserId: actor?.id ?? null,
          actorEmail: actor?.emailAddresses?.[0]?.emailAddress ?? null,
          target: item.route_key,
          detail: {
            tool: item.route_key,
            reason: maintenanceReason || "kein_grund_angegeben",
            previousReason: previous?.maintenanceMessage ?? "",
          },
        });
      }
    }
  } catch (error) {
    console.error("tool_status_save_failed", error);
    revalidatePath("/admin/settings");
    const errorDetail = error instanceof Error ? error.message : "unknown_error";
    redirect(`/admin/settings?error=1&errorDetail=${encodeURIComponent(errorDetail)}`);
  }

  revalidatePath("/admin/settings");
  redirect("/admin/settings?toolStatusSaved=1");
}

async function upsertWorkspaceLocksAction(formData: FormData): Promise<void> {
  "use server";
  const sb = createAdminClient();

  try {
    const rolesRes = await sb.from("roles").select("name,is_superadmin").throwOnError();
    const roleNames = (rolesRes.data ?? [])
      .filter((r: { is_superadmin?: boolean | null }) => !r.is_superadmin)
      .map((r: { name: string }) => normalizeRoleKey(String(r.name)));

    const existingRes = await sb
      .from("workspace_locks")
      .select("workspace_key,role,locked,message")
      .throwOnError();
    const existingByKey = new Map<string, { locked: boolean; message: string }>();
    for (const row of existingRes.data ?? []) {
      existingByKey.set(`${row.workspace_key}:${normalizeRoleKey(String(row.role))}`, {
        locked: row.locked === true,
        message: typeof row.message === "string" ? row.message : "",
      });
    }

    const payload: { workspace_key: string; role: string; locked: boolean; message: string | null }[] = [];
    for (const ws of WORKSPACES) {
      const message = String(formData.get(buildWorkspaceMessageFieldName(ws.key)) ?? "").trim() || null;
      for (const role of roleNames) {
        payload.push({
          workspace_key: ws.key,
          role,
          locked: formData.has(buildWorkspaceLockFieldName(ws.key, role)),
          message,
        });
      }
    }

    if (payload.length > 0) {
      const upsertRes = await sb
        .from("workspace_locks")
        .upsert(payload, { onConflict: "workspace_key,role" });
      if (upsertRes.error) throw upsertRes.error;

      const actor = await currentUser();
      for (const item of payload) {
        const prev = existingByKey.get(`${item.workspace_key}:${item.role}`);
        const wasLocked = prev?.locked ?? false;
        const reasonChanged = (item.message ?? "").trim() !== (prev?.message ?? "").trim();
        if (!item.locked) continue;
        if (wasLocked && !reasonChanged) continue;

        await logAudit({
          action: "workspace_locked",
          actorUserId: actor?.id ?? null,
          actorEmail: actor?.emailAddresses?.[0]?.emailAddress ?? null,
          target: `${item.workspace_key}:${item.role}`,
          detail: {
            workspace: item.workspace_key,
            role: item.role,
            reason: item.message || "kein_grund_angegeben",
          },
        });
      }
    }
  } catch (error) {
    console.error("workspace_locks_save_failed", error);
    revalidatePath("/admin/settings");
    const errorDetail = error instanceof Error ? error.message : "unknown_error";
    redirect(`/admin/settings?error=1&errorDetail=${encodeURIComponent(errorDetail)}`);
  }

  revalidatePath("/admin/settings");
  redirect("/admin/settings?workspaceLockSaved=1");
}

/* ===================== Page ===================== */

type SettingsSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: SettingsSearchParams;
}) {
  const [{ roles, routes, matrix, toolStatusList, workspaceLockList }, { isAdmin }, liveStatus, sp] =
    await Promise.all([getData(), getAdminStatus(), checkDatabaseLive(), searchParams]);

  // Superadmin wird ohnehin durchgelassen → in der Sperr-Matrix nicht anbieten.
  const lockableRoles = roles.filter((role) => normalizeRoleKey(role.name) !== "superadmin");

  const saved =
    sp?.saved === "1" ||
    (Array.isArray(sp?.saved) && sp?.saved.includes("1"));

  const added =
    sp?.added === "1" ||
    (Array.isArray(sp?.added) && sp?.added.includes("1"));

  const toolStatusSaved =
    sp?.toolStatusSaved === "1" ||
    (Array.isArray(sp?.toolStatusSaved) && sp?.toolStatusSaved.includes("1"));

  const workspaceLockSaved =
    sp?.workspaceLockSaved === "1" ||
    (Array.isArray(sp?.workspaceLockSaved) && sp?.workspaceLockSaved.includes("1"));

  const error =
    sp?.error === "1" ||
    (Array.isArray(sp?.error) && sp?.error.includes("1"));

  const errorDetail =
    isAdmin && typeof sp?.errorDetail === "string"
      ? decodeURIComponent(sp?.errorDetail)
      : null;

  return (
    <RoleGate routeKey="admin/settings">
      <section className="flex flex-col gap-8 animate-fade-up">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div
              className="shimmer-badge inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
              style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
            >
              <Settings2 size={11} style={{ color: "hsl(var(--primary))" }} aria-hidden />
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{ color: "hsl(var(--primary))" }}
              >
                Admin
              </span>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                <span className="gradient-text">Berechtigungen</span>
              </h1>
              <p className="mt-1.5 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                Definiere per Checkbox, welche Rolle eine Route aufrufen darf.
              </p>
            </div>
          </div>
          <div
            className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground"
          >
            <span
              className={`status-dot ${liveStatus.live ? "status-dot-ok" : "status-dot-warn"}`}
              aria-hidden="true"
            />
            {liveStatus.live ? "Live" : "Nicht-Live"}
          </div>
        </div>

        {(saved || added || toolStatusSaved || workspaceLockSaved || error) && (
          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={
              error
                ? { borderColor: "hsl(0 84% 57% / 0.4)", background: "hsl(0 84% 57% / 0.06)", color: "hsl(0 84% 60%)" }
                : { borderColor: "hsl(142 71% 45% / 0.4)", background: "hsl(142 71% 45% / 0.06)", color: "hsl(142 71% 40%)" }
            }
          >
            {!error && saved && "Die Zugriffs-Matrix wurde gespeichert."}
            {!error && added && "Die Route wurde hinzugefügt."}
            {!error && toolStatusSaved && "Der Tool-Status wurde gespeichert."}
            {!error && workspaceLockSaved && "Die Workspace-Sperren wurden gespeichert."}
            {error && "Es ist ein Fehler aufgetreten."}
            {error && errorDetail && (
              <pre
                className="mt-3 whitespace-pre-wrap rounded-lg border p-3 text-[11px] leading-5"
                style={{ borderColor: "hsl(0 84% 57% / 0.3)", background: "hsl(0 84% 57% / 0.08)", color: "hsl(0 84% 60% / 0.9)" }}
              >
                {errorDetail}
              </pre>
            )}
          </div>
        )}

        {/* Neue Route hinzufügen */}
        <div className="card p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Plus size={15} className="text-primary" aria-hidden />
            Neue Route anlegen
          </div>
          <form action={addRouteAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              name="route"
              placeholder="z. B. admin/reports"
              className="flex-1 input-field"
            />
            <button className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary">
              <Plus size={13} aria-hidden />
              Route hinzufügen
            </button>
          </form>
          <div className="text-[11px] mt-2" style={{ color: "hsl(var(--muted-foreground))" }}>
            Hinweis: führende „/" werden automatisch entfernt. Verwende konsistente Keys wie{" "}
            <span className="font-mono" style={{ color: "hsl(var(--foreground))" }}>admin/settings</span>,{" "}
            <span className="font-mono" style={{ color: "hsl(var(--foreground))" }}>monitoring</span>,{" "}
            <span className="font-mono" style={{ color: "hsl(var(--foreground))" }}>tools/files</span>.
          </div>
        </div>

        {/* Matrix */}
        <div className="card p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck size={15} className="text-primary" aria-hidden />
            Zugriffs-Matrix
          </div>

          {routes.length === 0 ? (
            <div className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Noch keine Routen vorhanden.</div>
          ) : (
            <form action={upsertAccessAction} className="flex flex-col gap-4">
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-border bg-secondary/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Route</th>
                      {roles.map((role) => (
                        <th key={role.name} className="px-4 py-3 text-left font-semibold">
                          {role.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {routes.map((route) => {
                      const row = matrix.get(route) ?? new Map<string, boolean>();
                      return (
                        <tr key={route} className="transition-colors hover:bg-secondary/40">
                          <td className="px-4 py-2.5 font-mono text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>/{route}</td>
                          {roles.map((role) => {
                            const roleKey = normalizeRoleKey(role.name);
                            const isAllowed = row.get(roleKey) ?? false;
                            const fieldName = buildFieldName(route, roleKey);

                            return (
                              <td key={role.name} className="px-4 py-2">
                                <label className="inline-flex items-center gap-2" style={{ color: "hsl(var(--foreground))" }}>
                                  <input
                                    type="checkbox"
                                    name={fieldName}
                                    defaultChecked={isAllowed}
                                    className="h-4 w-4 rounded"
                                    style={{ accentColor: "hsl(var(--primary))" }}
                                    aria-label={`Zugriff für ${role.name} auf ${route}`}
                                  />
                                  <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{role.name}</span>
                                </label>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <button className="brand-button inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold">
                  <Save size={13} aria-hidden />
                  Speichern
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Tool-Status */}
        <div className="card p-6">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Wrench size={15} className="text-primary" aria-hidden />
            Tool-Wartungsmodus
          </div>
          <p className="mb-4 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Hier steuerst du pro Tool den globalen Status (aktiv/deaktiviert) und optional eine
            Wartungsmeldung.
          </p>

          <form action={upsertToolStatusAction} className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border bg-secondary/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Route</th>
                    <th className="px-4 py-3 text-left font-semibold">Aktiv</th>
                    <th className="px-4 py-3 text-left font-semibold">Wartungsmeldung</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {toolStatusList.map((tool) => (
                    <tr key={tool.routeKey} className="transition-colors hover:bg-secondary/40">
                      <td className="px-4 py-2.5 font-mono text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>/{tool.routeKey}</td>
                      <td className="px-4 py-2">
                        <label className="inline-flex items-center gap-2" style={{ color: "hsl(var(--foreground))" }}>
                          <input
                            type="checkbox"
                            name={buildToolEnabledFieldName(tool.routeKey)}
                            defaultChecked={tool.enabled}
                            className="h-4 w-4 rounded"
                            style={{ accentColor: "hsl(var(--primary))" }}
                            aria-label={`Tool ${tool.routeKey} aktiv`}
                          />
                          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>enabled</span>
                        </label>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          name={buildToolMessageFieldName(tool.routeKey)}
                          defaultValue={tool.maintenanceMessage}
                          placeholder="Optional: Hinweistext bei Deaktivierung"
                          className="w-full input-field text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <button className="brand-button inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold">
                <Save size={13} aria-hidden />
                Tool-Status speichern
              </button>
            </div>
          </form>
        </div>

        {/* Workspace-Sperren */}
        <div className="card p-6">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Lock size={15} className="text-primary" aria-hidden />
            Workspace-Sperren
          </div>
          <p className="mb-4 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Sperre einen ganzen Workspace für einzelne Rollen. Die Tools bleiben sichtbar, beim
            Aufruf erscheint nur der Hinweistext. Superadmins werden nie gesperrt.
          </p>

          <form action={upsertWorkspaceLocksAction} className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border bg-secondary/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Workspace</th>
                    {lockableRoles.map((role) => (
                      <th key={role.name} className="px-4 py-3 text-left font-semibold">
                        {role.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left font-semibold">Hinweistext</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {workspaceLockList.map((ws) => (
                    <tr key={ws.key} className="transition-colors hover:bg-secondary/40">
                      <td className="px-4 py-2.5 text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>
                        {ws.label}
                      </td>
                      {lockableRoles.map((role) => {
                        const roleKey = normalizeRoleKey(role.name);
                        return (
                          <td key={role.name} className="px-4 py-2">
                            <label className="inline-flex items-center gap-2" style={{ color: "hsl(var(--foreground))" }}>
                              <input
                                type="checkbox"
                                name={buildWorkspaceLockFieldName(ws.key, roleKey)}
                                defaultChecked={ws.lockedRoles.has(roleKey)}
                                className="h-4 w-4 rounded"
                                style={{ accentColor: "hsl(var(--primary))" }}
                                aria-label={`Workspace ${ws.label} für ${role.name} sperren`}
                              />
                              <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                                {role.name}
                              </span>
                            </label>
                          </td>
                        );
                      })}
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          name={buildWorkspaceMessageFieldName(ws.key)}
                          defaultValue={ws.message}
                          placeholder="Optional: Hinweistext bei Sperre"
                          className="w-full input-field text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <button className="brand-button inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold">
                <Save size={13} aria-hidden />
                Workspace-Sperren speichern
              </button>
            </div>
          </form>
        </div>
      </section>
    </RoleGate>
  );
}
