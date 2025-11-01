import { RoleGate } from "@/components/RoleGate";
import { ROUTE_DESCRIPTORS, getRouteDescriptor } from "@/lib/access-map";
import { getPermissionOverview, type DbRole, type RoutePermissionMatrix } from "@/lib/access-db";
import { PERMISSION_LEVELS, type PermissionLevel, PERMISSION_LABELS } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const RESERVED_ROLE_NAMES = new Set(["superadmin"]);

const LEVEL_OPTIONS: Array<{ value: PermissionLevel; label: string }> = [
  { value: PERMISSION_LEVELS.NONE, label: PERMISSION_LABELS[PERMISSION_LEVELS.NONE] },
  { value: PERMISSION_LEVELS.READ, label: PERMISSION_LABELS[PERMISSION_LEVELS.READ] },
  { value: PERMISSION_LEVELS.WRITE, label: PERMISSION_LABELS[PERMISSION_LEVELS.WRITE] },
  { value: PERMISSION_LEVELS.ADMIN, label: PERMISSION_LABELS[PERMISSION_LEVELS.ADMIN] },
];

async function updateRoutePermissionsAction(formData: FormData): Promise<void> {
  "use server";
  const route = (formData.get("route") as string)?.trim();
  if (!route) return;

  const updates: Array<{ role_id: number; route: string; level: number }> = [];
  const removals: number[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("role-")) continue;
    const roleId = Number(key.slice(5));
    if (!Number.isFinite(roleId)) continue;
    const level = Number(value);
    if (!Number.isFinite(level) || level < 0) continue;
    if (level === PERMISSION_LEVELS.NONE) {
      removals.push(roleId);
    } else {
      updates.push({ role_id: roleId, route, level });
    }
  }

  const sb = createAdminClient();

  if (updates.length > 0) {
    await sb
      .from("role_permissions")
      .upsert(updates, { onConflict: "role_id,route" })
      .throwOnError();
  }

  if (removals.length > 0) {
    await sb
      .from("role_permissions")
      .delete()
      .eq("route", route)
      .in("role_id", removals)
      .throwOnError();
  }

  revalidatePath("/admin/settings");
}

async function createRoleAction(formData: FormData): Promise<void> {
  "use server";
  const name = (formData.get("name") as string)?.trim().toLowerCase();
  const label = (formData.get("label") as string)?.trim();
  const rank = Number(formData.get("rank"));
  const isSuperAdmin = formData.get("isSuperAdmin") === "on";

  if (!name || !label) return;

  const sb = createAdminClient();

  await sb
    .from("roles")
    .insert({
      name,
      label,
      rank: Number.isFinite(rank) ? rank : 0,
      is_superadmin: isSuperAdmin,
    })
    .throwOnError();

  revalidatePath("/admin/settings");
}

async function updateRoleAction(formData: FormData): Promise<void> {
  "use server";
  const id = Number(formData.get("roleId"));
  const label = (formData.get("label") as string)?.trim();
  const rank = Number(formData.get("rank"));
  const isSuperAdmin = formData.get("isSuperAdmin") === "on";

  if (!Number.isFinite(id) || !label) return;

  const sb = createAdminClient();

  await sb
    .from("roles")
    .update({
      label,
      rank: Number.isFinite(rank) ? rank : 0,
      is_superadmin: isSuperAdmin,
    })
    .eq("id", id)
    .throwOnError();

  revalidatePath("/admin/settings");
}

async function deleteRoleAction(formData: FormData): Promise<void> {
  "use server";
  const id = Number(formData.get("roleId"));
  const name = (formData.get("roleName") as string) ?? "";

  if (!Number.isFinite(id) || RESERVED_ROLE_NAMES.has(name)) return;

  const sb = createAdminClient();
  await sb.from("roles").delete().eq("id", id).throwOnError();

  revalidatePath("/admin/settings");
}

function ensureRouteMatrix(roles: DbRole[], matrix: RoutePermissionMatrix): RoutePermissionMatrix {
  const clone: RoutePermissionMatrix = {};
  const knownRoutes = new Set(ROUTE_DESCRIPTORS.map((d) => d.route));

  for (const descriptor of ROUTE_DESCRIPTORS) {
    const current = matrix[descriptor.route] ?? {};
    const entry: Record<string, PermissionLevel> = {};
    for (const role of roles) {
      entry[role.name] = current[role.name] ?? descriptor.defaultLevel;
    }
    clone[descriptor.route] = entry;
  }

  for (const [route, current] of Object.entries(matrix)) {
    if (knownRoutes.has(route)) continue;
    const descriptor = getRouteDescriptor(route);
    const entry: Record<string, PermissionLevel> = {};
    for (const role of roles) {
      entry[role.name] = current[role.name] ?? (descriptor?.defaultLevel ?? PERMISSION_LEVELS.NONE);
    }
    clone[route] = entry;
  }

  return clone;
}

export const metadata = { title: "Berechtigungen verwalten" };

