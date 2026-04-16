import Link from "next/link";
import RoleGate from "@/components/RoleGate";

export const metadata = { title: "Admin" };

export default function AdminHomePage() {
  return (
    <RoleGate routeKey="admin">
      <section className="card p-6 flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))] tracking-tight">Admin</h1>
          <p className="text-[hsl(var(--muted-foreground))] text-sm mt-1">
            Verwaltung, Module und Systemfunktionen.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Benutzerverwaltung */}
          <Link
            href="/admin/users"
            className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 hover:bg-[hsl(var(--secondary))] transition-colors"
          >
            <div className="text-[hsl(var(--foreground))] font-medium">Benutzerverwaltung</div>
            <div className="text-[hsl(var(--muted-foreground))] text-sm mt-1">
              Nutzer suchen, bearbeiten, Rollen setzen, E-Mails verwalten.
            </div>
          </Link>

          {/* Einstellungen (vormals /settings) */}
          <Link
            href="/admin/settings"
            className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 hover:bg-[hsl(var(--secondary))] transition-colors"
          >
            <div className="text-[hsl(var(--foreground))] font-medium">Einstellungen</div>
            <div className="text-[hsl(var(--muted-foreground))] text-sm mt-1">
              Module & Berechtigungen konfigurieren (aus DB).
            </div>
          </Link>

          {/* Monitoring */}
          <Link
            href="/monitoring"
            className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 hover:bg-[hsl(var(--secondary))] transition-colors"
          >
            <div className="text-[hsl(var(--foreground))] font-medium">Monitoring</div>
            <div className="text-[hsl(var(--muted-foreground))] text-sm mt-1">
              Health-Check, Systemstatus & Audit-Logs.
            </div>
          </Link>

          {/* Tools-Hub */}
          <Link
            href="/tools"
            className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 hover:bg-[hsl(var(--secondary))] transition-colors"
          >
            <div className="text-[hsl(var(--foreground))] font-medium">Tools</div>
            <div className="text-[hsl(var(--muted-foreground))] text-sm mt-1">
              Journal, Dateien, Storage-Insights &amp; Systemübersicht.
            </div>
          </Link>

          {/* Activity (Live-Feed) */}
          <Link
            href="/activity"
            className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 hover:bg-[hsl(var(--secondary))] transition-colors"
          >
            <div className="text-[hsl(var(--foreground))] font-medium">Activity (live)</div>
            <div className="text-[hsl(var(--muted-foreground))] text-sm mt-1">
              Echtzeit-Feed aus Audit-Logs.
            </div>
          </Link>
        </div>
      </section>
    </RoleGate>
  );
}
