-- ============================================
-- Vacaciones: auditoría, autorización y edición
-- ============================================
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE vacation_papeletas
  ADD COLUMN IF NOT EXISTS authorized_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);

ALTER TABLE vacation_day_entries
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN vacation_papeletas.authorized_by IS
  'Usuario que autorizó emisión >7 días o anulación según política';
COMMENT ON COLUMN vacation_papeletas.cancelled_by IS
  'Usuario que solicitó la anulación de la papeleta';
