// /workspace/familiehake/src/app/admin/users/page.tsx

import RoleGate from "@/components/RoleGate";
import { clerkClient, auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DbRole } from "@/lib/access-db";
import { env } from "@/lib/env";
import {
  Users,
  UserPlus,
  Search,
  RotateCcw,
  X,
  Mail,
  Shield,
  ShieldCheck,
  Check,
  Star,
  Trash2,
  Plus,
  Database,
  Pencil,
  Clock,
  KeyRound,
  Smartphone,
  Monitor,
  Ban,
  Lock,
  LogIn,
  Activity,
  Globe,
  Fingerprint,
} from "lucide-react";
import {
  getClerkUserCached,
  getPrimaryEmail,
  invalidateClerkUser,
} from "@/lib/clerk-cache";

export const metadata = { title: "Admin | Benutzer & Rollen" };

type SearchParams = {
  q?: string;
  role?: string;
  edit?: string;
  new?: string;
  status?: string;
  message?: string;
  errorCode?: string;
};

type PageProps = { searchParams: Promise<SearchParams> };

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
  imageUrl: string;
  hasImage: boolean;
  lastSignInAt: number | null;
  lastActiveAt: number | null;
  banned: boolean;
  locked: boolean;
  twoFactorEnabled: boolean;
};

type ExternalAccountInfo = { provider: string; emailAddress: string | null };

type SessionInfo = {
  id: string;
  status: string;
  lastActiveAt: number | null;
  expireAt: number | null;
  browser: string;
  device: string;
  ipAddress: string | null;
  city: string | null;
  country: string | null;
  isMobile: boolean;
};

type ActivityItem = {
  id: string;
  ts: number;
  action: string;
  direction: "actor" | "target";
  detail: Record<string, unknown> | null;
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
  roleMappingAvailable: boolean;
  createdAt: number;
  updatedAt: number | null;
  imageUrl: string;
  hasImage: boolean;
  lastSignInAt: number | null;
  lastActiveAt: number | null;
  banned: boolean;
  locked: boolean;
  twoFactorEnabled: boolean;
  passwordEnabled: boolean;
  externalAccounts: ExternalAccountInfo[];
  phoneNumbers: string[];
  sessions: SessionInfo[];
  activity: ActivityItem[];
};

async function fetchRoles(): Promise<DbRole[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("roles")
    .select("id, name, label, rank, is_superadmin")
    .order("rank", { ascending: true });

  if (error) {
    console.error("fetchRoles failed:", error);
    return [];
  }

  const allowed = new Set(["user", "admin", "superadmin", "cinema"]); // cinema = Kino-Workspace Zugang
  return (
    data
      ?.filter((row) => allowed.has(String(row.name).toLowerCase()))
      .map((row) => ({
        id: row.id,
        name: String(row.name).toLowerCase(),
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

function getInitials(firstName: string, lastName: string, email: string): string {
  const first = firstName.trim();
  const last = lastName.trim();
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || first.charAt(0).toUpperCase();
  }
  return (email.trim().charAt(0) || "?").toUpperCase();
}

function getDisplayName(firstName: string, lastName: string, username: string, email: string): string {
  const full = `${firstName} ${lastName}`.trim();
  return full || username || email || "Unbenannt";
}

const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short", year: "numeric" });
function formatDate(ts: number | undefined): string {
  if (!ts) return "—";
  try {
    return dateFmt.format(new Date(ts));
  } catch {
    return "—";
  }
}

// Echte (hierarchische) Rollen vs. Workspace-Freischaltungen.
// "cinema" ist keine Rolle im eigentlichen Sinn, sondern schaltet den
// Kino-Workspace frei. Alles, was keine Kernrolle ist, gilt als
// Workspace-Freischaltung – so erscheinen künftige Workspace-Gates
// automatisch in der gleichen Sektion.
const CORE_ROLE_NAMES = new Set(["user", "admin", "superadmin"]);
function isWorkspaceRole(role: DbRole): boolean {
  return !role.isSuperAdmin && !CORE_ROLE_NAMES.has(role.name);
}

// Farbakzent je Rolle, abgeleitet aus der Theme-Palette (chart-Variablen).
function roleAccent(role: DbRole): string {
  if (role.isSuperAdmin || role.name === "superadmin") return "262 83% 58%";
  if (role.name === "admin") return "221 83% 53%";
  if (role.name === "cinema") return "27 96% 61%";
  return "220 9% 46%";
}

const relFmt = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });
const REL_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 1000 * 60 * 60 * 24 * 365],
  ["month", 1000 * 60 * 60 * 24 * 30],
  ["day", 1000 * 60 * 60 * 24],
  ["hour", 1000 * 60 * 60],
  ["minute", 1000 * 60],
];
function formatRelative(ts: number | null | undefined): string {
  if (!ts) return "—";
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60 * 1000) return "gerade eben";
  for (const [unit, ms] of REL_STEPS) {
    if (abs >= ms) return relFmt.format(Math.round(diff / ms), unit);
  }
  return "gerade eben";
}

