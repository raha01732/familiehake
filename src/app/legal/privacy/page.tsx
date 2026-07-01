// src/app/legal/privacy/page.tsx
import type { Metadata } from "next";
import React from "react";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/app-name";

export const metadata: Metadata = {
  title: `Datenschutzerklärung – ${APP_NAME}`,
  description: `Datenschutzerklärung für die private ${APP_NAME}-Plattform.`,
};

const LAST_UPDATED = "1. Juli 2026";

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
            Verantwortlicher im Sinne der DSGVO (Art. 4 Nr. 7) für die Plattform{" "}
            <strong>{APP_NAME}</strong> ist:
          </p>
          <p>
            Ralf Hake
            <br />
            E-Mail:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "hsl(var(--primary))" }}>
              {CONTACT_EMAIL}
            </a>
          </p>
          <p>Bei Fragen zum Datenschutz wenden Sie sich bitte direkt an diese Adresse.</p>
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
            <li>
              <strong>Analyse- & Diagnosedaten (nur mit Einwilligung):</strong> Name, E-Mail-Adresse
              und Nutzungsverhalten über PostHog sowie Bildschirmaufzeichnungen fehlerhafter
              Sitzungen über Sentry Session Replay. Siehe Abschnitt 8.
            </li>
          </ul>
        </Section>

        <Section title="3. Zweck und Rechtsgrundlage der Verarbeitung (Art. 6 DSGVO)">
          <p>Die Daten werden ausschließlich für folgende Zwecke verarbeitet:</p>
          <ul>
            <li>
              <strong>Bereitstellung und Betrieb der Plattform</strong> (Konto-, Nutzungs- und
              Inhaltsdaten) — Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des
              Nutzungsverhältnisses gemäß unseren Nutzungsbedingungen).
            </li>
            <li>
              <strong>Sicherheit, Missbrauchsprävention und Fehlererkennung</strong> (IP-Adresse,
              Audit-Log, Sentry-Basisfehlerdaten) — Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO
              (berechtigtes Interesse am sicheren und stabilen Betrieb einer privaten Plattform).
            </li>
            <li>
              <strong>PostHog-Analytics und Sentry Session Replay</strong> — Rechtsgrundlage:
              Art. 6 Abs. 1 lit. a DSGVO (Einwilligung). Beide sind standardmäßig deaktiviert und
              laufen nur nach ausdrücklicher Zustimmung, siehe Abschnitt 8.
            </li>
          </ul>
          <p>
            Eine Weitergabe an Dritte zu Werbe- oder sonstigen kommerziellen Zwecken findet
            nicht statt. Ihre Daten werden niemals verkauft.
          </p>
        </Section>

        <Section title="4. Datensicherheit und Verschlüsselung">
          <p>
            Besonders sensible Daten — Finanztransaktionen, Journaleinträge und Kalenderdaten —
            werden serverseitig mit dem Verfahren <strong>AES-256-GCM</strong> (Authenticated
            Encryption) verschlüsselt gespeichert. Der Verschlüsselungsschlüssel befindet sich
            ausschließlich in der sicheren Laufzeitumgebung (Vercel) und ist für niemanden — auch
            nicht für den Betreiber — im Klartext einsehbar.
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
            Zur Ausübung Ihrer Rechte wenden Sie sich bitte direkt per E-Mail an{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "hsl(var(--primary))" }}>
              {CONTACT_EMAIL}
            </a>
            . Sie haben zudem das Recht, eine Beschwerde bei der zuständigen
            Datenschutzaufsichtsbehörde einzureichen.
          </p>
        </Section>

        <Section title="8. Cookies, Analytics & Session Replay">
          <p>
            <strong>Technisch notwendig (immer aktiv):</strong> Cookies für die Sitzungsverwaltung
            (Clerk Authentication), ein Locale-Cookie für die Spracheinstellung sowie das Cookie{" "}
            <code>analytics_consent</code>, das Ihre Entscheidung zu den unten beschriebenen
            Analyse-Tools speichert. Diese Cookies erfordern keine Einwilligung
            (§ 25 Abs. 2 Nr. 2 TTDSG).
          </p>
          <p>
            <strong>Nur mit Einwilligung:</strong> Beim ersten Besuch fragen wir per Banner, ob wir
            <strong> PostHog</strong> (Nutzungsstatistiken, Klick-/Seitenaufrufe, verknüpft mit
            Ihrem Namen, Ihrer E-Mail-Adresse und Ihrer Nutzerrolle) und{" "}
            <strong>Sentry Session Replay</strong> (Bildschirmaufzeichnung Ihrer Sitzung bei
            aufgetretenen Fehlern, Eingabefelder werden dabei maskiert) verwenden dürfen. Beide
            sind ohne Zustimmung vollständig deaktiviert; die Plattform funktioniert in jedem Fall
            identisch. Ihre Entscheidung wird als Cookie in Ihrem Browser und — sofern Sie
            angemeldet sind — zusätzlich geräteübergreifend in Ihrem Nutzerkonto gespeichert. Sie
            können sie jederzeit über <strong>Kontoeinstellungen → Analytics</strong> ändern.
          </p>
          <p>
            Unabhängig von dieser Einwilligung erhält Sentry bei jedem Fehlerereignis technische
            Basisdaten (u. a. IP-Adresse) zur Fehlerdiagnose — Rechtsgrundlage ist hier das
            berechtigte Interesse an einem stabilen Betrieb (Abschnitt 3). Für PostHog und Sentry
            gelten im Übrigen die Aufbewahrungsfristen der jeweiligen Anbieter, siehe deren
            Datenschutzerklärungen (Tabelle in Abschnitt 5).
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
      purpose: "Fehlererkennung & Monitoring; Session Replay nur mit Einwilligung",
      location: "USA (SCCs)",
      privacy: "sentry.io/privacy",
    },
    {
      name: "PostHog",
      purpose: "Nutzungsstatistiken mit Nutzeridentität, nur mit Einwilligung",
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
