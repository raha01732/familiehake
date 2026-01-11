// src/app/page.tsx
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";

export default async function PublicLanding() {
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const isClerkEnabled = Boolean(clerkPublishableKey);
  const user = isClerkEnabled ? await currentUser() : null;

  if (!user) {
    return (
      <section className="relative mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/90 via-slate-900/70 to-slate-950/90 p-8 shadow-2xl shadow-cyan-500/10">
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.2),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.2),transparent_35%),radial-gradient(circle_at_60%_80%,rgba(6,182,212,0.15),transparent_45%)]"
          aria-hidden
        />
        <div className="relative space-y-6">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400/90 to-sky-500/90 text-base font-black text-slate-950">
              FH
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-300">Privater Bereich</p>
              <h1 className="text-2xl font-semibold text-white">Bitte zuerst anmelden</h1>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-slate-200">
            Dieser Auftritt ist geschützt. Nach dem Login wirst du automatisch zur Startseite
            weitergeleitet.
          </p>
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-xl shadow-cyan-500/10 backdrop-blur">
            {isClerkEnabled ? (
              <SignIn
                appearance={{
                  elements: {
                    formButtonPrimary:
                      "bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 text-slate-950 hover:from-cyan-300 hover:to-indigo-400 rounded-xl text-sm font-semibold",
                    card: "bg-transparent shadow-none border-0 p-0",
                    headerTitle: "hidden",
                    headerSubtitle: "hidden",
                  },
                }}
                redirectUrl="/"
              />
            ) : (
              <div className="text-sm text-slate-200">
                Die Anmeldung ist aktuell deaktiviert, weil die Clerk-Umgebung nicht konfiguriert
                ist.
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative max-w-5xl w-full mx-auto overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-900/50 to-slate-900/80 p-8 shadow-2xl shadow-cyan-500/10">
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(34,211,238,0.14),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.18),transparent_35%),radial-gradient(circle_at_70%_60%,rgba(6,182,212,0.14),transparent_45%)]"
        aria-hidden
      />
      <div className="relative grid gap-10 lg:grid-cols-[1.2fr,0.8fr] items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/40 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-100">
            Geschützter Bereich
          </div>
          <h1 className="text-4xl md:text-5xl font-black leading-tight text-white">
            Webseiten-Projekt von Ralf Hake.
          </h1>
          <p className="text-base md:text-lg leading-relaxed text-slate-200">
            Zugang und Zugriff auf Daten nur privat, keine Registrierungsmöglichkeit.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={user ? ("/dashboard" as any) : ("/sign-in" as any)}
              className="flex-1 text-center rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 text-slate-950 font-semibold py-3 text-sm shadow-lg shadow-cyan-500/25 transition hover:-translate-y-[2px] hover:shadow-cyan-400/30"
            >
              {user ? "Zum Dashboard" : "Anmelden"}
            </Link>

            <Link
              href={"/signup-locked" as any}
              className="flex-1 text-center rounded-2xl border border-white/15 text-slate-100 font-semibold py-3 text-sm bg-white/5 shadow-lg shadow-black/30 transition hover:-translate-y-[2px] hover:border-cyan-200/50 hover:bg-cyan-500/10"
            >
              Zugang anfragen
            </Link>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 text-xs text-slate-300">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <p>Öffentliche Selbstregistrierung ist deaktiviert.</p>
            </div>
            {user && (
              <span className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-400/50 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-100 shadow-inner shadow-emerald-900/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Eingeloggt als {user.emailAddresses?.[0]?.emailAddress ?? user.firstName ?? "Nutzer"}
              </span>
            )}
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
                <p className="text-sm font-semibold text-white">Webseiten-Projekt</p>
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
