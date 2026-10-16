<!-- /workspace/familiehake/docs/dienstplaner-automation.md -->
# Dienstplaner: Automatisierung & Effizienz-Blueprint

## Was bereits umgesetzt wurde
- **Automatischer Monatsvorschlag** direkt in der Dienstplaner-UI (Button `Auto-Plan erstellen`).
- **Admin-Guard aktiv**: Die Auto-Planung ist serverseitig nur für Admins/Superadmin erlaubt.
- **Fairness-Heuristik**: Mitarbeitende mit weniger erfüllten Sollstunden werden bevorzugt.
- **Verfügbarkeiten berücksichtigt**:
  - `F`, `K` werden ausgeschlossen.
  - `fr`/`sp` werden mit Präferenz-Penalty bewertet.
  - `fix` wird nur eingeplant, wenn Zeitfenster kompatibel ist.
- **Bedarfslogik**:
  - Tages-Overrides (`dienstplan_position_requirements`) haben Vorrang.
  - Sonst Wochentags-Grundregeln (`dienstplan_weekday_position_requirements`).
  - Sonst Fallback auf numerischen Tagesbedarf mit Schienenrotation.
- **Datensicherheit**: Wenn keine Schichten generiert werden können, bleibt der bestehende Monatsplan unverändert.

## Planungs-Engine (Stand Oktober 2026)
`generateAutoPlanSlots` in `utils.ts` arbeitet mit harten und weichen Regeln:
- **Hart:** Freischaltung/Position, F/U/K, feste Zeitfenster, eine Schicht pro Tag (inkl. bestehender), Wochenlimit, 11 h Ruhezeit, max. 6 Tage in Folge.
- **Weich (Score):** Soll-Stunden-Fairness, Früh/Spät-Wunsch, Blockbildung, Überstunden-Strafe.
- **Ablauf:** Engpass-Slots zuerst, dann chronologisch greedy, danach Reparatur offener Slots durch Umbuchung. Der Report nennt je offenem Slot die Sperrgründe.

## Schichtanforderungen (Regeln)
- Eine **Schichtregel** (`dienstplan_shift_rules`) = Position + Von/Bis + Wochentage + Anzahl (+ „nur Projektionsleitung“). Gepflegt in den Einstellungen.
- **Projektion**: Projektionsleitung zählt gleichwertig mit; mit `require_leader` ist sie Pflicht (Engine: `isAllowedForCategory`, Leitungs-Slots werden zuerst verteilt).
- **Einzelne Tage**: Klick auf den Tag im Monatsplan → „Nur für diesen Tag anpassen“ (`dienstplan_position_requirements`) ersetzt an dem Tag alle Wochenregeln; Anzahl 0 = „Tag ohne Bedarf“.
- Die roten Slots werden aus Regeln, Tages-Anpassungen und Sonderveranstaltungen erzeugt (`regenerateSlotsForDates`). Tages-Änderungen bauen den Tag sofort neu auf, Regeländerungen wirken bei „1. Vorplanung“. Manuell angelegte Slots bleiben erhalten.
- Migration: `dienstplaner-shift-rules-migration.sql` (übernimmt bestehende Wochentag-Anforderungen als Regeln).

## Archiv / Trainingsdaten
- Knopf **„Monat ins Archiv übernehmen“** im Monatsplan (nur Admins): schreibt die Schichten des Monats nach `dienstplan_history_shifts` (`src/lib/dienstplaner/archive.ts`). Die KI-Prüfung nutzt diese Daten als Orientierung.
- Wiederholtes Übernehmen desselben Monats ersetzt die frühere Archivierung (Quelle „Monatsplan YYYY-MM“); Zeilen aus PDF-Importen bleiben unverändert.
- Gespeichert wird die Position der Schicht (falls bekannt), sonst die Standardposition der Person.
- **Vorbereitet, nicht aktiv:** Cron `/api/cron/archive-dienstplan` archiviert den Vormonat. Aktivieren: Env `DIENSTPLAN_AUTO_ARCHIVE=true` + Eintrag in `vercel.json` (z. B. `0 4 2 * *`). Vorsicht: ungeprüfte Monate trainieren die KI auf ihren eigenen Ergebnissen.

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
