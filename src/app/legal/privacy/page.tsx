// src/app/legal/privacy/page.tsx
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Datenschutzerklärung – FamilieHake",
  description: "Datenschutzerklärung für die private FamilieHake-Plattform.",
};

const LAST_UPDATED = "16. April 2026";

export default function PrivacyPage() {
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
          Datenschutzerklärung
        </h1>
        <p style={{ fontSize: "0.82rem", color: "hsl(var(--muted-foreground))", margin: 0 }}>
          Zuletzt aktualisiert: {LAST_UPDATED}
        </p>
      </header>

      <Prose>
        <Section title="1. Verantwortlicher">
          <p>
            Verantwortlicher im Sinne der DSGVO ist der Betreiber der Plattform{" "}
            <strong>FamilieHake</strong>. Bei Fragen zum Datenschutz wenden Sie sich bitte direkt
            an den Betreiber über die bekannten Kontaktwege.
          </p>
        </Section>

        <Section title="2. Welche Daten werden verarbeitet?">
          <p>Bei der Nutzung der Plattform werden folgende Datenkategorien verarbeitet:</p>
          <ul>
            <li>
              <strong>Kontodaten:</strong> E-Mail-Adresse und ggf. Name, die bei der Registrierung
              über Clerk angegeben werden.
            </li>
            <li>
              <strong>Nutzungsdaten:</strong> Zeitstempel von Logins, durchgeführte Aktionen
              (Audit-Log) zur Nachvollziehbarkeit und Sicherheit.
            </li>
            <li>
              <strong>Inhaltsdaten:</strong> Von Ihnen eingestellte Inhalte (Kalendereinträge,
              Journaleinträge, Finanzdaten u. a.).
            </li>
            <li>
              <strong>Technische Daten:</strong> IP-Adresse, Browser-Informationen (nur für
              Sicherheitszwecke, keine Profilbildung).
            </li>
          </ul>
        </Section>

        <Section title="3. Zweck der Datenverarbeitung">
          <p>Die Daten werden ausschließlich für folgende Zwecke verarbeitet:</p>
          <ul>
            <li>Bereitstellung und Betrieb der Plattform,</li>
            <li>Authentifizierung und Zugriffskontrolle,</li>
            <li>Sicherheit und Missbrauchsprävention,</li>
            <li>Fehlererkennung und -behebung (Sentry).</li>
          </ul>
          <p>
            Eine Weitergabe an Dritte zu Werbe- oder sonstigen kommerziellen Zwecken findet
            nicht statt. Ihre Daten werden niemals verkauft.
          </p>
        </Section>

        <Section title="4. Datensicherheit und Verschlüsselung">
          <p>
            Besonders sensible Daten wie Finanztransaktionen werden serverseitig mit dem
            Verfahren <strong>AES-256-GCM</strong> (Authenticated Encryption) verschlüsselt
            gespeichert. Der Verschlüsselungsschlüssel befindet sich ausschließlich in der
            sicheren Laufzeitumgebung (Vercel) und ist für niemanden — auch nicht für den
            Betreiber — im Klartext einsehbar.
          </p>
          <p>
            Alle Verbindungen zur Plattform erfolgen ausschließlich über{" "}
            <strong>HTTPS/TLS</strong>. Passwörter werden nicht vom Betreiber gespeichert;
            die Authentifizierung erfolgt vollständig über den Drittanbieter Clerk.
          </p>
        </Section>

        <Section title="5. Eingesetzte Drittanbieter">
          <ThirdPartyTable />
        </Section>

        <Section title="6. Speicherdauer">
          <p>
            Personenbezogene Daten werden nur so lange gespeichert, wie es für den jeweiligen
            Zweck erforderlich ist oder gesetzliche Aufbewahrungspflichten bestehen.
          </p>
          <p>
            Audit-Logs werden nach 90 Tagen automatisch aggregiert. Kontodaten werden bei
            Löschung des Kontos vollständig entfernt.
          </p>
        </Section>

        <Section title="7. Ihre Rechte (DSGVO)">
          <p>Sie haben nach der DSGVO folgende Rechte:</p>
          <ul>
            <li>
              <strong>Auskunft</strong> (Art. 15 DSGVO): Sie können jederzeit Auskunft über
              die zu Ihrer Person gespeicherten Daten verlangen.
            </li>
            <li>
              <strong>Berichtigung</strong> (Art. 16 DSGVO): Unrichtige Daten können Sie
              korrigieren lassen.
            </li>
            <li>
              <strong>Löschung</strong> (Art. 17 DSGVO): Sie können die Löschung Ihrer Daten
              verlangen. Wir löschen Ihr Konto und alle zugehörigen Daten auf Anfrage.
            </li>
            <li>
              <strong>Einschränkung</strong> (Art. 18 DSGVO): Sie können die Verarbeitung
              Ihrer Daten einschränken lassen.
            </li>
            <li>
              <strong>Datenübertragbarkeit</strong> (Art. 20 DSGVO): Sie können Ihre Daten
              in einem strukturierten, gängigen Format erhalten.
            </li>
            <li>
              <strong>Widerspruch</strong> (Art. 21 DSGVO): Sie können der Verarbeitung
              Ihrer Daten widersprechen.
            </li>
          </ul>
          <p>
            Zur Ausübung Ihrer Rechte wenden Sie sich bitte direkt an den Betreiber.
            Sie haben zudem das Recht, eine Beschwerde bei der zuständigen
            Datenschutzaufsichtsbehörde einzureichen.
          </p>
        </Section>

        <Section title="8. Cookies und lokaler Speicher">
          <p>
            Die Plattform verwendet technisch notwendige Cookies für die Sitzungsverwaltung
            (Clerk Authentication) sowie ein Locale-Cookie für die Spracheinstellung. Es
            werden keine Tracking- oder Werbe-Cookies eingesetzt.
          </p>
          <p>
            PostHog Analytics ist im Einsatz, um anonymisierte Nutzungsstatistiken zu erheben.
            Es findet keine Verknüpfung mit personenbezogenen Daten statt.
          </p>
        </Section>

        <Section title="9. Änderungen dieser Datenschutzerklärung">
          <p>
            Diese Datenschutzerklärung kann bei Bedarf aktualisiert werden. Das Datum der
            letzten Änderung ist jeweils oben angegeben. Bei wesentlichen Änderungen werden
            die Nutzer über die Plattform informiert.
          </p>
        </Section>
      </Prose>
    </article>
  );
}

