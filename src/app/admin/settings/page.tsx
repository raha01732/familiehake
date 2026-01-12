// src/app/admin/settings/page.tsx
import RoleGate from "@/components/RoleGate";
import { ROUTE_DESCRIPTORS } from "@/lib/access-map";
import { discoverAppRoutes } from "@/lib/route-discovery";
import { normalizeRouteKey } from "@/lib/route-access";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentUser } from "@clerk/nextjs/server";
import { isRedirectError } from "next/dist/client/components/redirect";
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

/* ===================== Data ===================== */

async function getAdminStatus() {
  const user = await currentUser();
  const role = (user?.publicMetadata?.role as string | undefined)?.toLowerCase() ?? "user";
  const isAdmin =
    !!user && (role === "admin" || role === "superadmin" || user.id === env().PRIMARY_SUPERADMIN_ID);
  return { isAdmin, role, user };
}

function formatErrorDetail(error: unknown) {
  if (error instanceof Error) {
    const detailParts = [error.name, error.message, error.stack].filter(Boolean);
    return detailParts.join("\n");
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function getData() {
  const sb = createAdminClient();

  const [{ data: roles }, { data: rules }] = await Promise.all([
    sb.from("roles").select("name,label,rank").order("rank", { ascending: false }),
    sb.from("access_rules").select("route,role,allowed").order("route", { ascending: true }),
  ]);

  const roleList: DbRole[] = (roles ?? []) as DbRole[];
  const ruleList: DbRule[] = (rules ?? []) as DbRule[];
  const discoveredRoutes = await discoverAppRoutes();

  // Matrix: route -> role -> allowed
  const matrix = new Map<string, Map<string, boolean>>();
  for (const r of ruleList) {
    const normalizedRoute = normalizeRouteKey(String(r.route ?? ""));
    if (!normalizedRoute) continue;
    if (!matrix.has(normalizedRoute)) matrix.set(normalizedRoute, new Map());
    matrix.get(normalizedRoute)!.set(r.role, !!r.allowed);
  }

  for (const descriptor of ROUTE_DESCRIPTORS) {
    const normalizedRoute = normalizeRouteKey(descriptor.route);
    if (!normalizedRoute) continue;
    if (!matrix.has(normalizedRoute)) {
      matrix.set(normalizedRoute, new Map());
    }
  }

  for (const route of discoveredRoutes) {
    const normalizedRoute = normalizeRouteKey(route);
    if (!normalizedRoute) continue;
    if (!matrix.has(normalizedRoute)) {
      matrix.set(normalizedRoute, new Map());
    }
  }

  const routes = Array.from(matrix.keys()).sort((a, b) => a.localeCompare(b));
  return { roles: roleList, routes, matrix };
}

/* ===================== Actions ===================== */

function buildFieldName(route: string, role: string) {
  return `access:${encodeURIComponent(route)}:${encodeURIComponent(role)}`;
}

async function upsertAccessAction(formData: FormData): Promise<void> {
  "use server";
  try {
    const sb = createAdminClient();
    const [{ data: roles }, { data: routes }] = await Promise.all([
      sb.from("roles").select("name"),
      sb.from("access_rules").select("route"),
    ]);

    const roleNames = (roles ?? []).map((r: any) => String(r.name));
    const routeSet = new Set<string>();
    for (const row of routes ?? []) {
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
        role,
        allowed: formData.has(buildFieldName(route, role)),
      }))
    );

    if (payload.length > 0) {
      await sb.from("access_rules").upsert(payload, { onConflict: "route,role" });
    }

    revalidatePath("/admin/settings");
    redirect("/admin/settings?saved=1");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    console.error("access_rules_save_failed", error);
    const { isAdmin } = await getAdminStatus();
    if (isAdmin) {
      const detail = encodeURIComponent(formatErrorDetail(error));
      redirect(`/admin/settings?error=1&errorDetail=${detail}`);
    }
    redirect("/admin/settings?error=1");
  }
}

async function addRouteAction(formData: FormData): Promise<void> {
  "use server";
  const routeRaw = String(formData.get("route") ?? "").trim();
  if (!routeRaw) return;
  const route = normalizeRouteKey(routeRaw);
  if (!route) return;

  const sb = createAdminClient();

  // Für alle bekannten Rollen einen Default-Eintrag (NONE)
  const { data: roles } = await sb.from("roles").select("name");
  const roleNames = (roles ?? []).map((r: any) => r.name as string);
  if (roleNames.length === 0) return;

  const payload = roleNames.map((name) => ({
    route,
    role: name,
    allowed: false,
  }));

  try {
    await sb.from("access_rules").upsert(payload, { onConflict: "route,role" });
    revalidatePath("/admin/settings");
    redirect("/admin/settings?route-added=1");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    console.error("access_rules_add_route_failed", error);
    const { isAdmin } = await getAdminStatus();
    if (isAdmin) {
      const detail = encodeURIComponent(formatErrorDetail(error));
      redirect(`/admin/settings?error=1&errorDetail=${detail}`);
    }
    redirect("/admin/settings?error=1");
  }
}

