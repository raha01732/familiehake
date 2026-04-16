import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import {
  Users, Settings2, Activity, BarChart2,
  Monitor, ShieldCheck, type LucideIcon,
} from "lucide-react";

export const metadata = { title: "Admin" };

const ADMIN_CARDS: {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  accent?: boolean;
}[] = [
  {
    href: "/admin/users",
    label: "Benutzerverwaltung",
    description: "Nutzer suchen, bearbeiten, Rollen setzen, E-Mails verwalten.",
    icon: Users,
  },
  {
    href: "/admin/settings",
    label: "Berechtigungen",
    description: "Module & Zugriffsmatrix konfigurieren (aus DB).",
    icon: Settings2,
  },
  {
    href: "/monitoring",
    label: "Monitoring",
    description: "Health-Check, Systemstatus & Cron-Job-Logs.",
    icon: Monitor,
  },
  {
    href: "/tools",
    label: "Tools",
    description: "Journal, Dateien, Storage-Insights & Systemübersicht.",
    icon: Activity,
  },
  {
    href: "/activity",
    label: "Activity",
    description: "Echtzeit-Feed aus Audit-Logs.",
    icon: BarChart2,
  },
];

export default function AdminHomePage() {
  return (
    <RoleGate routeKey="admin">
      <section className="flex flex-col gap-8 animate-fade-up">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <div
            className="shimmer-badge inline-flex w-fit items-center gap-2 rounded-full px-3 py-1"
            style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
          >
            <ShieldCheck size={11} style={{ color: "hsl(var(--primary))" }} aria-hidden />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: "hsl(var(--primary))" }}
            >
              Admin-Bereich
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="gradient-text">Verwaltung</span>
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Systemfunktionen, Module und Benutzerrechte zentral verwalten.
            </p>
          </div>
        </div>

        {/* Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_CARDS.map(({ href, label, description, icon: Icon }) => (
            <Link key={href} href={href} className="feature-card group flex flex-col gap-4 p-5">
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110"
                style={{
                  background: "hsl(var(--primary) / 0.12)",
                  color: "hsl(var(--primary))",
                }}
              >
                <Icon size={19} strokeWidth={2} aria-hidden />
              </div>
              <div>
                <h3
                  className="text-sm font-semibold group-hover:underline"
                  style={{ color: "hsl(var(--foreground))" }}
                >
                  {label}
                </h3>
                <p
                  className="mt-1 text-xs leading-relaxed"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  {description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </RoleGate>
  );
}
