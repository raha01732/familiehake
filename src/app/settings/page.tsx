import { RoleGate } from "@/components/RoleGate";
import type { UserRole } from "@/lib/access-map";
import { getAccessMapFromDb } from "@/lib/access-db";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export const metadata = { title: "Settings | Private Tools" };

async function upsertAccessAction(formData: FormData) {
  "use server";
  const route = (formData.get("route") as string)?.trim();
  const roles = (formData.getAll("roles") as string[]).map(r => r.trim()) as UserRole[];
  if (!route) return;

  const sb = createAdminClient();
  await sb.from("tools_access")
    .upsert({ route, roles }, { onConflict: "route" });

  revalidatePath("/settings");
}

async function deleteAccessAction(formData: FormData) {
  "use server";
  const route = (formData.get("route") as string)?.trim();
  if (!route) return;

  const sb = createAdminClient();
  await sb.from("tools_access").delete().eq("route", route);
  revalidatePath("/settings");
}

export default async function SettingsPage() {
  const accessMap = await getAccessMapFromDb();
  const rows = Object.entries(accessMap);

  const allRoles: UserRole[] = ["member", "admin"];

  return (
    <RoleGate routeKey="settings">
      <section className="card p-6 flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Zugriffsregeln (aus DB)</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Hier steuerst du, welche Rollen eine Route sehen dürfen. Änderungen greifen sofort.
          </p>
        </div>

        {/* Bestehende Einträge */}
        <div className="grid gap-4">
          {rows.map(([route, roles]) => (
            <div key={route} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <form action={upsertAccessAction} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1">
                  <div className="text-zinc-100 font-medium text-sm">/{route}</div>
                  <input type="hidden" name="route" value={route} />
                  <div className="text-zinc-500 text-xs">Sichtbar für: {roles.join(", ")}</div>
                </div>
                <div className="flex items-center gap-3">
                  {allRoles.map(r => (
                    <label key={r} className="text-xs text-zinc-200 flex items-center gap-1">
                      <input
                        type="checkbox"
                        name="roles"
                        value={r}
                        defaultChecked={roles.includes(r)}
                        className="accent-zinc-200"
                      />
                      {r}
                    </label>
                  ))}
                  <button className="rounded-xl border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-1.5 hover:bg-zinc-800/60">
                    Speichern
                  </button>
                </div>
              </form>

              <form action={deleteAccessAction} className="mt-3">
                <input type="hidden" name="route" value={route} />
                <button className="rounded-xl border border-red-700 text-red-300 text-xs font-medium px-3 py-1.5 hover:bg-red-900/30">
                  Löschen
                </button>
              </form>
            </div>
          ))}
        </div>

        {/* Neuer Eintrag */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <form action={upsertAccessAction} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <label className="text-xs text-zinc-400">Neue Route (ohne führenden Slash)</label>
              <input
                name="route"
                placeholder="z.B. reports, analytics/usage"
                className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            <div className="flex items-center gap-3">
              {allRoles.map(r => (
                <label key={r} className="text-xs text-zinc-200 flex items-center gap-1">
                  <input type="checkbox" name="roles" value={r} className="accent-zinc-200" defaultChecked={r==="member"} />
                  {r}
                </label>
              ))}
              <button className="rounded-xl border border-green-700 text-green-300 text-xs font-medium px-3 py-1.5 hover:bg-green-900/30">
                Anlegen
              </button>
            </div>
          </form>
        </div>
      </section>
    </RoleGate>
  );
}
