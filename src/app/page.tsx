// src/app/page.tsx
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function PublicLanding() {
  const user = await currentUser();
  if (user) {
    redirect("/tools");
  }

  return (
    <section className="relative max-w-5xl w-full mx-auto overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-900/50 to-slate-900/80 p-8 shadow-2xl shadow-cyan-500/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(34,211,238,0.14),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.18),transparent_35%),radial-gradient(circle_at_70%_60%,rgba(6,182,212,0.14),transparent_45%)]" aria-hidden />
      <div className="relative grid gap-10 lg:grid-cols-[1.2fr,0.8fr] items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/40 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-100">
            Geschützter Bereich
          </div>
          <h1 className="text-4xl md:text-5xl font-black leading-tight text-white">
            Private Tools für Familie und Freunde – sicher, schnell, vertraulich.
          </h1>
          <p className="text-base md:text-lg leading-relaxed text-slate-200">
            Hier verwaltest du Kalender, Dokumente und gemeinsame Ressourcen ohne Ablenkung. Der Zugang ist exklusiv und wird nur von Administratoren vergeben, damit alles privat bleibt.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={"/sign-in" as any}
              className="flex-1 text-center rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 text-slate-950 font-semibold py-3 text-sm shadow-lg shadow-cyan-500/25 transition hover:-translate-y-[2px] hover:shadow-cyan-400/30"
            >
              Anmelden
            </Link>

            <Link
              href={"/signup-locked" as any}
              className="flex-1 text-center rounded-2xl border border-white/15 text-slate-100 font-semibold py-3 text-sm bg-white/5 shadow-lg shadow-black/30 transition hover:-translate-y-[2px] hover:border-cyan-200/50 hover:bg-cyan-500/10"
            >
              Zugang anfragen
            </Link>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <p>Öffentliche Selbstregistrierung ist deaktiviert. Nur freigeschaltete Accounts können auf Inhalte zugreifen.</p>
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-8 rounded-full bg-gradient-to-br from-cyan-500/10 via-sky-500/15 to-indigo-500/10 blur-3xl" aria-hidden />
          <div className="relative rounded-3xl border border-white/10 bg-slate-950/60 p-6 shadow-2xl shadow-cyan-500/15">
            <div className="flex items-center gap-3 pb-4 border-b border-white/5">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-400/90 to-cyan-500/90 grid place-items-center text-slate-950 font-black">
                24/7
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-300">Immer erreichbar</p>
                <p className="text-sm font-semibold text-white">Stabile Plattform für deine Familie</p>
              </div>
            </div>
            <ul className="mt-4 space-y-3 text-sm text-slate-200">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-5 rounded-full bg-cyan-400" />
                <span>Modernes Interface mit klaren Kontrasten und fließenden Verläufen.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-5 rounded-full bg-indigo-400" />
                <span>Schutz durch Clerk – Anmeldung und Benutzerwechsel funktionieren nahtlos.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-5 rounded-full bg-emerald-400" />
                <span>Klare Trennung von öffentlichen und privaten Bereichen für ruhige Zusammenarbeit.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
