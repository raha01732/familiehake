// src/app/maintenance/page.tsx
import type { Metadata } from "next";
import { Wrench } from "lucide-react";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/app-name";

export const metadata: Metadata = {
  title: `Wartungsarbeiten – ${APP_NAME}`,
  robots: { index: false, follow: false },
};

// Springt alle 30s zur Startseite statt sich selbst neu zu laden: "/" läuft
// wieder durch die Middleware-Prüfung, die bei aktivem MAINTENANCE_MODE sofort
// hierher zurückleitet - ist der Modus aber aus, landet man automatisch auf
// der echten Startseite statt ewig auf /maintenance zu bleiben.
const AUTO_REFRESH_SECONDS = 30;

export default function MaintenancePage() {
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
      </div>
    </section>
  );
}
