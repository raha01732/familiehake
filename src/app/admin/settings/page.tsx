// src/app/admin/settings/page.tsx
import RoleGate from "@/components/RoleGate";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { PERMISSION_LEVELS, PERMISSION_LABELS } from "@/lib/rbac";
import { ROUTE_DESCRIPTORS } from "@/lib/access-map";

export const metadata = { title: "Rollen & Berechtigungen" };

type DbRole = {
  name: string;
  label: string;
  rank: number;
};

type DbRule = {
  route: string;
  role: string;
  level: number;
};

/* ===================== Data ===================== */

async function getData() {
  const sb = createAdminClient();

  const [{ data: roles }, { data: rules }] = await Promise.all([
    sb.from("roles").select("name,label,rank").order("rank", { ascending: false }),
    sb.from("access_rules").select("route,role,level").order("route", { ascending: true }),
  ]);

  const roleList: DbRole[] = (roles ?? []) as DbRole[];
  const ruleList: DbRule[] = (rules ?? []) as DbRule[];

  // Matrix: route -> role -> level
  const matrix = new Map<string, Map<string, number>>();
  for (const r of ruleList) {
    if (!matrix.has(r.route)) matrix.set(r.route, new Map());
    matrix.get(r.route)!.set(r.role, r.level ?? 0);
  }

  for (const descriptor of ROUTE_DESCRIPTORS) {
    if (!matrix.has(descriptor.route)) {
      matrix.set(descriptor.route, new Map());
    }
  }

  const routes = Array.from(matrix.keys()).sort((a, b) => a.localeCompare(b));
  return { roles: roleList, routes, matrix };
}

/* ===================== Actions ===================== */

async function upsertAccessAction(formData: FormData): Promise<void> {
  "use server";
  const route = String(formData.get("route") ?? "").trim().replace(/^\/+/, "");
  const role = String(formData.get("role") ?? "").trim().toLowerCase();
  const level = Number(formData.get("level") ?? 0);

  if (!route || !role || !Number.isFinite(level)) return;

  const sb = createAdminClient();

  // Rolle sicherstellen (per UPSERT, da .insert().onConflict() nicht verfügbar ist)
  await sb
    .from("roles")
    .upsert({ name: role, label: role, rank: 0 }, { onConflict: "name" });

  // Upsert access rule
  await sb
    .from("access_rules")
    .upsert({ route, role, level }, { onConflict: "route,role" });

  revalidatePath("/admin/settings");
}

async function addRouteAction(formData: FormData): Promise<void> {
  "use server";
  const routeRaw = String(formData.get("route") ?? "").trim();
  if (!routeRaw) return;
  const route = routeRaw.replace(/^\/+/, ""); // ohne führenden Slash

  const sb = createAdminClient();

  // Für alle bekannten Rollen einen Default-Eintrag (NONE)
  const { data: roles } = await sb.from("roles").select("name");
  const roleNames = (roles ?? []).map((r: any) => r.name as string);
  if (roleNames.length === 0) return;

  const payload = roleNames.map((name) => ({
    route,
    role: name,
    level: PERMISSION_LEVELS.NONE,
  }));

  await sb.from("access_rules").upsert(payload, { onConflict: "route,role" });

  revalidatePath("/admin/settings");
}

/* ===================== Page ===================== */

export default async function AdminSettingsPage() {
  const { roles, routes, matrix } = await getData();

  // Für die Darstellung: Levels als <option>
  const options = [
    { v: PERMISSION_LEVELS.NONE, label: PERMISSION_LABELS[PERMISSION_LEVELS.NONE] },
    { v: PERMISSION_LEVELS.READ, label: PERMISSION_LABELS[PERMISSION_LEVELS.READ] },
    { v: PERMISSION_LEVELS.WRITE, label: PERMISSION_LABELS[PERMISSION_LEVELS.WRITE] },
    { v: PERMISSION_LEVELS.ADMIN, label: PERMISSION_LABELS[PERMISSION_LEVELS.ADMIN] },
  ];

  return (
    <RoleGate routeKey="admin/settings" minLevel={PERMISSION_LEVELS.ADMIN}>
      <section className="flex flex-col gap-8">
        <header className="card p-6 flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Rollen &amp; Berechtigungen</h1>
          <p className="text-sm text-zinc-400">
            Definiere, welche Rolle auf welche Route mit welchem Level zugreifen darf.
          </p>
        </header>

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

          <div className="grid gap-4">
            {routes.length === 0 && (
              <div className="text-sm text-zinc-500">Noch keine Routen vorhanden.</div>
            )}

            {routes.map((route) => {
              const row = matrix.get(route) ?? new Map<string, number>();
              const descriptor = ROUTE_DESCRIPTORS.find((d) => d.route === route);
              const fallbackLevel = descriptor?.defaultLevel ?? PERMISSION_LEVELS.NONE;
              return (
                <div
                  key={route}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
                >
                  <div className="mb-3 text-zinc-200 font-medium text-sm">/{route}</div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {roles.map((r) => {
                      const current = row.get(r.name) ?? fallbackLevel;
                      return (
                        <form
                          key={r.name}
                          action={upsertAccessAction}
                          className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2"
                        >
                          <div className="text-sm text-zinc-200">
                            {r.label}{" "}
                            <span className="text-zinc-500 text-xs">({r.name})</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <input type="hidden" name="route" value={route} />
                            <input type="hidden" name="role" value={r.name} />
                            <select
                              name="level"
                              defaultValue={String(current)}
                              className="rounded bg-zinc-950 border border-zinc-700 text-[12px] px-2 py-1 text-zinc-100"
                              aria-label={`Level für ${r.name} auf ${route}`}
                            >
                              {options.map((o) => (
                                <option key={o.v} value={o.v}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            <button className="rounded border border-zinc-700 text-zinc-200 text-[11px] px-2 py-1 hover:bg-zinc-800/60">
                              Speichern
                            </button>
                          </div>
                        </form>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </RoleGate>
  );
}
