-- =============================================================================
-- Dienstplaner: Planungsregeln (Auto-Plan)
-- Globale Standardwerte für Wochenlimit, Ruhezeit und Arbeitstage in Folge.
-- Idempotent: kann gefahrlos mehrfach ausgeführt werden (neue UND bestehende DB).
-- Führe dieses Script in deiner Supabase-Datenbank (SQL Editor) aus.
-- =============================================================================

create table if not exists dienstplan_planning_rules (
  -- Singleton: es gibt genau eine Zeile (id ist immer true)
  id boolean primary key default true check (id),
  max_shifts_per_week smallint not null default 6
    check (max_shifts_per_week between 1 and 7),
  min_rest_hours numeric(4,1) not null default 11
    check (min_rest_hours between 0 and 24),
  max_consecutive_days smallint not null default 6
    check (max_consecutive_days between 1 and 14),
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into dienstplan_planning_rules (id)
values (true)
on conflict (id) do nothing;

-- Falls die Tabelle in einer älteren Variante ohne einzelne Spalten existiert:
alter table dienstplan_planning_rules
  add column if not exists max_shifts_per_week smallint not null default 6,
  add column if not exists min_rest_hours numeric(4,1) not null default 11,
  add column if not exists max_consecutive_days smallint not null default 6,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by text;
