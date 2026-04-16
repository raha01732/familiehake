// src/app/legal/terms/page.tsx
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Nutzungsbedingungen – FamilieHake",
  description: "Nutzungsbedingungen für die private FamilieHake-Plattform.",
};

const LAST_UPDATED = "16. April 2026";

export default function TermsPage() {
  return (
    <article>
      <header style={{ marginBottom: "2.5rem" }}>
        <p
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "hsl(var(--muted-foreground))",
            marginBottom: "0.5rem",
          }}
        >
          Rechtliches
        </p>
        <h1
          style={{
            fontSize: "1.9rem",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "hsl(var(--foreground))",
            margin: "0 0 0.5rem",
          }}
        >
          Nutzungsbedingungen
        </h1>
        <p style={{ fontSize: "0.82rem", color: "hsl(var(--muted-foreground))", margin: 0 }}>
          Zuletzt aktualisiert: {LAST_UPDATED}
        </p>
      </header>

      <Prose>
        <Section title="1. Geltungsbereich">
          <p>
            Diese Nutzungsbedingungen gelten für die Nutzung der Plattform <strong>FamilieHake</strong>{" "}
            (nachfolgend „Plattform"), die ausschließlich für den privaten, nicht-kommerziellen
            Gebrauch durch eingeladene Personen (Familie, enge Vertraute) betrieben wird.
          </p>
          <p>
            Mit der Nutzung der Plattform erkennen Sie diese Bedingungen an. Ein Zugang ist nur nach
            ausdrücklicher Einladung durch den Betreiber möglich.
          </p>
        </Section>

        <Section title="2. Zugang und Nutzungsrechte">
          <p>
            Der Zugang zur Plattform erfolgt ausschließlich über ein persönliches Konto, das durch
            den Authentifizierungsdienst <strong>Clerk</strong> verwaltet wird. Ihr Konto ist nicht
            übertragbar. Sie sind verpflichtet, Ihre Zugangsdaten vertraulich zu behandeln.
          </p>
          <p>
            Ihnen wird ein eingeschränktes, widerrufliches Nutzungsrecht für den privaten Gebrauch
            gewährt. Eine kommerzielle Nutzung, Weitergabe oder Vervielfältigung der Plattform oder
            ihrer Inhalte ist nicht gestattet.
          </p>
        </Section>

        <Section title="3. Pflichten der Nutzer">
          <p>Als Nutzer verpflichten Sie sich,</p>
          <ul>
            <li>die Plattform ausschließlich für private, rechtmäßige Zwecke zu verwenden,</li>
            <li>keine Inhalte einzustellen, die Rechte Dritter verletzen,</li>
            <li>keine automatisierten Zugriffe (Bots, Scraper) durchzuführen,</li>
            <li>die Sicherheit der Plattform nicht zu gefährden oder zu umgehen.</li>
          </ul>
        </Section>

        <Section title="4. Datensicherheit und Verschlüsselung">
          <p>
            Sensible persönliche Daten (z. B. Finanzdaten) werden serverseitig mit{" "}
            <strong>AES-256-GCM</strong> verschlüsselt gespeichert. Der Verschlüsselungsschlüssel
            liegt ausschließlich in der sicheren Serverumgebung (Vercel) und ist für niemanden
            außer dem System zugänglich.
          </p>
          <p>
            Jeder Nutzer kann ausschließlich auf seine eigenen Daten zugreifen. Ein
            gegenseitiger Einblick in private Daten anderer Nutzer ist technisch ausgeschlossen.
          </p>
        </Section>

        <Section title="5. Verfügbarkeit und Haftung">
          <p>
            Die Plattform wird ohne Gewährleistung einer bestimmten Verfügbarkeit betrieben.
            Der Betreiber haftet nicht für Datenverlust, Ausfälle oder Schäden, die durch die
            Nutzung der Plattform entstehen, soweit diese nicht auf grober Fahrlässigkeit oder
            Vorsatz beruhen.
          </p>
          <p>
            Die Plattform nutzt Dienste Dritter (Clerk, Supabase, Vercel, Sentry), deren eigene
            Nutzungsbedingungen und Datenschutzrichtlinien ebenfalls gelten.
          </p>
        </Section>

        <Section title="6. Kündigung und Sperrung">
          <p>
            Der Betreiber behält sich vor, Konten ohne Angabe von Gründen zu sperren oder zu
            löschen, insbesondere bei Verstößen gegen diese Nutzungsbedingungen. Auf Wunsch
            werden alle personenbezogenen Daten eines Nutzers vollständig gelöscht.
          </p>
        </Section>

        <Section title="7. Änderungen dieser Bedingungen">
          <p>
            Der Betreiber kann diese Nutzungsbedingungen jederzeit anpassen. Wesentliche Änderungen
            werden den Nutzern über die Plattform mitgeteilt. Die fortgesetzte Nutzung nach
            Inkrafttreten der Änderungen gilt als Zustimmung.
          </p>
        </Section>

        <Section title="8. Anwendbares Recht">
          <p>
            Es gilt das Recht der Bundesrepublik Deutschland. Soweit gesetzlich zulässig, ist
            der Gerichtsstand der Wohnsitz des Betreibers.
          </p>
        </Section>

        <Section title="9. Kontakt">
          <p>
            Bei Fragen zu diesen Nutzungsbedingungen wenden Sie sich bitte direkt an den
            Betreiber der Plattform.
          </p>
        </Section>
      </Prose>
    </article>
  );
}

// ─── Shared prose components ──────────────────────────────────────────────────

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
        color: "hsl(var(--foreground))",
        fontSize: "0.9rem",
        lineHeight: 1.75,
      }}
    >
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2
        style={{
          fontSize: "1rem",
          fontWeight: 700,
          color: "hsl(var(--foreground))",
          marginBottom: "0.65rem",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.65rem",
          color: "hsl(var(--muted-foreground))",
        }}
      >
        {children}
      </div>
    </section>
  );
}
