// src/app/admin/users/page.tsx

import RoleGate from "@/components/RoleGate";
import { clerkClient, auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DbRole } from "@/lib/access-db";
import { env } from "@/lib/env";

export const metadata = { title: "Admin | Benutzer & Rollen" };

type SearchParams = {
  q?: string;
  role?: string;
  edit?: string;
};

type EmailInfo = {
  id: string;
  email: string;
  isPrimary: boolean;
  verification: { status?: string } | null;
};

type UserSummary = {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  roles: DbRole[];
  createdAt: number;
};

type UserDetail = {
  id: string;
  emails: EmailInfo[];
  username: string;
  firstName: string;
  lastName: string;
  roles: DbRole[];
  allowAdminManagement: boolean;
  hasDatabaseRole: boolean;
};

async function fetchRoles(): Promise<DbRole[]> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("roles")
    .select("id, name, label, rank, is_superadmin")
    .order("rank", { ascending: true });
  const allowed = new Set(["user", "admin"]);
  return (
    data
      ?.filter((row) => allowed.has(row.name))
      .map((row) => ({
        id: row.id,
        name: row.name,
        label: row.label ?? row.name,
        rank: typeof row.rank === "number" ? row.rank : 0,
        isSuperAdmin: !!row.is_superadmin,
      })) ?? []
  );
}

function ensureDefaultRoles(rolesCatalog: DbRole[], assigned: DbRole[] | undefined): DbRole[] {
  if (assigned && assigned.length > 0) return assigned;
  const userRole = rolesCatalog.find((r) => r.name === "user");
  return userRole ? [userRole] : [];
}

function highestRole(roles: DbRole[]): DbRole | null {
  return roles.slice().sort((a, b) => b.rank - a.rank)[0] ?? null;
}

async function fetchAssignments(userIds: string[], rolesCatalog: DbRole[]): Promise<Record<string, DbRole[]>> {
  if (userIds.length === 0) return {};
  const sb = createAdminClient();
  const { data } = await sb
    .from("user_roles")
    .select("user_id, roles(id, name, label, rank, is_superadmin)")
    .in("user_id", userIds);

  const map: Record<string, DbRole[]> = {};
  for (const row of data ?? []) {
    const roleRow = (row as any).roles;
    if (!roleRow) continue;
    const role: DbRole = {
      id: roleRow.id,
      name: roleRow.name,
      label: roleRow.label ?? roleRow.name,
      rank: typeof roleRow.rank === "number" ? roleRow.rank : 0,
      isSuperAdmin: !!roleRow.is_superadmin,
    };
    if (!map[row.user_id]) {
      map[row.user_id] = [];
    }
    map[row.user_id].push(role);
  }
  for (const id in map) {
    map[id] = ensureDefaultRoles(rolesCatalog, map[id]);
  }
  for (const id of userIds) {
    if (!map[id]) {
      map[id] = ensureDefaultRoles(rolesCatalog, undefined);
    }
  }
  return map;
}

async function getUsers(rolesCatalog: DbRole[], limit = 100): Promise<UserSummary[]> {
  const client = await clerkClient();
  const list = await client.users.getUserList({ limit, orderBy: "-created_at" });
  const userIds = list.data.map((u) => u.id);
  const assignments = await fetchAssignments(userIds, rolesCatalog);

  return list.data.map((u) => ({
    id: u.id,
    email: u.emailAddresses?.[0]?.emailAddress ?? "",
    username: u.username ?? "",
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    roles: assignments[u.id] ?? ensureDefaultRoles(rolesCatalog, undefined),
    createdAt: u.createdAt ?? Date.now(),
  }));
}

async function getOneUser(userId: string, rolesCatalog: DbRole[]): Promise<UserDetail | null> {
  const client = await clerkClient();
  try {
    const u = await client.users.getUser(userId);
    const assignments = await fetchAssignments([userId], rolesCatalog);
    const sb = createAdminClient();
    const { data: assignmentRows } = await sb.from("user_roles").select("role_id").eq("user_id", userId);
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
      roles: assignments[u.id] ?? ensureDefaultRoles(rolesCatalog, undefined),
      allowAdminManagement: Boolean((u.publicMetadata as any)?.allowAdminManagement),
      hasDatabaseRole: (assignmentRows ?? []).length > 0,
    };
  } catch {
    return null;
  }
}

