import HomePageContent from "@/components/home/HomePageContent";
import { getSessionInfo } from "@/lib/auth";
import Link from "next/link";
import {
  LayoutDashboard,
  Shield,
  CalendarClock,
  Users,
  Zap,
  Lock,
} from "lucide-react";

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    description: "Konfigurierbare Kacheln für den schnellen Überblick über alles, was zählt.",
  },
  {
    icon: Users,
    title: "Familienplaner",
    description: "Schichten, Termine und Aufgaben gemeinsam im Blick — für alle Mitglieder.",
  },
  {
    icon: Shield,
    title: "Rollen & Rechte",
    description: "Granulares RBAC — jeder sieht exakt das, was für ihn freigegeben ist.",
  },
  {
    icon: CalendarClock,
    title: "Dienstplaner",
    description: "Monatsplanung mit Schichtlogik, Wochenansicht, Überstunden-Tracking und Export.",
  },
  {
    icon: Lock,
    title: "Privat & sicher",
    description: "Einladungsbasierter Zugang, keine öffentliche Registrierung möglich.",
  },
  {
    icon: Zap,
    title: "Blitzschnell",
    description: "Server Components, Redis-Caching und globales Vercel-Deployment.",
  },
];

export default async function HomePage() {
  const session = await getSessionInfo();

  if (session.signedIn) {
    return <HomePageContent auditTarget="/" />;
  }

  return (
    <section className="mx-auto w-full max-w-5xl animate-fade-up">

      {/* Hero */}
      <div
        className="hero-surface overflow-hidden p-8 sm:p-12 md:p-16"
        style={{
          boxShadow:
            "0 60px 120px -40px rgba(var(--accent-glow-1), 0.2), 0 0 0 0.5px hsl(var(--border) / 0.5)",
        }}
      >
        {/* Badge */}
        <div
          className="shimmer-badge mb-7 inline-flex items-center gap-2 rounded-full px-4 py-1.5"
          style={{ border: "1px solid hsl(var(--primary) / 0.3)" }}
        >
          <span
            className="status-dot status-dot-ok"
            style={{ width: 6, height: 6 }}
          />
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "hsl(var(--primary))" }}
          >
            FamilyHake Private Workspace
          </span>
        </div>

        {/* Headline */}
        <h1 className="max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          <span style={{ color: "hsl(var(--foreground))" }}>
            Dein Zuhause für
          </span>
          <br />
          <span className="gradient-text">Family&#8209;Tools.</span>
        </h1>

        <p
          className="mt-6 max-w-2xl text-base leading-relaxed md:text-lg"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          Dienstplan, Kalender, Dateien — alles in einem sicheren, schnellen
          Portal. Nur für eingeladene Mitglieder.
        </p>

        {/* CTA */}
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/sign-in"
            className="brand-button inline-flex w-fit items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold"
          >
            Anmelden
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
          <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Noch kein Zugriff?{" "}
            <span style={{ color: "hsl(var(--foreground))" }}>
              Wende dich an einen Admin.
            </span>
          </p>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <div key={title} className="feature-card flex flex-col gap-3 p-5">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
              style={{
                background: "hsl(var(--primary) / 0.12)",
                color: "hsl(var(--primary))",
              }}
            >
              <Icon size={19} strokeWidth={2} aria-hidden />
            </div>
            <h3
              className="text-sm font-semibold"
              style={{ color: "hsl(var(--foreground))" }}
            >
              {title}
            </h3>
            <p
              className="text-xs leading-relaxed"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              {description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
