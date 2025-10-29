import { RoleGate } from "@/components/RoleGate";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";

async function getUsers() {
  const client = await clerkClient();
  const list = await client.users.getUserList({ limit: 20, orderBy: "-created_at" });
  return list.data.map(u => ({
    id: u.id,
    email: u.emailAddresses?.[0]?.emailAddress ?? "(ohne E-Mail)",
    role: (u.publicMetadata?.role as "admin" | "member" | undefined) ?? "member",
    createdAt: u.createdAt
  }));
}

async function updateRole(formData: FormData) {
  "use server";
  const userId = formData.get("userId") as string;
  const role = formData.get("role") as "admin" | "member";

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const prevRole = (user.publicMetadata?.role as "admin" | "member" | undefined) ?? "member";

  await client.users.updateUser(userId, { publicMetadata: { role } });

  // Audit: role_change
  await logAudit({
    action: "role_change",
    actorUserId: null, // optional: falls du hier den Admin erfassen willst → currentUser() im Server Action Kontext lesen
    actorEmail: null,
    target: userId,
    detail: { from: prevRole, to: role, email: user.emailAddresses?.[0]?.emailAddress }
  });

  revalidatePath("/admin/users");
}

export const metadata = { title: "Admin | Benutzer & Rollen" };

export default async function AdminUsersPage() {
  const users = await getUsers();
  return (
    <RoleGate routeKey="admin/users">
      <section className="card p-6 flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Benutzer & Rollen</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Weise Nutzern Rollen zu. Nur Admins haben Zugang zu dieser Seite.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 font-medium">E-Mail</th>
                <th className="px-3 py-2 font-medium">Rolle</th>
                <th className="px-3 py-2 font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {users.map(u => (
                <tr key={u.id}>
                  <td className="px-3 py-2 text-zinc-300 text-xs">{u.email}</td>
                  <td className="px-3 py-2 text-zinc-300 text-xs">{u.role}</td>
                  <td className="px-3 py-2">
                    <form action={updateRole} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <select name="role" defaultValue={u.role} className="rounded-lg bg-zinc-900 border border-zinc-700 text-xs px-2 py-1 text-zinc-100">
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
            </tbody>
          </table>
        </div>

        <div className="text-[11px] text-zinc-600">
          Hinweis: Liste zeigt aktuell die letzten 20 Nutzer. Pagination & Suche können später ergänzt werden.
        </div>
      </section>
    </RoleGate>
  );
}
