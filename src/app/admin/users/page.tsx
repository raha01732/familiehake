import { RoleGate } from "@/components/RoleGate";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { logAudit } from "@/lib/audit";
import {
  clerkAddEmailAddress,
  clerkPrepareEmailVerification,
  clerkSetPrimaryEmail,
  clerkDeleteEmailAddress,
} from "@/lib/clerk-rest";

type UserRole = "admin" | "member";
type SearchParams = { q?: string; role?: "all" | UserRole; edit?: string };

type EmailInfo = {
  id: string;
  email: string;
  isPrimary: boolean;
  verification: { status?: string } | null;
};

async function getUsers(limit = 100) {
  const client = await clerkClient();
  const list = await client.users.getUserList({ limit, orderBy: "-created_at" });
  return list.data.map((u) => ({
    id: u.id,
    email: u.emailAddresses?.[0]?.emailAddress ?? "",
    username: u.username ?? "",
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    role: (u.publicMetadata?.role as UserRole | undefined) ?? "member",
    createdAt: u.createdAt,
  }));
}

async function getOneUser(userId: string) {
  const client = await clerkClient();
  const u = await client.users.getUser(userId);
  const primaryId = u.primaryEmailAddressId ?? undefined;

  const emails: EmailInfo[] = (u.emailAddresses ?? []).map((e) => ({
    id: e.id,
    email: e.emailAddress,
    isPrimary: e.id === primaryId,
    verification: e.verification ?? null,
  }));

  return {
    id: u.id,
    emails,
    username: u.username ?? "",
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    role: (u.publicMetadata?.role as UserRole | undefined) ?? "member",
  };
}

/** Server Action: Profil & Rolle speichern */
async function saveUserAction(formData: FormData): Promise<void> {
  "use server";
  const userId = (formData.get("userId") as string) ?? "";
  const firstName = (formData.get("firstName") as string)?.trim() || "";
  const lastName = (formData.get("lastName") as string)?.trim() || "";
  const username = (formData.get("username") as string)?.trim() || "";
  const role = (formData.get("role") as UserRole) ?? "member";
  if (!userId) return;

  const client = await clerkClient();
  const before = await client.users.getUser(userId);
  const prevRole = (before.publicMetadata?.role as UserRole | undefined) ?? "member";

  await client.users.updateUser(userId, {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    username: username || undefined,
    publicMetadata: { role },
  });

  if (prevRole !== role) {
    await logAudit({
      action: "role_change",
      actorUserId: null,
      actorEmail: null,
      target: userId,
      detail: { from: prevRole, to: role, email: before.emailAddresses?.[0]?.emailAddress },
    });
  }
  revalidatePath("/admin/users");
}

/** Server Action: Rollenwechsel direkt in der Tabelle */
async function updateRole(formData: FormData) {
  "use server";
  const userId = formData.get("userId") as string;
  const role = formData.get("role") as UserRole;
  const client = await clerkClient();
  const before = await client.users.getUser(userId);
  const prevRole = (before.publicMetadata?.role as UserRole | undefined) ?? "member";

  await client.users.updateUser(userId, { publicMetadata: { role } });

  if (prevRole !== role) {
    await logAudit({
      action: "role_change",
      actorUserId: null,
      actorEmail: null,
      target: userId,
      detail: { from: prevRole, to: role, email: before.emailAddresses?.[0]?.emailAddress },
    });
  }
  revalidatePath("/admin/users");
}

/** Server Action: Neue E-Mail hinzufügen + Verifizierung anstoßen */
async function addEmailAction(formData: FormData): Promise<void> {
  "use server";
  const userId = (formData.get("userId") as string) ?? "";
  const newEmail = (formData.get("newEmail") as string)?.trim().toLowerCase() ?? "";
  if (!userId || !newEmail) return;

  try {
    const created = await clerkAddEmailAddress(userId, newEmail);
    await clerkPrepareEmailVerification(created.id); // Verifizierungslink senden
    await logAudit({
      action: "role_change",
      actorUserId: null,
      actorEmail: null,
      target: userId,
      detail: { email_add: newEmail, step: "verification_sent" },
    });
  } catch (e) {
    console.error("addEmailAction error:", e);
  } finally {
    revalidatePath("/admin/users");
  }
}

