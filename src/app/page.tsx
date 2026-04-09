// src/app/page.tsx
import HomePageContent from "@/components/home/HomePageContent";
import { getSessionInfo } from "@/lib/auth";
import Link from "next/link";

const HERO_FEATURES = ["Schneller Dashboard-Überblick", "Zentrale Verwaltung aller Family-Tools", "Sicherer Zugriff mit Rollen & Rechten"];

export default async function HomePage() {
  const session = await getSessionInfo();

  if (session.signedIn) {
    return <HomePageContent auditTarget="/" />;
  }

  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="soft-surface overflow-hidden rounded-[1.75rem] p-7 shadow-[0_35px_90px_-60px_rgba(30,64,175,0.5)] sm:p-10 md:p-12">
        <p className="mb-4 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
          FamilyHake Private Workspace
        </p>
        <h1 className="max-w-4xl text-3xl font-semibold leading-tight text-slate-900 md:text-5xl">
          Alle Familien-Tools in einem modernen, sicheren und schnellen Portal.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-600 md:text-lg">
          Melde dich an, um direkt auf Dashboard-Widgets, Tool-Quicklinks und den aktuellen Systemstatus zuzugreifen.
        </p>

        <ul className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HERO_FEATURES.map((item) => (
            <li key={item} className="rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center rounded-xl border border-blue-500 bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-[1px] hover:bg-blue-500"
          >
            Anmelden
          </Link>
          <span className="text-sm text-slate-600">Noch kein Zugriff? Wende dich an einen Admin.</span>
        </div>
      </div>
    </section>
  );
}