async function assertRoleAssignmentAllowed(
  targetUserId: string,
  desiredRoleIds: number[],
  rolesCatalog: DbRole[]
) {
  const { userId: actorId } = auth();
  if (!actorId) throw new Error("Forbidden: not authenticated");

  const client = await clerkClient();
  const [actorClerk, targetClerk] = await Promise.all([
    client.users.getUser(actorId),
    client.users.getUser(targetUserId),
  ]);

  const primarySuperAdminId = env().PRIMARY_SUPERADMIN_ID;
  const assignments = await fetchAssignments([actorId, targetUserId], rolesCatalog);
  const actorRoles = assignments[actorId] ?? [];
  const targetRoles = assignments[targetUserId] ?? [];

  const actorIsPrimarySuper = actorClerk.id === primarySuperAdminId;
  const actorIsAdmin = actorRoles.some((r) => r.name === "admin" || r.isSuperAdmin) || actorIsPrimarySuper;
  const targetIsAdmin = targetRoles.some((r) => r.name === "admin" || r.isSuperAdmin);
  const targetIsProtected =
    targetClerk.id === primarySuperAdminId || targetRoles.some((r) => r.isSuperAdmin || r.name === "superadmin");
  const desiredRoles = desiredRoleIds
    .map((id) => rolesCatalog.find((r) => r.id === id))
    .filter((r): r is DbRole => !!r);

  if (!actorIsAdmin) {
    await logAudit({
      action: "access_denied",
      actorUserId: actorClerk.id,
      actorEmail: actorClerk.primaryEmailAddress?.emailAddress ?? null,
      target: targetUserId,
      detail: { reason: "role_change_requires_admin" },
    });
    throw new Error("Forbidden: only admins may change roles");
  }

  if (targetIsProtected && !actorIsPrimarySuper) {
    await logAudit({
      action: "access_denied",
      actorUserId: actorClerk.id,
      actorEmail: actorClerk.primaryEmailAddress?.emailAddress ?? null,
      target: targetUserId,
      detail: {
        reason: "protected_admin",
        attempted_roles: desiredRoles.map((r) => r.name),
      },
    });
    throw new Error("Forbidden: only the primary superadmin may change this account");
  }

  if (targetIsAdmin && !actorIsPrimarySuper) {
    const delegationAllowed = Boolean((targetClerk.publicMetadata as any)?.allowAdminManagement);
    if (!delegationAllowed) {
      await logAudit({
        action: "access_denied",
        actorUserId: actorClerk.id,
        actorEmail: actorClerk.primaryEmailAddress?.emailAddress ?? null,
        target: targetUserId,
        detail: {
          reason: "admin_management_not_delegated",
          attempted_roles: desiredRoles.map((r) => r.name),
        },
      });
      throw new Error("Forbidden: admin changes require delegation by the superadmin");
    }
  }

  return { actorClerk, actorRoles, targetRoles, targetClerk, actorIsPrimarySuper };
}

function diffRoles(before: DbRole[], after: DbRole[]) {
  const beforeNames = new Set(before.map((r) => r.name));
  const afterNames = new Set(after.map((r) => r.name));
  const added = [...afterNames].filter((name) => !beforeNames.has(name));
  const removed = [...beforeNames].filter((name) => !afterNames.has(name));
  return { added, removed };
}