// Audit-Action -> kurzes, lesbares deutsches Label.
const ACTION_LABELS: Record<string, string> = {
  login_success: "Anmeldung",
  access_denied: "Zugriff verweigert",
  role_change: "Rollen geändert",
  email_add: "E-Mail hinzugefügt",
  email_deleted: "E-Mail gelöscht",
  primary_email_set: "Primäre E-Mail gesetzt",
  email_verification_sent: "Verifizierung gesendet",
  theme_preference_update: "Design angepasst",
  dashboard_welcome_update: "Dashboard aktualisiert",
};
function prettyAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Fallback: snake_case humanisieren
  const cleaned = action.replace(/_/g, " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Aktion";
}

function providerLabel(provider: string): string {
  const p = provider.toLowerCase();
  if (p.includes("google")) return "Google";
  if (p.includes("github")) return "GitHub";
  if (p.includes("microsoft")) return "Microsoft";
  if (p.includes("apple")) return "Apple";
  if (p.includes("facebook")) return "Facebook";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

async function fetchAssignments(userIds: string[], rolesCatalog: DbRole[]): Promise<Record<string, DbRole[]>> {
  if (userIds.length === 0) return {};
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("user_roles")
    .select("user_id, roles(id, name, label, rank, is_superadmin)")
    .in("user_id", userIds);

  if (error) {
    return userIds.reduce<Record<string, DbRole[]>>((acc, id) => {
      acc[id] = ensureDefaultRoles(rolesCatalog, undefined);
      return acc;
    }, {});
  }

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
    imageUrl: u.imageUrl ?? "",
    hasImage: Boolean(u.hasImage),
    lastSignInAt: u.lastSignInAt ?? null,
    lastActiveAt: (u as { lastActiveAt?: number | null }).lastActiveAt ?? null,
    banned: Boolean((u as { banned?: boolean }).banned),
    locked: Boolean((u as { locked?: boolean }).locked),
    twoFactorEnabled: Boolean((u as { twoFactorEnabled?: boolean }).twoFactorEnabled),
  }));
}

async function loadUserSessions(userId: string): Promise<SessionInfo[]> {
  try {
    const client = await clerkClient();
    const raw: any = await client.sessions.getSessionList({ userId });
    const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
    return list
      .map((s: any): SessionInfo => {
        const act = s.latestActivity ?? {};
        const browser = [act.browserName, act.browserVersion].filter(Boolean).join(" ").trim();
        return {
          id: s.id,
          status: s.status ?? "unknown",
          lastActiveAt: s.lastActiveAt ?? null,
          expireAt: s.expireAt ?? null,
          browser: browser || "Unbekannter Browser",
          device: act.deviceType || (act.isMobile ? "Mobil" : "Desktop"),
          ipAddress: act.ipAddress ?? null,
          city: act.city ?? null,
          country: act.country ?? null,
          isMobile: Boolean(act.isMobile),
        };
      })
      .sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0));
  } catch (e) {
    console.error("loadUserSessions error:", e);
    return [];
  }
}

async function loadUserActivity(userId: string): Promise<ActivityItem[]> {
  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("audit_events")
      .select("ts, action, actor_user_id, target, detail")
      .or(`actor_user_id.eq.${userId},target.eq.${userId}`)
      .order("ts", { ascending: false })
      .limit(12);
    if (error) {
      // Tabelle fehlt o. Ä. – Feed bleibt einfach leer
      return [];
    }
    return (data ?? []).map((row: any, i: number) => {
      const ts = row.ts ? new Date(row.ts).getTime() : Date.now();
      return {
        id: `${ts}-${row.action}-${i}`,
        ts,
        action: String(row.action ?? ""),
        direction: row.actor_user_id === userId ? "actor" : "target",
        detail: (row.detail as Record<string, unknown> | null) ?? null,
      };
    });
  } catch {
    return [];
  }
}

