-- =============================================================================
-- Dienstplaner Migration: Neue Felder & Verbesserungen
-- Führe dieses Script in deiner Supabase-Datenbank aus.
-- =============================================================================

-- 1. Neue Spalten für Mitarbeiter
ALTER TABLE dienstplan_employees
  ADD COLUMN IF NOT EXISTS color        VARCHAR(7)   NOT NULL DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS department   TEXT,
  ADD COLUMN IF NOT EXISTS is_active    BOOLEAN      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS employment_type TEXT       NOT NULL DEFAULT 'vollzeit',
  ADD COLUMN IF NOT EXISTS sort_order   INTEGER      NOT NULL DEFAULT 0;

-- 2. Farben automatisch zuweisen (nur für Einträge, die noch den Default-Wert haben)
WITH palette(color, pos) AS (
  VALUES
    ('#6366f1', 1),  -- Indigo
    ('#8b5cf6', 2),  -- Violet
    ('#ec4899', 3),  -- Pink
    ('#f97316', 4),  -- Orange
    ('#22c55e', 5),  -- Green
    ('#06b6d4', 6),  -- Cyan
    ('#eab308', 7),  -- Yellow
    ('#ef4444', 8),  -- Red
    ('#14b8a6', 9),  -- Teal
    ('#f43f5e', 10)  -- Rose
),
numbered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at, id) - 1) AS rn
  FROM dienstplan_employees
)
UPDATE dienstplan_employees e
SET color = p.color
FROM numbered n
JOIN palette p ON p.pos = (n.rn % 10) + 1
WHERE e.id = n.id;

-- 3. Sort-Order für bestehende Mitarbeiter
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) - 1 AS rn
  FROM dienstplan_employees
)
UPDATE dienstplan_employees e
SET sort_order = n.rn
FROM numbered n
WHERE e.id = n.id;

-- =============================================================================
-- Überprüfung: Zeige aktuellen Stand der Mitarbeiter
-- =============================================================================
-- SELECT id, name, position, color, department, is_active, employment_type, sort_order
-- FROM dienstplan_employees
-- ORDER BY sort_order;
