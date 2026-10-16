-- =============================================================================
-- Dienstplaner: Doppelrolle Serviceleitung + Projektion
-- Führe dieses Script in deiner Supabase-Datenbank aus.
-- =============================================================================

-- Mitarbeiter, die neben ihrer Hauptrolle zusätzlich Projektion in
-- Personalunion übernehmen können (z.B. Serviceleitung + Projektion).
alter table dienstplan_employees
  add column if not exists can_double_as_projektion boolean not null default false;

-- Markiert eine konkrete Schicht als "deckt zusätzlich die Projektion ab" —
-- der zugehörige offene Projektion-Slot wird dadurch automatisch entfernt.
alter table dienstplan_shifts
  add column if not exists covers_projektion boolean not null default false;