async function getOneUser(userId: string, rolesCatalog: DbRole[]): Promise<UserDetail | null> {
  const client = await clerkClient();
  let u: Awaited<ReturnType<typeof client.users.getUser>>;
  try {
    u = await client.users.getUser(userId);
  } catch (e) {
    console.error("getOneUser getUser error:", e);
    return null;
  }

  const [assignments, sessions, activity] = await Promise.all([
    fetchAssignments([userId], rolesCatalog),
    loadUserSessions(userId),
    loadUserActivity(userId),
  ]);

  const primaryId = u.primaryEmailAddressId ?? undefined;
  const sb = createAdminClient();
  const { data: assignmentRows, error: assignmentError } = await sb
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)
    .limit(1);
  const roleMappingAvailable = assignmentError?.code !== "42P01";
  const hasDatabaseRole = roleMappingAvailable && (assignmentRows ?? []).length > 0;

  const emails: EmailInfo[] = u.emailAddresses.map((e) => ({
    id: e.id,
    email: e.emailAddress,
    isPrimary: e.id === primaryId,
    verification: (e.verification as { status?: string } | null) ?? null,
  }));

  const externalAccounts: ExternalAccountInfo[] = (u.externalAccounts ?? []).map((a: any) => ({
    provider: String(a.provider ?? "").replace(/^oauth_/, ""),
    emailAddress: a.emailAddress ?? null,
  }));

  const phoneNumbers: string[] = (u.phoneNumbers ?? []).map((p: any) => p.phoneNumber).filter(Boolean);

  return {
    id: u.id,
    emails,
    username: u.username ?? "",
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    roles: assignments[u.id] ?? ensureDefaultRoles(rolesCatalog, undefined),
    allowAdminManagement: Boolean((u.publicMetadata as any)?.allowAdminManagement),
    hasDatabaseRole,
    roleMappingAvailable,
    createdAt: u.createdAt ?? Date.now(),
    updatedAt: u.updatedAt ?? null,
    imageUrl: u.imageUrl ?? "",
    hasImage: Boolean(u.hasImage),
    lastSignInAt: u.lastSignInAt ?? null,
    lastActiveAt: (u as { lastActiveAt?: number | null }).lastActiveAt ?? null,
    banned: Boolean((u as { banned?: boolean }).banned),
    locked: Boolean((u as { locked?: boolean }).locked),
    twoFactorEnabled: Boolean((u as { twoFactorEnabled?: boolean }).twoFactorEnabled),
    passwordEnabled: Boolean((u as { passwordEnabled?: boolean }).passwordEnabled),
    externalAccounts,
    phoneNumbers,
    sessions,
    activity,
  };
}