async function saveUserAction(formData: FormData): Promise<void> {
  "use server";
  const userId = (formData.get("userId") as string) ?? "";
  const firstName = (formData.get("firstName") as string)?.trim() || "";
  const lastName = (formData.get("lastName") as string)?.trim() || "";
  const username = (formData.get("username") as string)?.trim() || "";
  const roleIdsRaw = formData.getAll("roles") as string[];
  const allowAdminManagement = (formData.get("allowAdminManagement") as string | null) === "on";

  if (!userId) return;

  const rolesCatalog = await fetchRoles();
  const desiredRoleIds = roleIdsRaw
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));

  const userRole = rolesCatalog.find((r) => r.name === "user");
  if (desiredRoleIds.length === 0 && userRole) {
    desiredRoleIds.push(userRole.id);
  }

  const { actorClerk, targetRoles, targetClerk, actorIsPrimarySuper } = await assertRoleAssignmentAllowed(
    userId,
    desiredRoleIds,
    rolesCatalog
  );

  const sb = createAdminClient();
  const { data: existingRows } = await sb
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId);
  const existingIds = new Set<number>((existingRows ?? []).map((r) => r.role_id));
  const desiredIds = new Set<number>(desiredRoleIds);

  const toInsert = [...desiredIds].filter((id) => !existingIds.has(id));
  const toDelete = [...existingIds].filter((id) => !desiredIds.has(id));

  if (toInsert.length > 0) {
    await sb
      .from("user_roles")
      .insert(toInsert.map((roleId) => ({ user_id: userId, role_id: roleId })))
      .throwOnError();
  }

  if (toDelete.length > 0) {
    await sb
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .in("role_id", toDelete)
      .throwOnError();
  }

  const newAssignments = await fetchAssignments([userId], rolesCatalog);
  const afterRoles = newAssignments[userId] ?? ensureDefaultRoles(rolesCatalog, undefined);
  const { added, removed } = diffRoles(targetRoles, afterRoles);

  const highest = highestRole(afterRoles);

  const client = await clerkClient();
  await client.users.updateUser(userId, {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    username: username || undefined,
    publicMetadata: {
      role: highest?.name ?? null,
      roles: afterRoles.map((r) => r.name),
      allowAdminManagement: actorIsPrimarySuper
        ? allowAdminManagement
        : (targetClerk.publicMetadata as any)?.allowAdminManagement,
    },
  });

  if (added.length > 0 || removed.length > 0) {
    await logAudit({
      action: "role_change",
      actorUserId: actorClerk.id,
      actorEmail: actorClerk.primaryEmailAddress?.emailAddress ?? null,
      target: userId,
      detail: { added, removed },
    });
  }

  revalidatePath("/admin/users");
}

async function ensureSupabaseUserAction(formData: FormData): Promise<void> {
  "use server";
  const userId = (formData.get("userId") as string) ?? "";
  if (!userId) return;

  const rolesCatalog = await fetchRoles();
  const userRole = rolesCatalog.find((role) => role.name === "user");
  if (!userRole) throw new Error("User-Rolle nicht konfiguriert");

  await assertRoleAssignmentAllowed(userId, [userRole.id], rolesCatalog);

  const sb = createAdminClient();
  await sb
    .from("user_roles")
    .upsert({ user_id: userId, role_id: userRole.id }, { onConflict: "user_id, role_id" })
    .throwOnError();

  revalidatePath("/admin/users");
}