/* ===================== Page ===================== */

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { roles, routes, matrix } = await getData();
  const { isAdmin } = await getAdminStatus();
  const hasFlag = (value: string | string[] | undefined) =>
    value === "1" || (Array.isArray(value) && value.includes("1"));
  const saved = hasFlag(searchParams?.saved);
  const error = hasFlag(searchParams?.error);
  const routeAdded = hasFlag(searchParams?.["route-added"]);
  const errorDetailParam = getFirstParam(searchParams?.errorDetail);
  const errorDetail = isAdmin && errorDetailParam ? decodeURIComponent(errorDetailParam) : null;

  return (
    <RoleGate routeKey="admin/settings">
      <section className="flex flex-col gap-8">
        <header className="card p-6 flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Rollen &amp; Berechtigungen</h1>
          <p className="text-sm text-zinc-400">
            Definiere per Checkbox, welche Rolle eine Route aufrufen darf.
          </p>
        </header>

        {(saved || error || routeAdded) && (
          <div
            className={`rounded-xl border p-4 text-sm ${
              error
                ? "border-amber-700 bg-amber-900/10 text-amber-200"
                : "border-emerald-700 bg-emerald-900/10 text-emerald-200"
            }`}
          >
            {error && "Es ist ein Fehler aufgetreten."}
            {saved && "Berechtigungen wurden gespeichert."}
            {routeAdded && "Neue Route wurde angelegt."}
            {error && errorDetail && (
              <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-amber-800 bg-amber-900/20 p-3 text-[11px] leading-5 text-amber-100/80">
                {errorDetail}
              </pre>
            )}
          </div>
        )}

        {/* Neue Route hinzufügen */}
        <div className="card p-6">
          <div className="text-sm font-medium text-zinc-100 mb-3">Neue Route anlegen</div>
          <form action={addRouteAction} className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <input
              name="route"
              placeholder="z. B. admin/reports"
              className="flex-1 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
            />
            <button className="rounded-lg border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-2 hover:bg-zinc-800/60">
              Route hinzufügen
            </button>
          </form>
          <div className="text-[11px] text-zinc-500 mt-2">
            Hinweis: führende „/“ werden automatisch entfernt. Verwende konsistente Keys wie{" "}
            <span className="font-mono text-zinc-400">admin/settings</span>,{" "}
            <span className="font-mono text-zinc-400">monitoring</span>,{" "}
            <span className="font-mono text-zinc-400">tools/files</span>.
          </div>
        </div>

        {/* Matrix */}
        <div className="card p-6">
          <div className="text-sm font-medium text-zinc-100 mb-4">Zugriffs-Matrix</div>

          {routes.length === 0 ? (
            <div className="text-sm text-zinc-500">Noch keine Routen vorhanden.</div>
          ) : (
            <form action={upsertAccessAction} className="flex flex-col gap-4">
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-900/60 text-zinc-400">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Route</th>
                      {roles.map((role) => (
                        <th key={role.name} className="px-4 py-2 text-left font-medium">
                          {role.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {routes.map((route) => {
                      const row = matrix.get(route) ?? new Map<string, boolean>();
                      return (
                        <tr key={route} className="hover:bg-zinc-900/40">
                          <td className="px-4 py-2 text-zinc-200 font-medium">/{route}</td>
                          {roles.map((role) => {
                            const isAllowed = row.get(role.name) ?? false;
                            const fieldName = buildFieldName(route, role.name);
                            return (
                              <td key={role.name} className="px-4 py-2">
                                <label className="inline-flex items-center gap-2 text-zinc-200">
                                  <input
                                    type="checkbox"
                                    name={fieldName}
                                    defaultChecked={isAllowed}
                                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-emerald-400"
                                    aria-label={`Zugriff für ${role.name} auf ${route}`}
                                  />
                                  <span className="text-xs text-zinc-500">{role.name}</span>
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
                <button className="rounded-lg border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-2 hover:bg-zinc-800/60">
                  Speichern
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </RoleGate>
  );
}