/** Server Action: Als primär setzen (nur wenn verifiziert) */
async function makePrimaryEmailAction(formData: FormData): Promise<void> {
  "use server";
  const userId = (formData.get("userId") as string) ?? "";
  const emailId = (formData.get("emailId") as string) ?? "";
  if (!userId || !emailId) return;

  try {
    await clerkSetPrimaryEmail(userId, emailId);
    await logAudit({
      action: "role_change",
      actorUserId: null,
      actorEmail: null,
      target: userId,
      detail: { primary_email_set: emailId },
    });
  } catch (e) {
    console.error("makePrimaryEmailAction error:", e);
  } finally {
    revalidatePath("/admin/users");
  }
}

/** Server Action: E-Mail löschen (nicht primäre) */
async function deleteEmailAction(formData: FormData): Promise<void> {
  "use server";
  const userId = (formData.get("userId") as string) ?? "";
  const emailId = (formData.get("emailId") as string) ?? "";
  if (!userId || !emailId) return;

  try {
    await clerkDeleteEmailAddress(emailId);
    await logAudit({
      action: "role_change",
      actorUserId: null,
      actorEmail: null,
      target: userId,
      detail: { email_deleted: emailId },
    });
  } catch (e) {
    console.error("deleteEmailAction error:", e);
  } finally {
    revalidatePath("/admin/users");
  }
}

export const metadata = { title: "Admin | Benutzer & Rollen" };