async function addEmailAction(formData: FormData): Promise<void> {
  "use server";
  const userId = (formData.get("userId") as string) ?? "";
  const newEmail = (formData.get("newEmail") as string)?.trim().toLowerCase() ?? "";
  if (!userId || !newEmail) return;

  try {
    const { clerkAddEmailAddress, clerkPrepareEmailVerification } = await import("@/lib/clerk-rest");
    const created = await clerkAddEmailAddress(userId, newEmail);
    await clerkPrepareEmailVerification(created.id);
    await logAudit({
      action: "role_change",
      actorUserId: (await auth()).userId ?? null,
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

async function makePrimaryEmailAction(formData: FormData): Promise<void> {
  "use server";
  const userId = (formData.get("userId") as string) ?? "";
  const emailId = (formData.get("emailId") as string) ?? "";
  if (!userId || !emailId) return;

  try {
    const { clerkSetPrimaryEmail } = await import("@/lib/clerk-rest");
    await clerkSetPrimaryEmail(userId, emailId);
    await logAudit({
      action: "role_change",
      actorUserId: (await auth()).userId ?? null,
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

async function deleteEmailAction(formData: FormData): Promise<void> {
  "use server";
  const userId = (formData.get("userId") as string) ?? "";
  const emailId = (formData.get("emailId") as string) ?? "";
  if (!userId || !emailId) return;

  try {
    const { clerkDeleteEmailAddress } = await import("@/lib/clerk-rest");
    await clerkDeleteEmailAddress(emailId);
    await logAudit({
      action: "role_change",
      actorUserId: (await auth()).userId ?? null,
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

export default async function AdminUsersPage({ searchParams }: { searchParams?: SearchParams }) {
  const rolesCatalog = await fetchRoles();
  const users = await getUsers(rolesCatalog);

  const q = (searchParams?.q ?? "").trim().toLowerCase();
  const roleFilter = (searchParams?.role ?? "all").toLowerCase();
  const editId = searchParams?.edit;

  const { userId: actorId } = auth();
  const actorAssignments = actorId ? await fetchAssignments([actorId], rolesCatalog) : {};
  const actorRoles = actorAssignments[actorId ?? ""] ?? [];
  const actorIsPrimarySuper = actorId === env().PRIMARY_SUPERADMIN_ID;
  const actorIsSuper = actorIsPrimarySuper || actorRoles.some((r) => r.isSuperAdmin);
  const actorIsAdmin = actorIsSuper || actorRoles.some((r) => r.name === "admin");

  const filtered = users.filter((user) => {
    const matchesQuery =
      q === ""
        ? true
        : `${user.email} ${user.username} ${user.firstName} ${user.lastName}`.toLowerCase().includes(q);
    const matchesRole =
      roleFilter === "all"
        ? true
        : user.roles.some((role) => role.name.toLowerCase() === roleFilter);
    return matchesQuery && matchesRole;
  });

  const counts = filtered.reduce(
    (acc, user) => {
      acc.total++;
      const primary = highestRole(user.roles)?.name ?? "unknown";
      acc.byRole[primary] = (acc.byRole[primary] ?? 0) + 1;
      return acc;
    },
    { total: 0, byRole: {} as Record<string, number> }
  );

  const editUser = editId ? await getOneUser(editId, rolesCatalog) : null;
  const editUserIsAdmin = editUser?.roles.some((role) => role.name === "admin") ?? false;

  return (
    <RoleGate routeKey="admin/users">
      <section className="card p-6 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Benutzer &amp; Rollen</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Suche Benutzer, verwalte Profile und weise Rollen zu. Admin-Änderungen sind nur für den freigegebenen Admin oder
              den Superadmin möglich.
            </p>
          </div>
          <div className="text-[11px] text-zinc-500">
            <div>Gesamt: {counts.total}</div>
            {Object.entries(counts.byRole).map(([roleName, amount]) => (
              <div key={roleName}>
                {roleName}: {amount}
              </div>
            ))}
          </div>
        </div>

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
              {rolesCatalog.map((role) => (
                <option key={role.id} value={role.name.toLowerCase()}>
                  {role.label}
                </option>
              ))}
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
                <th className="px-3 py-2 font-medium">Rollen</th>
                <th className="px-3 py-2 font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td className="px-3 py-2 text-zinc-200">{user.email}</td>
                  <td className="px-3 py-2 text-zinc-400">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{user.username || "—"}</td>
                  <td className="px-3 py-2 text-zinc-300">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <span
                          key={role.id}
                          className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-300"
                        >
                          {role.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={{
                        pathname: "/admin/users",
                        query: {
                          ...(q ? { q } : {}),
                          ...(roleFilter !== "all" ? { role: roleFilter } : {}),
                          edit: user.id,
                        },
                      }}
                      className="rounded-lg border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-1.5 hover:bg-zinc-800/60"
                    >
                      Bearbeiten
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-xs text-zinc-500">
                    Keine Benutzer gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editUser ? (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative mx-auto mt-24 w-full max-w-lg card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="text-sm font-semibold text-zinc-100">Benutzer bearbeiten</div>
              <a
                href={`/admin/users?${new URLSearchParams(
                  Object.fromEntries(
                    Object.entries({ q, role: roleFilter }).filter(([, v]) => (v ?? "") !== "" && v !== "all")
                  )
                ).toString()}`}
                className="text-xs rounded-lg border border-zinc-700 text-zinc-300 px-2 py-1 hover:bg-zinc-800/60"
              >
                Schließen
              </a>
            </div>

            <div className="p-5 flex flex-col gap-5">
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

                <div className="flex flex-col gap-2">
                  <span className="text-xs text-zinc-400">Rollen</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {rolesCatalog.map((role) => {
                      const checked = editUser.roles.some((r) => r.id === role.id);
                      const disabled = role.isSuperAdmin && !actorIsSuper;
                      return (
                        <label key={role.id} className="flex items-center gap-2 text-sm text-zinc-200">
                          <input
                            type="checkbox"
                            name="roles"
                            value={role.id}
                            defaultChecked={checked}
                            disabled={disabled}
                            className="accent-zinc-200"
                          />
                          <span>
                            {role.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {actorIsPrimarySuper && editUserIsAdmin ? (
                    <label className="mt-2 flex items-center gap-2 text-xs text-zinc-300">
                      <input type="hidden" name="allowAdminManagement" value="off" />
                      <input
                        type="checkbox"
                        name="allowAdminManagement"
                        defaultChecked={editUser.allowAdminManagement}
                        className="accent-zinc-200"
                      />
                      Andere Admins dürfen diesen Admin verwalten
                    </label>
                  ) : null}
                  {!actorIsAdmin && (
                    <div className="text-[11px] text-amber-400">
                      Nur der freigegebene Admin oder der Superadmin darf Rollen verändern.
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-zinc-100">Supabase-Verknüpfung</div>
                      <p className="text-xs text-zinc-400">
                        {editUser.hasDatabaseRole
                          ? "Eintrag in user_roles vorhanden."
                          : "Noch kein Eintrag in user_roles – bitte einmal anlegen, damit Clerk-IDs sauber verknüpft sind."}
                      </p>
                    </div>
                    {editUser.hasDatabaseRole ? (
                      <span className="inline-flex items-center rounded-full border border-green-700 px-3 py-1 text-[11px] text-green-300">
                        Synchronisiert
                      </span>
                    ) : (
                      <form action={ensureSupabaseUserAction} className="flex gap-2">
                        <input type="hidden" name="userId" value={editUser.id} />
                        <button
                          className="rounded-lg border border-blue-700 text-blue-200 text-xs font-medium px-3 py-2 hover:bg-blue-900/40"
                          disabled={!actorIsAdmin}
                        >
                          Supabase-Eintrag anlegen
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <a
                    href={`/admin/users?${new URLSearchParams(
                      Object.fromEntries(
                        Object.entries({ q, role: roleFilter }).filter(([, v]) => (v ?? "") !== "" && v !== "all")
                      )
                    ).toString()}`}
                    className="rounded-lg border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-2 hover:bg-zinc-800/60"
                  >
                    Abbrechen
                  </a>
                  <button
                    className="rounded-lg border border-green-700 text-green-300 text-xs font-medium px-3 py-2 hover:bg-green-900/30"
                    disabled={!actorIsAdmin}
                  >
                    Speichern
                  </button>
                </div>
              </form>

              <div className="border-t border-zinc-800 pt-4">
                <div className="text-sm font-semibold text-zinc-100 mb-2">E-Mail-Adressen</div>
                <div className="grid gap-2">
                  {editUser.emails.map((email) => {
                    const status = email.verification?.status ?? "unverified";
                    const verified = status === "verified";
                    return (
                      <div
                        key={email.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 gap-2"
                      >
                        <div className="text-xs text-zinc-300">
                          {email.email}
                          {email.isPrimary ? (
                            <span className="ml-2 rounded border border-purple-700 text-purple-300 px-2 py-0.5">primary</span>
                          ) : null}
                          <span
                            className={`ml-2 rounded border px-2 py-0.5 ${
                              verified ? "border-green-700 text-green-300" : "border-amber-600 text-amber-300"
                            }`}
                          >
                            {verified ? "verified" : status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {!email.isPrimary && verified && (
                            <form action={makePrimaryEmailAction}>
                              <input type="hidden" name="userId" value={editUser.id} />
                              <input type="hidden" name="emailId" value={email.id} />
                              <button className="rounded-lg border border-zinc-700 text-zinc-200 text-[11px] px-2 py-1 hover:bg-zinc-800/60">
                                Als primär setzen
                              </button>
                            </form>
                          )}
                          {!email.isPrimary && (
                            <form action={deleteEmailAction}>
                              <input type="hidden" name="userId" value={editUser.id} />
                              <input type="hidden" name="emailId" value={email.id} />
                              <button className="rounded-lg border border-red-700 text-red-300 text-[11px] px-2 py-1 hover:bg-red-900/30">
                                Löschen
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form action={addEmailAction} className="mt-4 flex gap-2">
                  <input type="hidden" name="userId" value={editUser.id} />
                  <input
                    name="newEmail"
                    type="email"
                    placeholder="Neue E-Mail-Adresse"
                    className="flex-1 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
                  />
                  <button className="rounded-lg border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-2 hover:bg-zinc-800/60">
                    Hinzufügen
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </RoleGate>
  );
}
