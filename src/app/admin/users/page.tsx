import { RoleGate } from "@/components/RoleGate";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

type UserRole = "admin" | "member";
type SearchParams = { q?: string; role?: "all" | UserRole };

async function getUsers() {
  const client = await clerkClient();
  // Holt bis zu 100 Nutzer; Filterung machen wir serverseitig per JS (Clerk bietet hier kein vollwertiges Search-API).
  const list = await client.users.getUserList({ limit: 100, orderBy: "-created_at" });
  return list.data.map(u => ({
    id: u.id,
    email: u.emailAddresses?.[0]?.emailAddress ?? "",
    username: u.username ?? "",
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    role: (u.publicMetadata?.role as UserRole | undefined) ?? "member",
    createdAt: u.createdAt
  }));
}

async function updateRole(formData: FormData) {
  "use server";
  const userId = formData.get("userId") as string;
  const role = formData.get("role") as UserRole;
  const client = await clerkClient();
  await client.users.updateUser(userId, { publicMetadata: { role } });
  revalidatePath("/admin/users");
}

export const metadata = { title: "Admin | Benutzer & Rollen" };

export default async function AdminUsersPage({
  searchParams
}: { searchParams?: SearchParams }) {
  const users = await getUsers();

  const q = (searchParams?.q ?? "").trim().toLowerCase();
  const roleFilter = (searchParams?.role ?? "all") as "all" | UserRole;

  // Filter Logik
  const filtered = users.filter(u => {
    const hay = `${u.email} ${u.username} ${u.firstName} ${u.lastName}`.toLowerCase();
    const matchesQuery = q === "" ? true : hay.includes(q);
    const matchesRole = roleFilter === "all" ? true : u.role === roleFilter;
    return matchesQuery && matchesRole;
  });

  const counts = filtered.reduce(
    (acc, u) => {
      acc.total++;
      acc[u.role]++;
      return acc;
    },
    { total: 0, admin: 0, member: 0 } as { total: number; admin: number; member: number }
  );

  return (
    <RoleGate routeKey="admin/users">
      <section className="card p-6 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Benutzer & Rollen</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Suche nach <span className="text-zinc-300">E-Mail, Name oder Benutzername</span> und filtere nach Rolle.
            </p>
          </div>
          <div className="text-[11px] text-zinc-500">
            <div>Gesamt: {counts.total}</div>
            <div>admin: {counts.admin}</div>
            <div>member: {counts.member}</div>
          </div>
        </div>

        {/* Such- & Filterleiste (GET-Params, kein Client-State nötig) */}
        <form method="get" className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-zinc-400">Suche (E-Mail, Name, Benutzername)</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="z. B. ralf, @username, name@example.com"
              className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Rolle</label>
            <select
              name="role"
              defaultValue={roleFilter}
              className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="all">alle</option>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div className="sm:col-span-3 flex gap-2">
            <button className="rounded-xl border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-2 hover:bg-zinc-800/60">
              Anwenden
            </button>
            <a
              href="/admin/users"
              className="rounded-xl border border-zinc-800 text-zinc-400 text-xs font-medium px-3 py-2 hover:bg-zinc-900/60"
            >
              Zurücksetzen
            </a>
          </div>
        </form>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 font-medium">E-Mail</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Benutzername</th>
                <th className="px-3 py-2 font-medium">Rolle</th>
                <th className="px-3 py-2 font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filtered.map(u => (
                <tr key={u.id}>
                  <td className="px-3 py-2 text-zinc-300 text-xs">{u.email || "—"}</td>
                  <td className="px-3 py-2 text-zinc-300 text-xs">
                    {(u.firstName || u.lastName) ? `${u.firstName} ${u.lastName}`.trim() : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-300 text-xs">{u.username || "—"}</td>
                  <td className="px-3 py-2 text-zinc-300 text-xs">{u.role}</td>
                  <td className="px-3 py-2">
                    <form action={updateRole} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <select
                        name="role"
                        defaultValue={u.role}
                        className="rounded-lg bg-zinc-900 border border-zinc-700 text-xs px-2 py-1 text-zinc-100"
                      >
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                      </select>
                      <button className="rounded-lg border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-1 hover:bg-zinc-800/60">
                        Speichern
                      </button>
                    </form>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-zinc-500 text-xs" colSpan={5}>
                    Keine Benutzer gefunden. Suchbegriff oder Filter anpassen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="text-[11px] text-zinc-600">
          Hinweis: Anzeige ist auf die letzten 100 Nutzer begrenzt. Für sehr große Teams bauen wir später Pagination/Server-Filter.
        </div>
      </section>
    </RoleGate>
  );
}
