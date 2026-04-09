<!-- /workspace/familiehake/docs/dienstplaner-automation.md -->
# Dienstplaner: Automatisierung & Effizienz-Blueprint

## Was bereits umgesetzt wurde
- **Automatischer Monatsvorschlag** direkt in der Dienstplaner-UI (Button `Auto-Plan erstellen`).
- **Fairness-Heuristik**: Mitarbeitende mit weniger erfüllten Sollstunden werden bevorzugt.
- **Verfügbarkeiten berücksichtigt**:
  - `F`, `K` werden ausgeschlossen.
  - `fr`/`sp` werden mit Präferenz-Penalty bewertet.
  - `fix` wird nur eingeplant, wenn Zeitfenster kompatibel ist.
- **Bedarfslogik**:
  - Tages-Overrides (`dienstplan_position_requirements`) haben Vorrang.
  - Sonst Wochentags-Grundregeln (`dienstplan_weekday_position_requirements`).
  - Sonst Fallback auf numerischen Tagesbedarf mit Schienenrotation.

## Empfohlene nächste Integrationen (kostenbewusst)

### 1) Supabase (kostenfrei startbar)
- **pg_cron Jobs** für nächtliche Planvorbereitung und Reminder.
- **Realtime Channel** für Live-Updates in der Teamansicht.
- **Materialisierte Views** für KPI-Dashboards (Abdeckung, Unter-/Überstunden).

### 2) Clerk (bestehende User-Basis)
- Rollenspezifische UI:
  - Admin: Vollzugriff inkl. Auto-Plan.
  - Mitarbeitende: nur eigene Verfügbarkeiten und Planansicht.
- Optional: Self-Service Wunschschichten pro Monat.

### 3) Vercel
- **Cron Trigger** (`vercel.json`) für automatische Monatsvorplanung (z. B. jeweils am 20. um 03:00 UTC).
- Staging/Preview zur Prüfung des automatisch generierten Plans vor produktiver Freigabe.

### 4) Upstash
- **QStash** für zeitverzögerte Zustellung von Erinnerungen (z. B. 24h vor Schichtbeginn).
- **Redis Caching** für teure Monatsaggregationen und schnelle Dashboard-Ladezeiten.

### 5) Sentry
- Eigene Fehlerkategorie für Planungsaktionen (`auto_generate_month_plan`).
- Alerting bei auffälligen Situationen:
  - Zu wenig verfügbare Mitarbeitende.
  - Mehrere Tage ohne Mindestabdeckung.

## Weitere kostenfreie/low-cost Tools (sinnvoll)
- **Google OR-Tools** (open source): mathematisch optimierte Planung mit harten/weichen Constraints.
- **Cal.com API** oder ICS-Workflow: Schichtübergabe in Kalender ohne Vendor Lock-in.
- **Plausible self-hosted** (optional): datenschutzfreundliche Nutzungsanalyse für Tool-Adoption.

## Roadmap-Vorschlag
1. Aktuelle Heuristik in Produktion nutzen und Telemetrie sammeln.
2. Constraint-Layer ergänzen (max. aufeinanderfolgende Tage, Ruhezeit, Wochenend-Fairness).
3. OR-Tools Solver als optionalen "Optimierungsmodus" hinter Feature Flag ausrollen.
4. Cron-gestützte Vorschlagsgenerierung + Slack/Email-Reminder über Upstash/Vercel.