async function assertRoleAssignmentAllowed(
  targetUserId: string,
  desiredRoleIds: number[],
  rolesCatalog: DbRole[]
) {
  const { userId: actorId } = await auth();
  if (!actorId) throw new Error("Forbidden: not authenticated");

  const [actorClerk, targetClerk] = await Promise.all([
    getClerkUserCached(actorId),
    getClerkUserCached(targetUserId),
  ]);
  if (!actorClerk || !targetClerk) {
    throw new Error("Forbidden: user lookup failed");
  }

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
      actorEmail: getPrimaryEmail(actorClerk),
      target: targetUserId,
      detail: { reason: "role_change_requires_admin" },
    });
    throw new Error("Forbidden: only admins may change roles");
  }

  if (targetIsProtected && !actorIsPrimarySuper) {
    await logAudit({
      action: "access_denied",
      actorUserId: actorClerk.id,
      actorEmail: getPrimaryEmail(actorClerk),
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
        actorEmail: getPrimaryEmail(actorClerk),
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
  await invalidateClerkUser(userId);

  if (added.length > 0 || removed.length > 0) {
    await logAudit({
      action: "role_change",
      actorUserId: actorClerk.id,
      actorEmail: getPrimaryEmail(actorClerk),
      target: userId,
      detail: { added, removed },
    });
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?status=success&message=user_saved");
}

async function createUserAction(formData: FormData): Promise<void> {
  "use server";
  const email = (formData.get("email") as string)?.trim().toLowerCase() ?? "";
  const firstName = (formData.get("firstName") as string)?.trim() || "";
  const lastName = (formData.get("lastName") as string)?.trim() || "";
  const username = (formData.get("username") as string)?.trim() || "";
  const password = (formData.get("password") as string)?.trim() || "";

  if (!email) {
    redirect("/admin/users?status=error&errorCode=email_missing");
  }

  const rolesCatalog = await fetchRoles();
  const userRole = rolesCatalog.find((role) => role.name === "user");
  const { userId: actorId } = await auth();
  const actorAssignments = actorId ? await fetchAssignments([actorId], rolesCatalog) : {};
  const actorRoles = actorAssignments[actorId ?? ""] ?? [];
  const actorIsPrimarySuper = actorId === env().PRIMARY_SUPERADMIN_ID;
  const actorIsAdmin = actorIsPrimarySuper || actorRoles.some((r) => r.name === "admin" || r.isSuperAdmin);

  if (!actorIsAdmin) {
    await logAudit({
      action: "access_denied",
      actorUserId: actorId,
      actorEmail: null,
      target: "user_create",
      detail: { reason: "create_requires_admin" },
    });
    redirect("/admin/users?status=error&errorCode=forbidden_create_user");
  }

  const client = await clerkClient();
  const created = await client.users.createUser({
    emailAddress: [email],
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    username: username || undefined,
    password: password || undefined,
    skipPasswordRequirement: password ? undefined : true,
    publicMetadata: {
      role: userRole?.name ?? "user",
      roles: [userRole?.name ?? "user"],
    },
  });

  if (userRole) {
    const sb = createAdminClient();
    try {
      await sb.from("user_roles").insert({ user_id: created.id, role_id: userRole.id }).throwOnError();
    } catch (error) {
      console.error("createUserAction user_roles insert error:", error);
    }
  }

  await logAudit({
    action: "role_change",
    actorUserId: (await auth()).userId ?? null,
    actorEmail: null,
    target: created.id,
    detail: { email, event: "user_created" },
  });

  revalidatePath("/admin/users");
  redirect("/admin/users?status=success&message=user_created");
}

async function ensureSupabaseUserAction(formData: FormData): Promise<void> {
  "use server";
  const userId = (formData.get("userId") as string) ?? "";
  if (!userId) {
    redirect("/admin/users?status=error&errorCode=user_id_missing");
  }

  const rolesCatalog = await fetchRoles();
  const userRole = rolesCatalog.find((role) => role.name === "user");
  if (!userRole) {
    redirect("/admin/users?status=error&errorCode=user_role_missing");
  }

  await assertRoleAssignmentAllowed(userId, [userRole.id], rolesCatalog);

  const sb = createAdminClient();
  try {
    await sb
      .from("user_roles")
      .upsert({ user_id: userId, role_id: userRole.id }, { onConflict: "user_id, role_id" })
      .throwOnError();
  } catch (error) {
    console.error("ensureSupabaseUserAction error:", error);
    revalidatePath("/admin/users");
    redirect("/admin/users?status=error&errorCode=ensure_supabase_user_failed");
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?status=success&message=supabase_user_ensured");
}

async function addEmailAction(formData: FormData): Promise<void> {
  "use server";
  const userId = (formData.get("userId") as string) ?? "";
  const newEmail = (formData.get("newEmail") as string)?.trim().toLowerCase() ?? "";
  if (!userId || !newEmail) {
    redirect("/admin/users?status=error&errorCode=email_or_user_missing");
  }

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
    revalidatePath("/admin/users");
    redirect("/admin/users?status=error&errorCode=email_add_failed");
  } finally {
    revalidatePath("/admin/users");
  }
  redirect("/admin/users?status=success&message=email_added");
}

async function makePrimaryEmailAction(formData: FormData): Promise<void> {
  "use server";
  const userId = (formData.get("userId") as string) ?? "";
  const emailId = (formData.get("emailId") as string) ?? "";
  if (!userId || !emailId) {
    redirect("/admin/users?status=error&errorCode=email_or_user_missing");
  }

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
    revalidatePath("/admin/users");
    redirect("/admin/users?status=error&errorCode=primary_email_failed");
  } finally {
    revalidatePath("/admin/users");
  }
  redirect("/admin/users?status=success&message=primary_email_updated");
}

async function deleteEmailAction(formData: FormData): Promise<void> {
  "use server";
  const userId = (formData.get("userId") as string) ?? "";
  const emailId = (formData.get("emailId") as string) ?? "";
  if (!userId || !emailId) {
    redirect("/admin/users?status=error&errorCode=email_or_user_missing");
  }

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
    revalidatePath("/admin/users");
    redirect("/admin/users?status=error&errorCode=email_delete_failed");
  } finally {
    revalidatePath("/admin/users");
  }
  redirect("/admin/users?status=success&message=email_deleted");
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const [rolesCatalog, sp] = await Promise.all([fetchRoles(), searchParams]);
  const users = await getUsers(rolesCatalog);

  const q = (sp?.q ?? "").trim().toLowerCase();
  const roleFilter = (sp?.role ?? "all").toLowerCase();
  const editId = sp?.edit;
  const newOpen = (sp?.new ?? "") === "1";
  const status = sp?.status === "error" ? "error" : sp?.status === "success" ? "success" : null;
  const statusMessage = (sp?.message ?? "").trim();
  const errorCode = (sp?.errorCode ?? "").trim();

  const { userId: actorId } = await auth();
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
  const closeHref = `/admin/users?${new URLSearchParams(
    Object.fromEntries(
      Object.entries({ q, role: roleFilter }).filter(([, v]) => (v ?? "") !== "" && v !== "all")
    )
  ).toString()}`.replace(/\?$/, "");
  const newHref = `/admin/users?${new URLSearchParams(
    Object.fromEntries(
      Object.entries({ q, role: roleFilter, new: "1" }).filter(([, v]) => (v ?? "") !== "" && v !== "all")
    )
  ).toString()}`;
  const editUserSynced = Boolean(editUser?.roleMappingAvailable && editUser?.hasDatabaseRole);
  const coreRoles = rolesCatalog.filter((r) => !isWorkspaceRole(r));
  const workspaceRoles = rolesCatalog.filter((r) => isWorkspaceRole(r));

  return (
    <RoleGate routeKey="admin/users">
      <section className="flex flex-col gap-8 animate-fade-up">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div
              className="shimmer-badge inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
              style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
            >
              <Users size={11} style={{ color: "hsl(var(--primary))" }} aria-hidden />
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{ color: "hsl(var(--primary))" }}
              >
                Admin
              </span>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                <span className="gradient-text">Benutzer &amp; Rollen</span>
              </h1>
              <p className="mt-1.5 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                Suche Benutzer, verwalte Profile und weise Rollen zu.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            {actorIsAdmin && (
              <a
                href={newHref}
                className="brand-button inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold"
              >
                <UserPlus size={15} aria-hidden />
                Neuer Benutzer
              </a>
            )}
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums text-foreground">{counts.total}</span>
                <span className="text-xs text-muted-foreground">Nutzer</span>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {Object.entries(counts.byRole).map(([roleName, amount]) => (
                  <span
                    key={roleName}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    <span className="font-semibold text-foreground tabular-nums">{amount}</span>
                    {roleName}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {status && (
          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: status === "success" ? "hsl(142 71% 45% / 0.4)" : "hsl(0 84% 60% / 0.4)",
              background: status === "success" ? "hsl(142 71% 45% / 0.06)" : "hsl(0 84% 60% / 0.06)",
              color: status === "success" ? "hsl(142 71% 55%)" : "hsl(0 84% 65%)",
            }}
          >
            {status === "success" ? "Speichern erfolgreich." : "Fehler beim Speichern."}
            {statusMessage ? <div className="mt-1 text-xs opacity-80">Info: {statusMessage}</div> : null}
            {errorCode ? <div className="mt-1 text-xs opacity-80">Fehlercode: {errorCode}</div> : null}
          </div>
        )}

        <form method="get" className="feature-card grid gap-3 p-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Suche (E-Mail, Name, Benutzername)
            </label>
            <div className="relative mt-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                name="q"
                defaultValue={q}
                placeholder="z. B. ralf, @username, name@example.com"
                className="input-field"
                style={{ paddingLeft: "2.25rem" }}
              />
            </div>
          </div>
          <div>
            <label className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Rolle</label>
            <select
              name="role"
              defaultValue={roleFilter}
              className="mt-1 input-field"
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
            <button className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary">
              <Search size={13} aria-hidden />
              Anwenden
            </button>
            <a
              href="/admin/users"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <RotateCcw size={13} aria-hidden />
              Zurücksetzen
            </a>
          </div>
        </form>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Benutzer</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Benutzername</th>
                  <th className="px-4 py-3 font-semibold">Rollen</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Zuletzt aktiv</th>
                  <th className="px-4 py-3 text-right font-semibold">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((user) => {
                  return (
                    <tr key={user.id} className="group transition-colors hover:bg-secondary/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {user.hasImage && user.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={user.imageUrl}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-inset ring-border"
                            />
                          ) : (
                            <span
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-primary-foreground ring-1 ring-inset ring-white/10"
                              style={{
                                backgroundImage:
                                  "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
                              }}
                              aria-hidden
                            >
                              {getInitials(user.firstName, user.lastName, user.email)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium text-foreground">
                                {getDisplayName(user.firstName, user.lastName, user.username, user.email)}
                              </span>
                              {user.banned && (
                                <Ban size={13} style={{ color: "hsl(var(--destructive))" }} aria-label="Gebannt" />
                              )}
                              {user.locked && !user.banned && (
                                <Lock size={13} style={{ color: "hsl(27 96% 50%)" }} aria-label="Gesperrt" />
                              )}
                              {user.twoFactorEnabled && (
                                <ShieldCheck size={13} style={{ color: "hsl(142 71% 45%)" }} aria-label="2FA aktiv" />
                              )}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{user.email || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
                        {user.username ? `@${user.username}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {user.roles.map((role) => {
                            const accent = roleAccent(role);
                            const workspace = isWorkspaceRole(role);
                            return (
                              <span
                                key={role.id}
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                style={{
                                  background: `hsl(${accent} / 0.1)`,
                                  color: `hsl(${accent})`,
                                  border: `1px solid hsl(${accent} / 0.25)`,
                                }}
                                title={workspace ? "Workspace-Freischaltung" : "Rolle"}
                              >
                                {workspace ? (
                                  <KeyRound size={10} aria-hidden />
                                ) : (role.isSuperAdmin || role.name === "admin") ? (
                                  <ShieldCheck size={10} aria-hidden />
                                ) : null}
                                {role.label}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-muted-foreground lg:table-cell">
                        {formatRelative(user.lastActiveAt ?? user.lastSignInAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={{
                            pathname: "/admin/users",
                            query: {
                              ...(q ? { q } : {}),
                              ...(roleFilter !== "all" ? { role: roleFilter } : {}),
                              edit: user.id,
                            },
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
                          aria-label={`${getDisplayName(user.firstName, user.lastName, user.username, user.email)} bearbeiten`}
                        >
                          <Pencil size={12} aria-hidden />
                          <span className="hidden sm:inline">Bearbeiten</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Users size={28} className="opacity-40" aria-hidden />
                        <p className="text-sm font-medium">Keine Benutzer gefunden.</p>
                        <p className="text-xs">Passe Suche oder Rollenfilter an.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {editUser ? (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          {/* Backdrop – Klick schließt das Modal */}
          <a href={closeHref} aria-label="Schließen" className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

          <div className="card relative my-4 flex w-full max-w-lg flex-col overflow-hidden p-0 shadow-2xl sm:max-h-[calc(100vh-2rem)]">
            {/* Header mit Identität */}
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              {editUser.hasImage && editUser.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={editUser.imageUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-inset ring-border"
                />
              ) : (
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-primary-foreground ring-1 ring-inset ring-white/10"
                  style={{ backgroundImage: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}
                  aria-hidden
                >
                  {getInitials(editUser.firstName, editUser.lastName, editUser.emails[0]?.email ?? "")}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {getDisplayName(
                      editUser.firstName,
                      editUser.lastName,
                      editUser.username,
                      editUser.emails[0]?.email ?? ""
                    )}
                  </span>
                  {editUser.banned && (
                    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: "hsl(var(--destructive) / 0.12)", color: "hsl(var(--destructive))" }}>
                      <Ban size={9} aria-hidden /> Gebannt
                    </span>
                  )}
                  {editUser.locked && !editUser.banned && (
                    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: "hsl(27 96% 61% / 0.12)", color: "hsl(27 96% 50%)" }}>
                      <Lock size={9} aria-hidden /> Gesperrt
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  Mitglied seit {formatDate(editUser.createdAt)}
                </div>
              </div>
              <a
                href={closeHref}
                aria-label="Schließen"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X size={15} aria-hidden />
              </a>
            </div>

            {/* Scrollbarer Inhalt */}
            <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
              <form action={saveUserAction} className="flex flex-col gap-4">
                <input type="hidden" name="userId" value={editUser.id} />

                {/* Profil */}
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Vorname</label>
                      <input name="firstName" defaultValue={editUser.firstName} className="mt-1 input-field" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Nachname</label>
                      <input name="lastName" defaultValue={editUser.lastName} className="mt-1 input-field" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Benutzername</label>
                    <input name="username" defaultValue={editUser.username} className="mt-1 input-field" />
                  </div>
                </div>

                {/* Rollen (hierarchisch) */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Shield size={12} aria-hidden />
                    Rollen
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {coreRoles.map((role) => {
                      const checked = editUser.roles.some((r) => r.id === role.id);
                      const disabled = (role.isSuperAdmin && !actorIsSuper) || !actorIsAdmin;
                      return (
                        <label key={role.id} className="cursor-pointer">
                          <input
                            type="checkbox"
                            name="roles"
                            value={role.id}
                            defaultChecked={checked}
                            disabled={disabled}
                            className="peer sr-only"
                          />
                          <span className="flex items-center justify-between gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary peer-checked:[&>svg]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/40 peer-disabled:cursor-not-allowed peer-disabled:opacity-40">
                            <span>{role.label}</span>
                            <Check size={14} className="shrink-0 opacity-0 transition-opacity" aria-hidden />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {actorIsPrimarySuper && editUserIsAdmin ? (
                    <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-foreground">
                      <input type="hidden" name="allowAdminManagement" value="off" />
                      <input
                        type="checkbox"
                        name="allowAdminManagement"
                        defaultChecked={editUser.allowAdminManagement}
                        style={{ accentColor: "hsl(var(--primary))" }}
                      />
                      Andere Admins dürfen diesen Admin verwalten
                    </label>
                  ) : null}
                  {!actorIsAdmin && (
                    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "hsl(27 96% 50%)" }}>
                      Nur der freigegebene Admin oder der Superadmin darf Rollen verändern.
                    </div>
                  )}
                </div>

                {/* Workspace-Freischaltungen (keine Rollen, sondern Zugänge je Bereich) */}
                {workspaceRoles.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <KeyRound size={12} aria-hidden />
                      Workspace-Zugänge
                    </div>
                    <p className="-mt-1 text-[11px] text-muted-foreground">
                      Schaltet einzelne Bereiche frei – unabhängig von der Rolle.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {workspaceRoles.map((role) => {
                        const checked = editUser.roles.some((r) => r.id === role.id);
                        const disabled = !actorIsAdmin;
                        return (
                          <label
                            key={role.id}
                            className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2.5"
                          >
                            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                              <KeyRound size={14} className="text-muted-foreground" aria-hidden />
                              {role.label}
                            </span>
                            <input
                              type="checkbox"
                              name="roles"
                              value={role.id}
                              defaultChecked={checked}
                              disabled={disabled}
                              className="peer sr-only"
                            />
                            {/* Switch-Track */}
                            <span className="relative h-5 w-9 shrink-0 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring/40 peer-disabled:opacity-40 peer-checked:[&>span]:translate-x-4">
                              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform" aria-hidden />
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Supabase-Verknüpfung: nur bei Bedarf als volle Box */}
                {!editUserSynced ? (
                  <div
                    className="rounded-xl border p-3"
                    style={{
                      borderColor: "hsl(27 96% 61% / 0.4)",
                      background: "hsl(27 96% 61% / 0.06)",
                    }}
                  >
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2">
                        <Database size={15} className="mt-0.5 shrink-0" style={{ color: "hsl(27 96% 50%)" }} aria-hidden />
                        <div>
                          <div className="text-sm font-semibold text-foreground">Datenbank-Verknüpfung fehlt</div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {!editUser.roleMappingAvailable
                              ? "Die Tabelle user_roles fehlt in Supabase. Bitte das Schema aus db/schema.sql ausführen."
                              : "Noch kein Eintrag in user_roles – einmal anlegen, damit die Clerk-ID sauber verknüpft ist."}
                          </p>
                        </div>
                      </div>
                      <form action={ensureSupabaseUserAction} className="shrink-0">
                        <input type="hidden" name="userId" value={editUser.id} />
                        <button
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary disabled:opacity-60 sm:w-auto"
                          disabled={!actorIsAdmin || !editUser.roleMappingAvailable}
                        >
                          Eintrag anlegen
                        </button>
                      </form>
                    </div>
                  </div>
                ) : null}

                {/* Footer-Aktionen */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  {editUserSynced ? (
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Check size={12} style={{ color: "hsl(142 71% 45%)" }} aria-hidden />
                      Mit Datenbank verknüpft
                    </span>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-2">
                    <a
                      href={closeHref}
                      className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      Abbrechen
                    </a>
                    <button
                      className="brand-button rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-60"
                      disabled={!actorIsAdmin}
                    >
                      Speichern
                    </button>
                  </div>
                </div>
              </form>

              {/* E-Mail-Adressen */}
              <div className="border-t border-border pt-5">
                <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Mail size={12} aria-hidden />
                  E-Mail-Adressen
                </div>
                <div className="flex flex-col gap-2">
                  {editUser.emails.map((email) => {
                    const status = email.verification?.status ?? "unverified";
                    const verified = status === "verified";
                    return (
                      <div
                        key={email.id}
                        className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate text-xs font-medium text-foreground">{email.email}</span>
                          {email.isPrimary ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={{
                                border: "1px solid hsl(var(--primary) / 0.4)",
                                color: "hsl(var(--primary))",
                                background: "hsl(var(--primary) / 0.1)",
                              }}
                            >
                              <Star size={9} aria-hidden />
                              Primär
                            </span>
                          ) : null}
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={
                              verified
                                ? { border: "1px solid hsl(142 71% 45% / 0.4)", color: "hsl(142 71% 45%)", background: "hsl(142 71% 45% / 0.1)" }
                                : { border: "1px solid hsl(27 96% 61% / 0.4)", color: "hsl(27 96% 50%)", background: "hsl(27 96% 61% / 0.1)" }
                            }
                          >
                            {verified ? "verifiziert" : status}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {!email.isPrimary && verified && (
                            <form action={makePrimaryEmailAction}>
                              <input type="hidden" name="userId" value={editUser.id} />
                              <input type="hidden" name="emailId" value={email.id} />
                              <button className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary">
                                <Star size={11} aria-hidden />
                                Primär
                              </button>
                            </form>
                          )}
                          {!email.isPrimary && (
                            <form action={deleteEmailAction}>
                              <input type="hidden" name="userId" value={editUser.id} />
                              <input type="hidden" name="emailId" value={email.id} />
                              <button
                                aria-label="E-Mail löschen"
                                className="inline-flex items-center justify-center rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors"
                                style={{ borderColor: "hsl(var(--destructive) / 0.4)", color: "hsl(var(--destructive))" }}
                              >
                                <Trash2 size={11} aria-hidden />
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form action={addEmailAction} className="mt-3 flex gap-2">
                  <input type="hidden" name="userId" value={editUser.id} />
                  <input
                    name="newEmail"
                    type="email"
                    placeholder="Neue E-Mail-Adresse"
                    className="flex-1 input-field"
                  />
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary">
                    <Plus size={13} aria-hidden />
                    Hinzufügen
                  </button>
                </form>
              </div>

              {/* Konto & Sicherheit */}
              <div className="border-t border-border pt-5">
                <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Fingerprint size={12} aria-hidden />
                  Konto &amp; Sicherheit
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Letzter Login</dt>
                    <dd
                      className="mt-0.5 flex items-center gap-1 font-medium text-foreground"
                      title={editUser.lastSignInAt ? new Date(editUser.lastSignInAt).toLocaleString("de-DE") : undefined}
                    >
                      <LogIn size={11} className="text-muted-foreground" aria-hidden />
                      {formatRelative(editUser.lastSignInAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Zuletzt aktiv</dt>
                    <dd className="mt-0.5 flex items-center gap-1 font-medium text-foreground">
                      <Clock size={11} className="text-muted-foreground" aria-hidden />
                      {formatRelative(editUser.lastActiveAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Zwei-Faktor</dt>
                    <dd className="mt-1">
                      {editUser.twoFactorEnabled ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ background: "hsl(142 71% 45% / 0.1)", color: "hsl(142 71% 45%)", border: "1px solid hsl(142 71% 45% / 0.25)" }}
                        >
                          <ShieldCheck size={10} aria-hidden /> Aktiv
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Inaktiv
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Telefon</dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      {editUser.phoneNumbers.length > 0 ? editUser.phoneNumbers.join(", ") : "—"}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Login-Methode</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {editUser.passwordEnabled && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-foreground">
                          <KeyRound size={10} aria-hidden /> Passwort
                        </span>
                      )}
                      {editUser.externalAccounts.map((a, i) => (
                        <span
                          key={`${a.provider}-${i}`}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: "hsl(var(--primary) / 0.08)", color: "hsl(var(--primary))", border: "1px solid hsl(var(--primary) / 0.2)" }}
                          title={a.emailAddress ?? undefined}
                        >
                          <Globe size={10} aria-hidden /> {providerLabel(a.provider)}
                        </span>
                      ))}
                      {!editUser.passwordEnabled && editUser.externalAccounts.length === 0 && (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Aktive Sitzungen */}
              <div className="border-t border-border pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Monitor size={12} aria-hidden />
                    Aktive Sitzungen
                  </div>
                  {editUser.sessions.length > 0 && (
                    <span className="rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {editUser.sessions.length}
                    </span>
                  )}
                </div>
                {editUser.sessions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Keine aktiven Sitzungen.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {editUser.sessions.slice(0, 5).map((s) => {
                      const location = [s.city, s.country].filter(Boolean).join(", ");
                      return (
                        <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
                            {s.isMobile ? <Smartphone size={14} /> : <Monitor size={14} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-foreground">{s.browser}</div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {location || "Ort unbekannt"}
                              {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[11px] text-muted-foreground">{formatRelative(s.lastActiveAt)}</div>
                            {s.status === "active" && (
                              <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: "hsl(142 71% 45%)" }}>
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "hsl(142 71% 45%)" }} aria-hidden />
                                aktiv
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Letzte Aktivitäten */}
              <div className="border-t border-border pt-5">
                <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Activity size={12} aria-hidden />
                  Letzte Aktivitäten
                </div>
                {editUser.activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Keine Aktivitäten erfasst.</p>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {editUser.activity.map((a) => (
                      <li key={a.id} className="flex items-start gap-2.5 text-xs">
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: a.direction === "actor" ? "hsl(var(--primary))" : "hsl(27 96% 50%)" }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground">{prettyAction(a.action)}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {a.direction === "actor" ? "durch diesen Nutzer" : "an diesem Konto"} · {formatRelative(a.ts)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {newOpen ? (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <a href={closeHref} aria-label="Schließen" className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

          <div className="card relative my-4 flex w-full max-w-lg flex-col overflow-hidden p-0 shadow-2xl sm:max-h-[calc(100vh-2rem)]">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
                <UserPlus size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">Neuen Benutzer anlegen</div>
                <div className="truncate text-xs text-muted-foreground">
                  Erstellt einen Clerk-Benutzer mit Standardrolle „User".
                </div>
              </div>
              <a
                href={closeHref}
                aria-label="Schließen"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X size={15} aria-hidden />
              </a>
            </div>

            <form action={createUserAction} className="flex flex-col gap-4 overflow-y-auto px-5 py-5">
              <div>
                <label className="text-xs font-medium text-muted-foreground">E-Mail</label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  disabled={!actorIsAdmin}
                  className="mt-1 input-field disabled:opacity-60"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Vorname</label>
                  <input
                    name="firstName"
                    placeholder="optional"
                    disabled={!actorIsAdmin}
                    className="mt-1 input-field disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nachname</label>
                  <input
                    name="lastName"
                    placeholder="optional"
                    disabled={!actorIsAdmin}
                    className="mt-1 input-field disabled:opacity-60"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Benutzername</label>
                <input
                  name="username"
                  placeholder="optional"
                  disabled={!actorIsAdmin}
                  className="mt-1 input-field disabled:opacity-60"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Temporäres Passwort (optional)</label>
                <input
                  name="password"
                  type="password"
                  placeholder="optional"
                  disabled={!actorIsAdmin}
                  className="mt-1 input-field disabled:opacity-60"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Leer lassen, damit der Benutzer das Passwort selbst per Einladung/Reset festlegt.
                </p>
              </div>

              {!actorIsAdmin && (
                <div className="text-[11px]" style={{ color: "hsl(27 96% 50%)" }}>
                  Nur Admins dürfen neue Benutzer anlegen.
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <a
                  href={closeHref}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  Abbrechen
                </a>
                <button
                  className="brand-button inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-60"
                  disabled={!actorIsAdmin}
                >
                  <UserPlus size={14} aria-hidden />
                  Benutzer anlegen
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </RoleGate>
  );
}