// ─── Third-party table ────────────────────────────────────────────────────────

function ThirdPartyTable() {
  const providers = [
    {
      name: "Clerk",
      purpose: "Authentifizierung & Nutzerverwaltung",
      location: "USA (SCCs)",
      privacy: "clerk.com/privacy",
    },
    {
      name: "Supabase",
      purpose: "Datenbank (PostgreSQL)",
      location: "EU (Frankfurt)",
      privacy: "supabase.com/privacy",
    },
    {
      name: "Vercel",
      purpose: "Hosting & Serverless-Funktionen",
      location: "USA/EU",
      privacy: "vercel.com/legal/privacy-policy",
    },
    {
      name: "Sentry",
      purpose: "Fehlererkennung & Monitoring",
      location: "USA (SCCs)",
      privacy: "sentry.io/privacy",
    },
    {
      name: "PostHog",
      purpose: "Anonymisierte Nutzungsstatistiken",
      location: "EU",
      privacy: "posthog.com/privacy",
    },
    {
      name: "Upstash Redis",
      purpose: "Caching & Rate-Limiting",
      location: "EU",
      privacy: "upstash.com/trust/privacy.pdf",
    },
  ];

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.82rem",
        }}
      >
        <thead>
          <tr>
            {["Anbieter", "Zweck", "Server-Standort"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "hsl(var(--muted-foreground))",
                  borderBottom: "1px solid hsl(var(--border))",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {providers.map((p, i) => (
            <tr
              key={p.name}
              style={{
                background: i % 2 === 0 ? "transparent" : "hsl(var(--muted) / 0.4)",
              }}
            >
              <td
                style={{
                  padding: "0.55rem 0.75rem",
                  fontWeight: 600,
                  color: "hsl(var(--foreground))",
                }}
              >
                {p.name}
              </td>
              <td style={{ padding: "0.55rem 0.75rem", color: "hsl(var(--muted-foreground))" }}>
                {p.purpose}
              </td>
              <td style={{ padding: "0.55rem 0.75rem", color: "hsl(var(--muted-foreground))" }}>
                {p.location}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        style={{
          fontSize: "0.75rem",
          color: "hsl(var(--muted-foreground))",
          marginTop: "0.5rem",
        }}
      >
        SCCs = EU-Standardvertragsklauseln gemäß Art. 46 Abs. 2 lit. c DSGVO
      </p>
    </div>
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
