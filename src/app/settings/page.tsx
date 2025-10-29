import { RoleGate } from "@/components/RoleGate";
import type { UserRole } from "@/lib/access-map";
import { getAccessMapFromDb } from "@/lib/access-db";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

// Simple Info-Banner
function Banner({ kind, msg }: { kind: "ok" | "err"; msg: string }) {
  const base =
    kind === "ok"
      ? "border-green-700 text-green-300 bg-green-900/20"
      : "border-red-700 text-red-300 bg-red-900/20";
  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${base}`}>
      {msg}
    </div>
  );
}

export const metadata = { title: "Settings | Private Tools" };

// Server Action: Upsert
export async function upsertAccessAction(formData: FormData) {
  "use server";
  const route = (formData.get("route") as string)?.trim();
  // Alle angehakten Rollen einsammeln
  const roles = (formData.getAll("roles") as string[]).map((r) => r.trim()) as UserRole[];

  // Mindest-Validierung
  if (!route) {
    return { ok: false, message: "Route darf nicht leer sein." };
  }
  if (roles.length === 0) {
    return { ok: false, message: "Mindestens eine Rolle auswählen." };
  }

  try {
    const sb = createAdminClient();
    const { error } = await sb.from("tools_access").upsert(
      { route, roles, updated_at: new Date().toISOString() },
      { onConflict: "route" }
    );
    if (error) {
      return { ok: false, message: `DB-Fehler beim Upsert: ${error.message}` };
    }
    revalidatePath("/settings");
    return { ok: true, message: `Regel für /${route} gespeichert.` };
  } catch (e: any) {
    return { ok: false, message: `Serverfehler: ${e?.message ?? "unbekannt"}` };
  }
}

// Server Action: Delete
export async function deleteAccessAction(formData: FormData) {
  "use server";
  const route = (formData.get("route") as string)?.trim();
  if (!route) return { ok: false, message: "Route fehlt." };

  try {
    const sb = createAdminClient();
    const { error } = await sb.from("tools_access").delete().eq("route", route);
    if (error) {
      return { ok: false, message: `DB-Fehler beim Löschen: ${error.message}` };
    }
    revalidatePath("/settings");
    return { ok: true, message: `Regel für /${route} gelöscht.` };
  } catch (e: any) {
    return { ok: false, message: `Serverfehler: ${e?.message ?? "unbekannt"}` };
  }
}

export default async function SettingsPage() {
  const accessMap = await getAccessMapFromDb();
  const rows = Object.entries(accessMap);
  const allRoles: UserRole[] = ["member", "admin"];

  // Wir zeigen ggf. Rückmeldungen der letzten Aktion (progressiv)
  // (Server Actions liefern ein Objekt; ohne Client State zeigen wir nur statisch nach Reload)
  // Für maximale Einfachheit verzichten wir auf useFormStatus o.ä.

  return (
    <RoleGate routeKey="settings">
      <section className="card p-6 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Zugriffsregeln (aus DB)</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Lege fest, welche Rollen eine Route sehen dürfen. Änderungen greifen sofort nach Speichern.
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
                  <div className="text-zinc-500 text-xs">Aktuell: {roles.join(", ")}</div>
                </div>
                <div className="flex items-center gap-3">
                  {allRoles.map((r) => (
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
              {allRoles.map((r) => (
                <label key={r} className="text-xs text-zinc-200 flex items-center gap-1">
                  <input type="checkbox" name="roles" value={r} className="accent-zinc-200" defaultChecked={r === "member"} />
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
