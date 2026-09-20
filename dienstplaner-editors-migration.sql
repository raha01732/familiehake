-- =============================================================================
-- Dienstplaner: konfigurierbare Bearbeitungsrechte für Verfügbarkeiten
-- + Excel-Upload für Dienstpläne (zusätzlich zu PDF)
-- Führe dieses Script in deiner Supabase-Datenbank aus.
-- =============================================================================

-- Einzelne Nicht-Admin-Benutzer, die trotzdem Verfügbarkeiten im Dienstplaner
-- pflegen dürfen. Admins/Superadmins dürfen immer, unabhängig von dieser Liste.
create table if not exists dienstplan_editors (
  user_id text primary key,
  granted_by text,
  created_at timestamptz not null default now()
);

-- Bestehende Kind-Prüfung um 'schedule_xlsx' erweitern (Excel-Upload für
-- Dienstpläne, analog zum bisherigen PDF-Upload).
alter table dienstplan_imports drop constraint if exists dienstplan_imports_kind_check;
alter table dienstplan_imports
  add constraint dienstplan_imports_kind_check
  check (kind in ('schedule_pdf', 'schedule_xlsx', 'availability_xlsx'));
