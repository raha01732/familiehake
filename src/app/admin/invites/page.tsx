import RoleGate from "@/components/RoleGate";
import { clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Einladungen" };

// Kleinere Hilfstypen – bewusst lax, weil Clerk-API-Versionen variieren können
type InviteItem = {
  id?: string;
  email?: string;
  status?: string;
  createdAt?: string | number | Date | null;
  expiresAt?: string | number | Date | null;
};

function fmtDate(v?: string | number | Date | null) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default async function AdminInvitesPage() {
  // (Optional) Rollen aus DB für spätere Zuweisungen laden – nicht zwingend genutzt,
  // aber nützlich, falls du demnächst „Rolle in Einladung“ aufnehmen willst.
  const sb = createAdminClient();
  const { data: roles } = await sb.from("roles").select("name,label,rank").order("rank", { ascending: false });

  // Einladungen aus Clerk holen; die API-Signatur hat je nach Version leichte Unterschiede,
  // deswegen mit defensiver Normalisierung.
  let invites: InviteItem[] = [];
  try {
    // Manche Clerk-Versionen liefern { data: [...] }, andere direkt ein Array
    const raw: any = await (clerkClient as any).invitations.getInvitationList?.();
    const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];

    invites = list.map((i: any) => ({
      id: i.id ?? i.invitation?.id ?? undefined,
      email: i.emailAddress ?? i.email_address ?? i.email ?? "",
      status: i.status ?? i.state ?? "pending",
      createdAt: i.createdAt ?? i.created_at ?? null,
      expiresAt: i.expiresAt ?? i.expires_at ?? null,
    }));
  } catch {
    // Wenn Clerk hier eine Methode nicht kennt, zeigen wir einfach „keine Einladungen“ an.
    invites = [];
  }

  return (
    <RoleGate routeKey="admin">
      <section className="p-6 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Einladungen</h1>
            <p className="text-sm text-zinc-400">
              Verwalte ausstehende Benutzer-Einladungen (Clerk).
            </p>
          </div>
          {/* Platzhalter für „Neue Einladung“ – Implementierung über separate Seite/Action */}
          <a
            href="/admin/invites/new"
            className="rounded-lg border border-zinc-700 text-zinc-200 text-xs px-3 py-2 hover:bg-zinc-800/60"
          >
            Einladung erstellen
          </a>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 font-medium">E-Mail</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Erstellt</th>
                <th className="px-3 py-2 font-medium">Läuft ab</th>
                <th className="px-3 py-2 font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {invites.map((i) => (
                <tr key={i.id ?? i.email}>
                  <td className="px-3 py-2 text-zinc-300 text-xs">{i.email}</td>
                  <td className="px-3 py-2 text-zinc-300 text-xs">{i.status}</td>
                  <td className="px-3 py-2 text-zinc-400 text-xs">{fmtDate(i.createdAt)}</td>
                  <td className="px-3 py-2 text-zinc-400 text-xs">{fmtDate(i.expiresAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {/* Platzhalter – Implementierung je nach Bedarf */}
                      <a
                        href={`/admin/invites/${i.id ?? ""}`}
                        className="rounded border border-zinc-700 text-zinc-200 text-[11px] px-2 py-1 hover:bg-zinc-800/60"
                      >
                        Details
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {invites.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-zinc-500 text-xs" colSpan={5}>
                    Keine Einladungen gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Optional: Rollenübersicht unten anzeigen (nur Info) */}
        {roles && roles.length > 0 && (
          <div className="card p-4">
            <div className="text-xs text-zinc-400 uppercase tracking-wide mb-2">Verfügbare Rollen</div>
            <div className="flex flex-wrap gap-2">
              {roles.map((r: any) => (
                <span
                  key={r.name}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-2 py-1 text-[11px] text-zinc-300"
                  title={`Rank: ${r.rank}`}
                >
                  {r.label} <span className="text-zinc-500">({r.name})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
    </RoleGate>
  );
}
