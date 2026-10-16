-- =============================================================================
-- Dienstplaner: Position an der Schicht
-- Merkt sich, für welche Position (z. B. "Projektion") eine Schicht aus einem Slot entstanden ist.
-- Damit kann der Monatsplan kennzeichnen, wenn eine Serviceleitung eine Projektionsschicht erhält.
-- Idempotent: kann gefahrlos mehrfach ausgeführt werden.
-- =============================================================================

alter table dienstplan_shifts
  add column if not exists position text;
