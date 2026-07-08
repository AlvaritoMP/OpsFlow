-- ============================================
-- Vacaciones: fraccionamiento 15+15 y medios días
-- ============================================
-- Ejecutar en Supabase SQL Editor.

-- Soportar medios días en papeletas (p. ej. 0.5)
ALTER TABLE vacation_papeletas
  ALTER COLUMN calendar_days TYPE NUMERIC(6,2)
  USING calendar_days::numeric;

ALTER TABLE vacation_papeletas
  DROP CONSTRAINT IF EXISTS vacation_papeletas_calendar_days_check;

ALTER TABLE vacation_papeletas
  ADD CONSTRAINT vacation_papeletas_calendar_days_check
  CHECK (calendar_days >= 0.5);

-- Días a cuenta pueden ser medios días
ALTER TABLE vacation_day_entries
  ADD COLUMN IF NOT EXISTS days_count NUMERIC(4,2) NOT NULL DEFAULT 1
  CHECK (days_count > 0 AND days_count <= 1);

COMMENT ON COLUMN vacation_day_entries.days_count IS
  'Días de goce descontados (1 = día completo, 0.5 = medio día)';

COMMENT ON COLUMN vacation_papeletas.calendar_days IS
  'Días calendario descontados del saldo (incluye descansos semanales del periodo)';
