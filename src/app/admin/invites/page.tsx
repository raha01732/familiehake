import { RoleGate } from "@/components/RoleGate";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

type InviteRole = "member" | "admin";
type InviteStatus = "pending" | "accepted" | "revoked" | "expired" | "failed" | "canceled";

// ---- Datenzugriff ----
async function listInvites() {
  const client = await clerkClient();
  const list = await client.invitations.getInvitationList({ limit: 100 });
  return list.data.map((i) => ({
    id: i.id,
    email: i.emailAddress,
    status: (i.status as InviteStatus) ?? "pending",
    createdAt: i.createdAt,
    publicMetadata: (i.publicMetadata ?? {}) as Record<string, unknown>,
  }));
}

// ---- Server Actions ----
async function createInviteAction(formData: FormData): Promise<void> {
  "use server";
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const role = (formData.get("role") as InviteRole) || "member";

  if (!email || !email.includes("@")) return;

  try {
    const client = await clerkClient();
    await client.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard`,
      publicMetadata: { role },
    });
  } catch (e) {
    console.error("createInviteAction error:", e);
  } finally {
    revalidatePath("/admin/invites");
  }
}

async function revokeInviteAction(formData: FormData): Promise<void> {
  "use server";
  const invitationId = (formData.get("invitationId") as string)?.trim();
  if (!invitationId) return;
  try {
    const client = await clerkClient();
    await client.invitations.revokeInvitation(invitationId);
  } catch (e) {
    console.error("revokeInviteAction error:", e);
  } finally {
    revalidatePath("/admin/invites");
  }
}

// ---- UI-Helfer ----
function StatusBadge({ status }: { status: InviteStatus }) {
  const styles: Record<InviteStatus, string> = {
    pending:  "border-amber-600 text-amber-300 bg-amber-900/20",
    accepted: "border-green-700 text-green-300 bg-green-900/20",
    revoked:  "border-red-700 text-red-300 bg-red-900/20",
    expired:  "border-zinc-600 text-zinc-300 bg-zinc-800/30",
    failed:   "border-red-700 text-red-300 bg-red-900/20",
    canceled: "border-zinc-600 text-zinc-300 bg-zinc-800/30",
  };
  return (
    <span className={`rounded-lg border px-2 py-0.5 text-[11px] ${styles[status]}`}>
      {status}
    </span>
  );
}

function RoleBadge({ role }: { role: InviteRole }) {
  const cls = role === "admin"
    ? "border-purple-700 text-purple-300 bg-purple-900/20"
    : "border-zinc-700 text-zinc-300 bg-zinc-800/30";
  return <span className={`rounded-lg border px-2 py-0.5 text-[11px] ${cls}`}>{role}</span>;
}

function Tabs({
  active,
  baseHref = "/admin/invites",
}: {
  active: InviteStatus | "all";
  baseHref?: string;
}) {
  const items: Array<{ key: InviteStatus | "all"; label: string }> = [
    { key: "all", label: "Alle" },
    { key: "pending", label: "Pending" },
    { key: "accepted", label: "Accepted" },
    { key: "revoked", label: "Revoked" },
    { key: "expired", label: "Expired" },
  ];
  return (
    <div className="flex gap-2 text-xs">
      {items.map((it) => (
        <a
          key={it.key}
          href={it.key === "all" ? baseHref : `${baseHref}?status=${it.key}`}
          className={`px-3 py-1 rounded-lg border ${
            active === it.key
              ? "border-zinc-300 text-zinc-100 bg-zinc-800/50"
              : "border-zinc-800 text-zinc-400 hover:bg-zinc-900/60"
          }`}
        >
          {it.label}
        </a>
      ))}
    </div>
  );
}

// ---- Page ----
export const metadata = { title: "Admin | Einladungen" };

export default async function AdminInvitesPage({
  searchParams,
}: {
  searchParams?: { status?: InviteStatus };
}) {
  const invites = await listInvites();

  // Filter nach Status (optional)
  const activeStatus = searchParams?.status ?? "all";
  const filtered =
    activeStatus === "all"
      ? invites
      : invites.filter((i) => i.status === activeStatus);

  // Kleine Summary
  const counts = invites.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});
  const roles: InviteRole[] = ["member", "admin"];

  return (
    <RoleGate routeKey="admin">
      <section className="card p-6 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">Einladungen</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Erstelle Einladungen per E-Mail. Die Rolle wird beim Anlegen gesetzt.
            </p>
          </div>
          <div className="text-[11px] text-zinc-500">
            <div>pending: {counts["pending"] ?? 0}</div>
            <div>accepted: {counts["accepted"] ?? 0}</div>
            <div>revoked: {counts["revoked"] ?? 0}</div>
            <div>expired: {counts["expired"] ?? 0}</div>
          </div>
        </div>

        {/* Filter-Tabs */}
        <Tabs active={(activeStatus as InviteStatus) ?? "all"} />

        {/* Einladung erstellen */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <form action={createInviteAction} className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
            <div className="flex-1">
              <label className="text-xs text-zinc-400">E-Mail-Adresse</label>
              <input
                name="email"
                type="email"
                placeholder="nutzer@example.com"
                required
                className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Rolle</label>
              <select
                name="role"
                className="mt-1 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
                defaultValue="member"
              >
                {roles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <button className="rounded-xl border border-green-700 text-green-300 text-xs font-medium px-3 py-2 hover:bg-green-900/30">
              Einladung senden
            </button>
          </form>
          <div className="text-[11px] text-zinc-500 mt-2">
            Hinweis: E-Mail-Versand in Clerk aktivieren (Project Settings → Emails).
          </div>
        </div>

        {/* Liste (gefiltert) */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 font-medium">E-Mail</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Rolle</th>
                <th className="px-3 py-2 font-medium">Erstellt</th>
                <th className="px-3 py-2 font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filtered.map((i) => {
                const role = (i.publicMetadata?.role as InviteRole | undefined) ?? "member";
                return (
                  <tr key={i.id}>
                    <td className="px-3 py-2 text-zinc-300 text-xs">{i.email}</td>
                    <td className="px-3 py-2 text-zinc-300 text-xs">
                      <StatusBadge status={i.status} />
                    </td>
                    <td className="px-3 py-2 text-zinc-300 text-xs">
                      <RoleBadge role={role} />
                    </td>
                    <td className="px-3 py-2 text-zinc-500 text-xs">
                      {i.createdAt ? new Date(i.createdAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {i.status === "pending" ? (
                        <form action={revokeInviteAction}>
                          <input type="hidden" name="invitationId" value={i.id} />
                          <button className="rounded-lg border border-red-700 text-red-300 text-xs font-medium px-3 py-1 hover:bg-red-900/30">
                            Widerrufen
                          </button>
                        </form>
                      ) : (
                        <span className="text-[11px] text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-zinc-500 text-xs" colSpan={5}>
                    Keine Einladungen im ausgewählten Filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </RoleGate>
  );
}
