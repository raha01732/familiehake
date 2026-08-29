// src/app/maintenance/page.tsx
import type { Metadata } from "next";
import { Wrench, ShieldCheck, LogIn } from "lucide-react";
import Link from "next/link";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/app-name";
import { getSessionInfo } from "@/lib/auth";
import { getMaintenanceStatus, setMaintenanceRedisFlag } from "@/lib/maintenance";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: `Wartungsarbeiten – ${APP_NAME}`,
  robots: { index: false, follow: false },
};

// Springt alle 30s zur Startseite statt sich selbst neu zu laden: "/" läuft
// wieder durch die Middleware-Prüfung, die bei aktivem MAINTENANCE_MODE sofort
// hierher zurückleitet - ist der Modus aber aus, landet man automatisch auf
// der echten Startseite statt ewig auf /maintenance zu bleiben.
const AUTO_REFRESH_SECONDS = 30;

async function disableSiteMaintenanceAction(): Promise<void> {
  "use server";
  const session = await getSessionInfo();
  const isAdmin =
    session.signedIn && (session.isSuperAdmin || session.roles.some((r) => r.name === "admin"));
  if (!isAdmin) {
    redirect("/maintenance");
  }

  await setMaintenanceRedisFlag(false);

  const actor = await currentUser();
  await logAudit({
    action: "maintenance_mode_toggle",
    actorUserId: actor?.id ?? null,
    actorEmail: actor?.emailAddresses?.[0]?.emailAddress ?? null,
    target: "site",
    detail: { enabled: false, source: "maintenance_page" },
  });

  revalidatePath("/maintenance");
  redirect("/");
}

export default async function MaintenancePage() {
  const session = await getSessionInfo();
  const isAdmin =
    session.signedIn && (session.isSuperAdmin || session.roles.some((r) => r.name === "admin"));
  const maintenanceStatus = isAdmin ? await getMaintenanceStatus() : null;

  return (
    <section className="flex min-h-[70vh] items-center justify-center px-4">
      <meta httpEquiv="refresh" content={`${AUTO_REFRESH_SECONDS};url=/`} />
      <div
        className="card animate-fade-up flex max-w-md flex-col items-center gap-4 p-8 text-center"
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "hsl(var(--primary) / 0.12)" }}
          aria-hidden
        >
          <Wrench size={26} style={{ color: "hsl(var(--primary))" }} />
        </div>

        <h1
          className="text-xl font-semibold"
          style={{ color: "hsl(var(--foreground))" }}
        >
          Kurze Pause für Wartungsarbeiten
        </h1>

        <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          {APP_NAME} wird gerade aktualisiert. Das dauert normalerweise nur ein paar Minuten –
          diese Seite lädt sich automatisch neu, sobald es weitergeht.
        </p>

        <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
          Dringend? Schreib an{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "hsl(var(--primary))" }}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>

        {!session.signedIn && (
          <Link
            href="/sign-in?redirect_url=/maintenance"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
          >
            <LogIn size={13} aria-hidden />
            Als Admin anmelden
          </Link>
        )}

        {isAdmin && maintenanceStatus && (
          <div
            className="mt-1 flex w-full flex-col items-center gap-2 rounded-xl border p-4"
            style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--secondary))" }}
          >
            <div
              className="flex items-center gap-1.5 text-xs font-semibold"
              style={{ color: "hsl(var(--foreground))" }}
            >
              <ShieldCheck size={14} style={{ color: "hsl(var(--primary))" }} aria-hidden />
              Als Admin angemeldet
            </div>

            {maintenanceStatus.envFlag ? (
              <p className="text-[11px]" style={{ color: "hsl(27 96% 45%)" }}>
                Die Umgebungsvariable <span className="font-mono">MAINTENANCE_MODE</span> erzwingt den
                Wartungsmodus zusätzlich – die entfernst du nur in Vercel + Redeploy, hier nicht
                abschaltbar.
              </p>
            ) : (
              <form action={disableSiteMaintenanceAction}>
                <button
                  className="brand-button inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold"
                >
                  Wartungsmodus jetzt deaktivieren
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
