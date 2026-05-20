// src/lib/audit-format.ts
//
// Übersetzt rohe Audit-Events (wie sie in der Tabelle `audit_events` stehen)
// in verständlichen deutschen Klartext – primär für die tägliche Status-Mail.
// Bewusst frei von DB-/Framework-Abhängigkeiten, damit es leicht testbar bleibt.

export type AuditRow = {
  ts: string;
  action: string;
  actor_email: string | null;
  target: string | null;
  detail: Record<string, unknown> | null;
};

/**
 * Namens-Nachschlagetabellen, damit aus rohen IDs lesbare Namen werden.
 * Werden vom Aufrufer (Mail-Cron) gebatcht befüllt.
 */
export type AuditNameLookups = {
  employees?: Map<number, string>; // dienstplan_employees.id  -> name
  staff?: Map<number, string>; // cinema_cleaning_staff.id -> name
  shows?: Map<number, string>; // cinema_cleaning_shows.id -> Kurzbezeichnung
};

// ── kleine Detail-Helfer ──────────────────────────────────────────────

function num(detail: Record<string, unknown> | null, key: string): number | null {
  const v = detail?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function str(detail: Record<string, unknown> | null, key: string): string | null {
  const v = detail?.[key];
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

/** "HH:MM:SS" / "HH:MM" -> "HH:MM"; sonst der Rohwert. */
function hhmm(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return value;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** "YYYY-MM-DD" -> "DD.MM.YYYY"; sonst der Rohwert. */
export function formatDateDe(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return value;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** "YYYY-MM" -> "MM/YYYY"; sonst der Rohwert. */
function formatMonthDe(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})$/);
  if (!m) return value;
  return `${m[2]}/${m[1]}`;
}

function timeRange(start: string | null, end: string | null): string | null {
  const s = hhmm(start);
  const e = hhmm(end);
  if (s && e) return `${s}–${e}`;
  if (s) return `ab ${s}`;
  if (e) return `bis ${e}`;
  return null;
}

function employeeName(detail: Record<string, unknown> | null, lookups: AuditNameLookups): string {
  const fromDetail = str(detail, "employeeName") ?? str(detail, "name");
  if (fromDetail) return fromDetail;
  const id = num(detail, "employeeId");
  if (id != null) return lookups.employees?.get(id) ?? `Mitarbeiter #${id}`;
  return "ein Mitarbeiter";
}

/** Mitarbeitername anhand eines konkreten ID-Detail-Feldes (z. B. fromEmployeeId). */
function employeeNameById(
  detail: Record<string, unknown> | null,
  key: string,
  lookups: AuditNameLookups
): string {
  const id = num(detail, key);
  if (id != null) return lookups.employees?.get(id) ?? `Mitarbeiter #${id}`;
  return "ein Mitarbeiter";
}

function staffName(detail: Record<string, unknown> | null, lookups: AuditNameLookups): string {
  const fromDetail = str(detail, "staffName") ?? str(detail, "name");
  if (fromDetail) return fromDetail;
  const id = num(detail, "staffId");
  if (id != null) return lookups.staff?.get(id) ?? `Reinigungskraft #${id}`;
  return "eine Reinigungskraft";
}

function showLabel(detail: Record<string, unknown> | null, lookups: AuditNameLookups): string {
  const movie = str(detail, "movieTitle");
  const date = formatDateDe(str(detail, "date") ?? str(detail, "showDate"));
  const hall = num(detail, "hallNumber");
  const parts: string[] = [];
  if (movie) parts.push(`„${movie}“`);
  const meta: string[] = [];
  if (hall != null) meta.push(`Saal ${hall}`);
  if (date) meta.push(date);
  if (meta.length) parts.push(`(${meta.join(", ")})`);
  if (parts.length) return parts.join(" ");
  const id = num(detail, "showId");
  if (id != null) return lookups.shows?.get(id) ?? `Vorstellung #${id}`;
  return "eine Vorstellung";
}

const CREATED = "angelegt";
const UPDATED = "geändert";
function modeVerb(detail: Record<string, unknown> | null, fallback = UPDATED): string {
  const mode = str(detail, "mode");
  if (mode === "create") return CREATED;
  if (mode === "update") return UPDATED;
  return fallback;
}

// ── Gruppen-Labels (für die kompakte Zusammenfassung) ─────────────────

const ACTION_LABELS: Record<string, string> = {
  // Auth & Access
  login_success: "Anmeldung",
  access_denied: "Zugriff verweigert",
  role_change: "Rollenänderung",
  email_verification_sent: "E-Mail-Verifizierung gesendet",
  primary_email_set: "Primäre E-Mail gesetzt",
  email_add: "E-Mail hinzugefügt",
  email_deleted: "E-Mail gelöscht",
  // Files / Folders
  file_upload: "Datei hochgeladen",
  file_delete: "Datei gelöscht",
  file_restore: "Datei wiederhergestellt",
  file_move: "Datei verschoben",
  file_download: "Datei heruntergeladen",
  file_share_create: "Datei-Freigabe erstellt",
  file_share_revoke: "Datei-Freigabe widerrufen",
  file_share_access: "Freigabe-Zugriff",
  file_share_access_denied: "Freigabe-Zugriff verweigert",
  folder_create: "Ordner erstellt",
  folder_rename: "Ordner umbenannt",
  folder_move: "Ordner verschoben",
  folder_delete: "Ordner gelöscht",
  folder_restore: "Ordner wiederhergestellt",
  // Journal / Dashboard
  journal_create: "Journal-Eintrag erstellt",
  journal_update: "Journal-Eintrag geändert",
  journal_delete: "Journal-Eintrag gelöscht",
  dashboard_welcome_update: "Willkommenstext geändert",
  theme_preference_update: "Theme geändert",
  tool_maintenance_enabled: "Wartungsmodus geschaltet",
  // Finance / Vault / Tasks / Nutrition
  finance_transaction_create: "Finanz-Buchung erstellt",
  finance_transaction_update: "Finanz-Buchung geändert",
  finance_transaction_delete: "Finanz-Buchung gelöscht",
  vault_entry_create: "Tresor-Eintrag erstellt",
  vault_entry_update: "Tresor-Eintrag geändert",
  vault_entry_delete: "Tresor-Eintrag gelöscht",
  task_create: "Aufgabe erstellt",
  task_update: "Aufgabe geändert",
  task_delete: "Aufgabe gelöscht",
  nutrition_favorite_create: "Ernährungs-Favorit erstellt",
  nutrition_favorite_delete: "Ernährungs-Favorit gelöscht",
  // Dienstplaner
  dienstplan_shift_save: "Schicht gespeichert",
  dienstplan_shift_delete: "Schicht gelöscht",
  dienstplan_shift_move: "Schicht verschoben",
  dienstplan_shift_update: "Schicht-Details geändert",
  dienstplan_week_copy: "Woche kopiert",
  dienstplan_month_clear: "Monat geleert",
  dienstplan_month_autoplan: "Monat automatisch geplant",
  dienstplan_employee_create: "Mitarbeiter angelegt",
  dienstplan_employee_update: "Mitarbeiter geändert",
  dienstplan_employee_delete: "Mitarbeiter gelöscht",
  dienstplan_availability_save: "Verfügbarkeit gespeichert",
  dienstplan_availability_clear: "Verfügbarkeiten gelöscht",
  dienstplan_pause_rule_save: "Pausenregel gespeichert",
  dienstplan_pause_rule_delete: "Pausenregel gelöscht",
  dienstplan_requirement_save: "Bedarf gespeichert",
  dienstplan_requirement_delete: "Bedarf gelöscht",
  dienstplan_shift_track_save: "Schiene gespeichert",
  dienstplan_shift_track_delete: "Schiene gelöscht",
  dienstplan_special_event_save: "Sondertermin gespeichert",
  dienstplan_special_event_delete: "Sondertermin gelöscht",
  dienstplan_planned_slot_create: "Geplanter Slot angelegt",
  dienstplan_planned_slot_delete: "Geplanter Slot gelöscht",
  dienstplan_planned_slot_assign: "Slot zugewiesen",
  dienstplan_preplan_build: "Vorplanung erstellt",
  dienstplan_planned_slots_autofill: "Slots automatisch befüllt",
  dienstplan_planned_slots_ai_fill: "Slots per KI befüllt",
  dienstplan_settings_update: "Dienstplaner-Einstellung geändert",
  // Auslassplanung
  auslass_hall_create: "Saal angelegt",
  auslass_hall_update: "Saal geändert",
  auslass_hall_delete: "Saal gelöscht",
  auslass_staff_create: "Reinigungskraft angelegt",
  auslass_staff_update: "Reinigungskraft geändert",
  auslass_staff_delete: "Reinigungskraft gelöscht",
  auslass_staff_move: "Reinigungskraft umsortiert",
  auslass_show_create: "Vorstellung angelegt",
  auslass_show_update: "Vorstellung geändert",
  auslass_show_delete: "Vorstellung gelöscht",
  auslass_shows_delete_all: "Alle Vorstellungen gelöscht",
  auslass_feedback_save: "Feedback gespeichert",
  auslass_feedback_archive: "Feedback archiviert",
  auslass_show_plan: "Vorstellung geplant",
  auslass_shows_plan_many: "Mehrere Vorstellungen geplant",
  auslass_assignments_set: "Zuweisungen gesetzt",
  auslass_assignment_remove: "Zuweisung entfernt",
  auslass_assignments_clear: "Zuweisungen gelöscht",
  auslass_archive_clear: "Archiv geleert",
  auslass_shows_import_fup: "Vorstellungen aus FÜP importiert",
  auslass_attendees_update: "Besucherzahlen aktualisiert",
  auslass_shows_lock: "Vorstellungen gesperrt",
  auslass_shows_unlock: "Vorstellungen entsperrt",
  auslass_early_leave_set: "Früher-Schluss gesetzt",
  auslass_rutsche_plan: "Rutsche geplant",
  system_message_send: "Systemnachricht gesendet",
  system_message_schedule: "Systemnachricht geplant",
  system_message_draft_save: "Systemnachricht-Entwurf gespeichert",
  system_message_delete: "Systemnachricht gelöscht",
  system_report_resend: "Systemreport erneut gesendet",
  critical_error: "Kritischer Fehler",
};

/** Prettify einer unbekannten Action: "foo_bar_baz" -> "Foo bar baz". */
function prettifyAction(action: string): string {
  const s = action.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? prettifyAction(action);
}

// ── Klartext-Beschreibung pro Event ───────────────────────────────────

/**
 * Liefert einen verständlichen deutschen Satz zu einem Audit-Event –
 * OHNE Zeit und Akteur (die rendert der Aufrufer drumherum).
 */
export function describeAuditEvent(row: AuditRow, lookups: AuditNameLookups = {}): string {
  const d = row.detail;

  switch (row.action) {
    // ── Dienstplaner ──────────────────────────────────────────────
    case "dienstplan_shift_save": {
      const range = timeRange(str(d, "start"), str(d, "end"));
      const date = formatDateDe(str(d, "date"));
      const verb = modeVerb(d);
      return `Schicht für ${employeeName(d, lookups)}${date ? ` am ${date}` : ""}${range ? ` (${range})` : ""} ${verb}`;
    }
    case "dienstplan_shift_delete": {
      const date = formatDateDe(str(d, "date"));
      return `Schicht für ${employeeName(d, lookups)}${date ? ` am ${date}` : ""} gelöscht`;
    }
    case "dienstplan_shift_move": {
      const date = formatDateDe(str(d, "date"));
      const from = employeeNameById(d, "fromEmployeeId", lookups);
      const to = employeeNameById(d, "toEmployeeId", lookups);
      return `Schicht${date ? ` am ${date}` : ""} von ${from} zu ${to} verschoben`;
    }
    case "dienstplan_shift_update": {
      const date = formatDateDe(str(d, "date"));
      return `Schicht-Details für ${employeeName(d, lookups)}${date ? ` am ${date}` : ""} geändert`;
    }
    case "dienstplan_week_copy": {
      const count = num(d, "count");
      const from = formatDateDe(str(d, "fromWeekStart"));
      const to = formatDateDe(str(d, "toWeekStart"));
      return `Woche kopiert${from && to ? ` (${from} → ${to})` : ""}${count != null ? `: ${count} Schichten` : ""}`;
    }
    case "dienstplan_month_clear": {
      const month = formatMonthDe(str(d, "month"));
      return `Monat ${month ?? ""} geleert – alle Schichten gelöscht`.replace("  ", " ");
    }
    case "dienstplan_month_autoplan": {
      const month = formatMonthDe(str(d, "month"));
      const created = num(d, "created") ?? num(d, "count");
      return `Monat ${month ?? ""} automatisch geplant${created != null ? ` (${created} Schichten)` : ""}`.replace("  ", " ");
    }
    case "dienstplan_employee_create":
      return `Mitarbeiter ${employeeName(d, lookups)} angelegt`;
    case "dienstplan_employee_update":
      return `Mitarbeiter ${employeeName(d, lookups)} geändert`;
    case "dienstplan_employee_delete":
      return `Mitarbeiter ${employeeName(d, lookups)} gelöscht`;
    case "dienstplan_availability_save": {
      const date = formatDateDe(str(d, "date"));
      const month = formatMonthDe(str(d, "month"));
      const when = date ?? month;
      return `Verfügbarkeit für ${employeeName(d, lookups)}${when ? ` (${when})` : ""} gespeichert`;
    }
    case "dienstplan_availability_clear": {
      const month = formatMonthDe(str(d, "month"));
      return `Verfügbarkeiten${month ? ` für ${month}` : ""} gelöscht`;
    }
    case "dienstplan_pause_rule_save":
      return `Pausenregel ${modeVerb(d)}`;
    case "dienstplan_pause_rule_delete":
      return "Pausenregel gelöscht";
    case "dienstplan_requirement_save": {
      const kind = str(d, "kind");
      const date = formatDateDe(str(d, "date"));
      const detailSuffix = date ? ` für ${date}` : kind ? ` (${kind})` : "";
      return `Personalbedarf gespeichert${detailSuffix}`;
    }
    case "dienstplan_requirement_delete": {
      const date = formatDateDe(str(d, "date"));
      return `Personalbedarf gelöscht${date ? ` für ${date}` : ""}`;
    }
    case "dienstplan_shift_track_save": {
      const label = str(d, "label") ?? str(d, "trackKey");
      return `Schiene${label ? ` „${label}“` : ""} ${modeVerb(d)}`;
    }
    case "dienstplan_shift_track_delete": {
      const label = str(d, "label") ?? str(d, "trackKey");
      return `Schiene${label ? ` „${label}“` : ""} gelöscht`;
    }
    case "dienstplan_special_event_save": {
      const title = str(d, "title");
      return `Sondertermin${title ? ` „${title}“` : ""} ${modeVerb(d)}`;
    }
    case "dienstplan_special_event_delete": {
      const title = str(d, "title");
      return `Sondertermin${title ? ` „${title}“` : ""} gelöscht`;
    }
    case "dienstplan_planned_slot_create": {
      const date = formatDateDe(str(d, "date"));
      const range = timeRange(str(d, "start"), str(d, "end"));
      const position = str(d, "position");
      return `Geplanter Slot${date ? ` am ${date}` : ""}${range ? ` (${range})` : ""}${position ? ` – ${position}` : ""} angelegt`;
    }
    case "dienstplan_planned_slot_delete":
      return "Geplanter Slot gelöscht";
    case "dienstplan_planned_slot_assign": {
      const date = formatDateDe(str(d, "date"));
      return `Geplanter Slot${date ? ` am ${date}` : ""} an ${employeeName(d, lookups)} zugewiesen`;
    }
    case "dienstplan_preplan_build": {
      const month = formatMonthDe(str(d, "month"));
      const created = num(d, "created");
      return `Vorplanung${month ? ` für ${month}` : ""} erstellt${created != null ? ` (${created} Slots)` : ""}`;
    }
    case "dienstplan_planned_slots_autofill": {
      const filled = num(d, "filled") ?? num(d, "count");
      return `Geplante Slots automatisch befüllt${filled != null ? ` (${filled})` : ""}`;
    }
    case "dienstplan_planned_slots_ai_fill": {
      const filled = num(d, "filled") ?? num(d, "count");
      return `Geplante Slots per KI befüllt${filled != null ? ` (${filled})` : ""}`;
    }
    case "dienstplan_settings_update": {
      const setting = str(d, "setting");
      return `Dienstplaner-Einstellung geändert${setting ? ` (${setting})` : ""}`;
    }

    // ── Auslassplanung ────────────────────────────────────────────
    case "auslass_hall_create": {
      const n = num(d, "hallNumber");
      return `Saal${n != null ? ` ${n}` : ""} angelegt`;
    }
    case "auslass_hall_update": {
      const n = num(d, "hallNumber");
      return `Saal${n != null ? ` ${n}` : ""} geändert`;
    }
    case "auslass_hall_delete": {
      const n = num(d, "hallNumber");
      return `Saal${n != null ? ` ${n}` : ""} gelöscht`;
    }
    case "auslass_staff_create":
      return `Reinigungskraft ${staffName(d, lookups)} angelegt`;
    case "auslass_staff_update":
      return `Reinigungskraft ${staffName(d, lookups)} geändert`;
    case "auslass_staff_delete":
      return `Reinigungskraft ${staffName(d, lookups)} gelöscht`;
    case "auslass_staff_move": {
      const dir = str(d, "direction");
      const where = dir === "up" ? "nach oben" : dir === "down" ? "nach unten" : "";
      return `Reinigungskraft ${staffName(d, lookups)} umsortiert${where ? ` (${where})` : ""}`;
    }
    case "auslass_show_create":
      return `Vorstellung ${showLabel(d, lookups)} angelegt`;
    case "auslass_show_update":
      return `Vorstellung ${showLabel(d, lookups)} geändert`;
    case "auslass_show_delete":
      return `Vorstellung ${showLabel(d, lookups)} gelöscht`;
    case "auslass_shows_delete_all": {
      const deleted = num(d, "deleted") ?? num(d, "count");
      return `Alle Vorstellungen gelöscht${deleted != null ? ` (${deleted})` : ""}`;
    }
    case "auslass_feedback_save":
      return `Feedback zu ${showLabel(d, lookups)} gespeichert`;
    case "auslass_feedback_archive": {
      const count = num(d, "count");
      return `Feedback archiviert${count != null ? ` (${count})` : ""}`;
    }
    case "auslass_show_plan": {
      const assigned = num(d, "assigned") ?? num(d, "count");
      return `Vorstellung ${showLabel(d, lookups)} geplant${assigned != null ? ` (${assigned} Kräfte)` : ""}`;
    }
    case "auslass_shows_plan_many": {
      const planned = num(d, "planned") ?? num(d, "count");
      return `Mehrere Vorstellungen geplant${planned != null ? ` (${planned})` : ""}`;
    }
    case "auslass_assignments_set": {
      const count = num(d, "count");
      return `Zuweisungen für ${showLabel(d, lookups)} gesetzt${count != null ? ` (${count})` : ""}`;
    }
    case "auslass_assignment_remove":
      return `Zuweisung von ${staffName(d, lookups)} bei ${showLabel(d, lookups)} entfernt`;
    case "auslass_assignments_clear": {
      const count = num(d, "count");
      return `Zuweisungen gelöscht${count != null ? ` (${count})` : ""}`;
    }
    case "auslass_archive_clear": {
      const count = num(d, "count");
      return `Archiv geleert${count != null ? ` (${count})` : ""}`;
    }
    case "auslass_shows_import_fup": {
      const created = num(d, "created") ?? num(d, "count");
      return `Vorstellungen aus FÜP importiert${created != null ? ` (${created})` : ""}`;
    }
    case "auslass_attendees_update": {
      const updated = num(d, "updated") ?? num(d, "count");
      return `Besucherzahlen aktualisiert${updated != null ? ` (${updated})` : ""}`;
    }
    case "auslass_shows_lock": {
      const count = num(d, "count");
      return `Vorstellungen gesperrt${count != null ? ` (${count})` : ""}`;
    }
    case "auslass_shows_unlock": {
      const count = num(d, "count");
      return `Vorstellungen entsperrt${count != null ? ` (${count})` : ""}`;
    }
    case "auslass_early_leave_set":
      return `Früher-Schluss für ${staffName(d, lookups)} bei ${showLabel(d, lookups)} gesetzt`;
    case "auslass_rutsche_plan": {
      const planned = num(d, "planned") ?? num(d, "count");
      return `Rutsche geplant${planned != null ? ` (${planned} Vorstellungen)` : ""}`;
    }

    // ── Systemnachrichten ─────────────────────────────────────────
    case "system_message_send": {
      const title = str(d, "title");
      const recipients = num(d, "recipients") ?? num(d, "recipientCount");
      const channels = str(d, "channels");
      return `Systemnachricht${title ? ` „${title}“` : ""} gesendet${recipients != null ? ` an ${recipients} Empfänger` : ""}${channels ? ` (${channels})` : ""}`;
    }
    case "system_message_schedule": {
      const title = str(d, "title");
      const when = str(d, "scheduledAt");
      return `Systemnachricht${title ? ` „${title}“` : ""} geplant${when ? ` für ${when}` : ""}`;
    }
    case "system_message_draft_save": {
      const title = str(d, "title");
      return `Systemnachricht-Entwurf${title ? ` „${title}“` : ""} gespeichert`;
    }
    case "system_message_delete": {
      const title = str(d, "title");
      return `Systemnachricht${title ? ` „${title}“` : ""} gelöscht`;
    }
    case "system_report_resend": {
      const recipients = num(d, "recipients") ?? num(d, "recipientCount");
      return `Systemreport (Cron-Status) erneut gesendet${recipients != null ? ` an ${recipients} Empfänger` : ""}`;
    }

    // ── Fallback für alle übrigen (bestehenden) Actions ───────────
    default: {
      const label = auditActionLabel(row.action);
      return row.target ? `${label} – ${row.target}` : label;
    }
  }
}

// ── Zusammenfassung (kompakte Zähler) ─────────────────────────────────

export type AuditSummaryEntry = { label: string; count: number };

/**
 * Zählt Events pro Action und liefert die Labels absteigend nach Häufigkeit
 * (bei Gleichstand alphabetisch).
 */
export function summarizeAuditEvents(rows: AuditRow[]): AuditSummaryEntry[] {
  const byLabel = new Map<string, number>();
  for (const row of rows) {
    const label = auditActionLabel(row.action);
    byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
  }
  return Array.from(byLabel.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label)));
}
