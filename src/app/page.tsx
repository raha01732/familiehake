// src/app/page.tsx
import HomePageContent from "@/components/home/HomePageContent";
import { getSessionInfo } from "@/lib/auth";
import Link from "next/link";

export default async function HomePage() {
  const session = await getSessionInfo();

  if (session.signedIn) {
    return <HomePageContent auditTarget="/" />;
  }

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/70 to-cyan-950/40 p-8 shadow-2xl shadow-cyan-950/30 md:p-12">
        <p className="mb-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-200">
          FamilyHake Private Tools
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
          Alle Familien-Tools an einem Ort
        </h1>
        <p className="mt-5 max-w-3xl text-base text-slate-300 md:text-lg">
          Melde dich an, um direkt auf Dashboard-Widgets, Tool-Quicklinks und den aktuellen Systemstatus zuzugreifen.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center rounded-xl border border-cyan-300/50 bg-cyan-500/20 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:-translate-y-[1px] hover:bg-cyan-500/30"
          >
            Anmelden
          </Link>
          <span className="text-sm text-slate-400">Noch kein Zugriff? Wende dich an einen Admin.</span>
        </div>
      </div>
    </section>
  );
}
