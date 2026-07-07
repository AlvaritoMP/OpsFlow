-- Clase de unidad: STANDARD (operaciones de campo) o BPO (servicios administrativos)
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS unit_class TEXT NOT NULL DEFAULT 'STANDARD'
  CHECK (unit_class IN ('STANDARD', 'BPO'));

COMMENT ON COLUMN units.unit_class IS 'STANDARD = operaciones de campo; BPO = payroll, contabilidad, bienestar social, etc.';
