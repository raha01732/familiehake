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
        <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">
          Geschützter Bereich
        </h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Dies ist eine private Plattform. Zugriff auf interne Inhalte ist nur
          nach Anmeldung möglich. Neue Zugänge werden ausschließlich durch
          Administratoren vergeben.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href={"/sign-in" as any}
            className="flex-1 text-center rounded-xl bg-zinc-100 text-zinc-900 font-medium py-2 text-sm"
          >
            Anmelden
          </Link>

          <Link
            href={"/signup-locked" as any}
            className="flex-1 text-center rounded-xl border border-zinc-600 text-zinc-200 font-medium py-2 text-sm hover:bg-zinc-800/60"
          >
            Zugang anfragen
          </Link>
        </div>

        <p className="text-[11px] text-zinc-600 leading-relaxed">
          Öffentliche Selbstregistrierung ist deaktiviert.
        </p>
      </div>
    </section>
  );
}