export default async function AdminSettingsPage() {
  const { roles, matrix } = await getPermissionOverview();
  const expandedMatrix = ensureRouteMatrix(roles, matrix);
  const knownRoutes = new Set(ROUTE_DESCRIPTORS.map((d) => d.route));
  const additionalRoutes = Object.keys(expandedMatrix).filter((route) => !knownRoutes.has(route));
  const routeList = [
    ...ROUTE_DESCRIPTORS,
    ...additionalRoutes.map((route) => ({
      route,
      label: getRouteDescriptor(route)?.label ?? route,
      description: getRouteDescriptor(route)?.description ?? "Benutzerdefinierte Route",
      defaultLevel: PERMISSION_LEVELS.READ,
    })),
  ];

  return (
    <RoleGate routeKey="admin/settings" minimumLevel={PERMISSION_LEVELS.ADMIN}>
      <section className="flex flex-col gap-8">
        <header className="card p-6 flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Rollen &amp; Berechtigungen</h1>
          <p className="text-sm text-zinc-400">
            Lege Rollen an, passe deren Rang an und definiere für jedes Tool, ob Mitglieder lesen,
            schreiben oder administrieren dürfen.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section className="card p-6 flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-zinc-100">Rollen verwalten</h2>
            <div className="flex flex-col gap-4">
              {roles.map((role) => (
                <form
                  key={role.id}
                  action={updateRoleAction}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-3"
                >
                  <input type="hidden" name="roleId" value={role.id} />
                  <input type="hidden" name="roleName" value={role.name} />
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-zinc-100">{role.label}</div>
                      <div className="text-xs text-zinc-500">{role.name}</div>
                    </div>
                    {!RESERVED_ROLE_NAMES.has(role.name) && (
                      <button
                        formAction={deleteRoleAction}
                        className="rounded-lg border border-red-700 text-red-300 text-xs px-3 py-1.5 hover:bg-red-900/30"
                      >
                        Löschen
                      </button>
                    )}
                  </div>
                  <label className="text-xs text-zinc-400 flex flex-col gap-1">
                    Anzeigename
                    <input
                      name="label"
                      defaultValue={role.label}
                      className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    />
                  </label>
                  <label className="text-xs text-zinc-400 flex flex-col gap-1">
                    Rang (höhere Zahl = mächtiger)
                    <input
                      name="rank"
                      type="number"
                      defaultValue={role.rank}
                      className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    />
                  </label>
                  <label className="text-xs text-zinc-400 flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="isSuperAdmin"
                      defaultChecked={role.isSuperAdmin}
                      disabled={role.name === "superadmin"}
                      className="accent-zinc-200"
                    />
                    Superadmin (voller Zugriff)
                  </label>
                  <div className="flex justify-end gap-2">
                    <button className="rounded-lg border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-2 hover:bg-zinc-800/60">
                      Speichern
                    </button>
                  </div>
                </form>
              ))}
            </div>

            <form action={createRoleAction} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-3">
              <h3 className="text-sm font-medium text-zinc-100">Neue Rolle anlegen</h3>
              <label className="text-xs text-zinc-400 flex flex-col gap-1">
                Systemname (ohne Leerzeichen)
                <input
                  name="name"
                  placeholder="z. B. editor"
                  className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
              <label className="text-xs text-zinc-400 flex flex-col gap-1">
                Anzeigename
                <input
                  name="label"
                  placeholder="z. B. Editor"
                  className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
              <label className="text-xs text-zinc-400 flex flex-col gap-1">
                Rang
                <input
                  name="rank"
                  type="number"
                  defaultValue={10}
                  className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
              <label className="text-xs text-zinc-400 flex items-center gap-2">
                <input type="checkbox" name="isSuperAdmin" className="accent-zinc-200" />
                Superadmin-Rolle
              </label>
              <div className="flex justify-end">
                <button className="rounded-lg border border-green-700 text-green-300 text-xs font-medium px-3 py-2 hover:bg-green-900/30">
                  Rolle erstellen
                </button>
              </div>
            </form>
          </section>

          <section className="card p-6 flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-zinc-100">Berechtigungen pro Tool</h2>
            <p className="text-xs text-zinc-500">
              Auswahl "Kein Zugriff" entfernt die Rolle vollständig von der Route. Änderungen greifen
              sofort nach dem Speichern.
            </p>
            <div className="flex flex-col gap-4">
              {routeList.map((descriptor) => {
                const current = expandedMatrix[descriptor.route] ?? {};
                return (
                  <form
                    key={descriptor.route}
                    action={updateRoutePermissionsAction}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-3"
                  >
                    <input type="hidden" name="route" value={descriptor.route} />
                    <div>
                      <div className="text-sm font-medium text-zinc-100">/{descriptor.route}</div>
                      {descriptor.description && (
                        <div className="text-xs text-zinc-500">{descriptor.description}</div>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {roles.map((role) => (
                        <label key={role.id} className="text-xs text-zinc-400 flex flex-col gap-1">
                          {role.label}
                          <select
                            name={`role-${role.id}`}
                            defaultValue={current[role.name] ?? PERMISSION_LEVELS.NONE}
                            className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-100"
                          >
                            {LEVEL_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <button className="rounded-lg border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-2 hover:bg-zinc-800/60">
                        Speichern
                      </button>
                    </div>
                  </form>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </RoleGate>
  );
}
