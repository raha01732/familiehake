import RoleGate from "@/components/RoleGate";
import { clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Mail, UserPlus } from "lucide-react";

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

// Status-Akzent aus der Theme-Palette (chart-Variablen / Feedback-Farben).
function inviteStatusAccent(status?: string): string {
  switch ((status ?? "").toLowerCase()) {
    case "accepted":
    case "completed":
      return "142 71% 45%"; // grün
    case "revoked":
    case "expired":
      return "0 84% 57%"; // rot
    case "pending":
    default:
      return "27 96% 50%"; // amber
  }
}

export default async function AdminInvitesPage() {
  // (Optional) Rollen aus DB für spätere Zuweisungen laden – nicht zwingend genutzt,
  // aber nützlich, falls du demnächst „Rolle in Einladung" aufnehmen willst.
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
    // Wenn Clerk hier eine Methode nicht kennt, zeigen wir einfach „keine Einladungen" an.
    invites = [];
  }

  return (
    <RoleGate routeKey="admin">
      <section className="flex flex-col gap-8 animate-fade-up">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div
              className="shimmer-badge inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
              style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
            >
              <Mail size={11} style={{ color: "hsl(var(--primary))" }} aria-hidden />
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{ color: "hsl(var(--primary))" }}
              >
                Clerk
              </span>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                <span className="gradient-text">Einladungen</span>
              </h1>
              <p className="mt-1.5 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                Verwalte ausstehende Benutzer-Einladungen (Clerk).
              </p>
            </div>
          </div>
          <a
            href="/admin/invites/new"
            className="brand-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            <UserPlus size={15} aria-hidden />
            Einladung erstellen
          </a>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-secondary/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">E-Mail</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">Erstellt</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Läuft ab</th>
                  <th className="px-4 py-3 text-right font-semibold">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invites.map((i) => {
                  const accent = inviteStatusAccent(i.status);
                  return (
                    <tr key={i.id ?? i.email} className="transition-colors hover:bg-secondary/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
                            <Mail size={14} />
                          </span>
                          <span className="truncate text-sm font-medium text-foreground">{i.email || "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: `hsl(${accent} / 0.1)`,
                            color: `hsl(${accent})`,
                            border: `1px solid hsl(${accent} / 0.25)`,
                          }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${accent})` }} aria-hidden />
                          {i.status}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell">{fmtDate(i.createdAt)}</td>
                      <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">{fmtDate(i.expiresAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={`/admin/invites/${i.id ?? ""}`}
                          className="inline-flex items-center rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
                        >
                          Details
                        </a>
                      </td>
                    </tr>
                  );
                })}
                {invites.length === 0 && (
                  <tr>
                    <td className="px-4 py-16 text-center" colSpan={5}>
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Mail size={28} className="opacity-40" aria-hidden />
                        <p className="text-sm font-medium">Keine Einladungen gefunden.</p>
                        <p className="text-xs">Erstelle eine neue Einladung über den Button oben rechts.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Verfügbare Rollen */}
        {roles && roles.length > 0 && (
          <div className="feature-card p-4">
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.2em] mb-3"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Verfügbare Rollen
            </div>
            <div className="flex flex-wrap gap-2">
              {roles.map((r: any) => (
                <span
                  key={r.name}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    background: "hsl(var(--primary) / 0.08)",
                    color: "hsl(var(--primary))",
                    border: "1px solid hsl(var(--primary) / 0.15)",
                  }}
                  title={`Rank: ${r.rank}`}
                >
                  {r.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
    </RoleGate>
  );
}
