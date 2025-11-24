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
    <section className="max-w-xl w-full mx-auto">
      <div className="card p-6 flex flex-col gap-4">
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
          Geschützter Bereich
        </h1>
        <p className="text-slate-600 text-sm leading-relaxed">
          Dies ist eine private Plattform. Zugriff auf interne Inhalte ist nur nach Anmeldung möglich. Neue Zugänge werden
          ausschließlich durch Administratoren vergeben.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href={"/sign-in" as any}
            className="flex-1 text-center rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-semibold py-2 text-sm shadow-md transition hover:shadow-lg hover:-translate-y-[1px]"
          >
            Anmelden
          </Link>

          <Link
            href={"/signup-locked" as any}
            className="flex-1 text-center rounded-xl border border-slate-200 text-slate-800 font-semibold py-2 text-sm bg-white/80 shadow-sm transition hover:-translate-y-[1px] hover:border-sky-200 hover:bg-sky-50"
          >
            Zugang anfragen
          </Link>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          Öffentliche Selbstregistrierung ist deaktiviert.
        </p>
      </div>
    </section>
  );
}