export default async function AdminUsersPage({ searchParams }: { searchParams?: SearchParams }) {
  const users = await getUsers();

  const q = (searchParams?.q ?? "").trim().toLowerCase();
  const roleFilter = (searchParams?.role ?? "all") as "all" | UserRole;
  const editId = searchParams?.edit;

  const filtered = users.filter((u) => {
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

  const editUser = editId ? await getOneUser(editId) : null;
  const allRoles: UserRole[] = ["member", "admin"];

  return (
    <RoleGate routeKey="admin/users">
      <section className="card p-6 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Benutzer & Rollen</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Suche, bearbeite Profil, verwalte E-Mails (Verifizierung/Primär).
            </p>
          </div>
          <div className="text-[11px] text-zinc-500">
            <div>Gesamt: {counts.total}</div>
            <div>admin: {counts.admin}</div>
            <div>member: {counts.member}</div>
          </div>
        </div>

        {/* Suche/Filter */}
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

        {/* Tabelle */}
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
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2 text-zinc-300 text-xs">{u.email || "—"}</td>
                  <td className="px-3 py-2 text-zinc-300 text-xs">
                    {(u.firstName || u.lastName) ? `${u.firstName} ${u.lastName}`.trim() : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-300 text-xs">{u.username || "—"}</td>
                  <td className="px-3 py-2 text-zinc-300 text-xs">{u.role}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
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

                      <Link
                        href={`/admin/users?${new URLSearchParams({ q, role: roleFilter, edit: u.id }).toString()}`}
                        className="rounded-lg border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-1 hover:bg-zinc-800/60"
                      >
                        Bearbeiten
                      </Link>
                    </div>
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
      </section>

      {/* Modal (Server-rendered, ohne JS-Handler) */}
      {editUser ? (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative mx-auto mt-24 w-full max-w-lg card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="text-sm font-semibold text-zinc-100">Benutzer bearbeiten</div>
              {/* Schließen per Link (kein onClick nötig) */}
              <a
                href={`/admin/users?${new URLSearchParams(
                  Object.fromEntries(
                    Object.entries({ q, role: roleFilter }).filter(([_, v]) => (v ?? "") !== "" && v !== "all")
                  )
                ).toString()}`}
                className="text-xs rounded-lg border border-zinc-700 text-zinc-300 px-2 py-1 hover:bg-zinc-800/60"
              >
                Schließen
              </a>
            </div>

            <div className="p-5 flex flex-col gap-5">
              {/* Profil & Rolle */}
              <form action={saveUserAction} className="flex flex-col gap-3">
                <input type="hidden" name="userId" value={editUser.id} />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-400">Vorname</label>
                    <input
                      name="firstName"
                      defaultValue={editUser.firstName}
                      className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400">Nachname</label>
                    <input
                      name="lastName"
                      defaultValue={editUser.lastName}
                      className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-zinc-400">Benutzername</label>
                  <input
                    name="username"
                    defaultValue={editUser.username}
                    className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
                  />
                </div>

                <div>
                  <label className="text-xs text-zinc-400">Rolle</label>
                  <select
                    name="role"
                    defaultValue={editUser.role}
                    className="mt-1 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <a
                    href={`/admin/users?${new URLSearchParams(
                      Object.fromEntries(
                        Object.entries({ q, role: roleFilter }).filter(([_, v]) => (v ?? "") !== "" && v !== "all")
                      )
                    ).toString()}`}
                    className="rounded-lg border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-2 hover:bg-zinc-800/60"
                  >
                    Abbrechen
                  </a>
                  <button className="rounded-lg border border-green-700 text-green-300 text-xs font-medium px-3 py-2 hover:bg-green-900/30">
                    Speichern
                  </button>
                </div>
              </form>

              {/* E-Mail-Adressen verwalten */}
              <div className="border-t border-zinc-800 pt-4">
                <div className="text-sm font-semibold text-zinc-100 mb-2">E-Mail-Adressen</div>

                {/* Liste */}
                <div className="grid gap-2">
                  {editUser.emails.map((e) => {
                    const status = e.verification?.status ?? "unverified";
                    const verified = status === "verified";
                    return (
                      <div
                        key={e.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 gap-2"
                      >
                        <div className="text-xs text-zinc-300">
                          {e.email}{" "}
                          {e.isPrimary ? (
                            <span className="ml-2 rounded border border-purple-700 text-purple-300 px-2 py-0.5">primary</span>
                          ) : null}
                          <span
                            className={`ml-2 rounded border px-2 py-0.5 ${
                              verified
                                ? "border-green-700 text-green-300"
                                : "border-amber-600 text-amber-300"
                            }`}
                          >
                            {verified ? "verified" : status}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {!verified && (
                            <form action={async (fd: FormData) => {
                              "use server";
                              const emailId = fd.get("emailId") as string;
                              if (!emailId) return;
                              await clerkPrepareEmailVerification(emailId);
                              revalidatePath("/admin/users");
                            }}>
                              <input type="hidden" name="emailId" value={e.id} />
                              <button className="rounded-lg border border-amber-700 text-amber-300 text-xs font-medium px-3 py-1 hover:bg-amber-900/30">
                                Verifizierung senden
                              </button>
                            </form>
                          )}

                          {!e.isPrimary && verified && (
                            <form action={makePrimaryEmailAction}>
                              <input type="hidden" name="userId" value={editUser.id} />
                              <input type="hidden" name="emailId" value={e.id} />
                              <button className="rounded-lg border border-green-700 text-green-300 text-xs font-medium px-3 py-1 hover:bg-green-900/30">
                                Als primär setzen
                              </button>
                            </form>
                          )}

                          {!e.isPrimary && (
                            <form action={deleteEmailAction}>
                              <input type="hidden" name="userId" value={editUser.id} />
                              <input type="hidden" name="emailId" value={e.id} />
                              <button className="rounded-lg border border-red-700 text-red-300 text-xs font-medium px-3 py-1 hover:bg-red-900/30">
                                Entfernen
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {editUser.emails.length === 0 && (
                    <div className="text-[11px] text-zinc-500">Keine E-Mail-Adressen vorhanden.</div>
                  )}
                </div>

                {/* Neue E-Mail hinzufügen */}
                <form action={addEmailAction} className="mt-3 flex items-end gap-2">
                  <input type="hidden" name="userId" value={editUser.id} />
                  <div className="flex-1">
                    <label className="text-xs text-zinc-400">Neue E-Mail</label>
                    <input
                      name="newEmail"
                      type="email"
                      placeholder="neue@mail.tld"
                      className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
                    />
                  </div>
                  <button className="rounded-lg border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-2 hover:bg-zinc-800/60">
                    Hinzufügen & Link senden
                  </button>
                </form>

                <div className="text-[11px] text-zinc-500 mt-2">
                  Hinweis: Der Nutzer muss den Verifizierungslink öffnen. Danach kannst du „Als primär setzen“ klicken.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </RoleGate>
  );
}
