-- ============================================
-- Vacaciones: marcar adelanto (< 30 días ganados)
-- ============================================
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE vacation_papeletas
  ADD COLUMN IF NOT EXISTS is_advance BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN vacation_papeletas.is_advance IS
  'True si al emitir el trabajador aún no había ganado 30 días (adelanto de vacaciones)';
