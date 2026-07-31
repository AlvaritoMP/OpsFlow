-- ============================================
-- MIGRACIÓN: Estado Desactivado en units
-- ============================================
-- Extiende units_status_check para permitir 'Desactivado'.
-- Sin esto, el UPDATE falla con:
--   new row for relation "units" violates check constraint "units_status_check"
--
-- Ejecutar en el SQL Editor de Supabase (o psql) antes de desactivar unidades.

ALTER TABLE units DROP CONSTRAINT IF EXISTS units_status_check;

ALTER TABLE units
ADD CONSTRAINT units_status_check
CHECK (status IN ('Activo', 'Pendiente', 'Con Incidencias', 'Desactivado'));

COMMENT ON COLUMN units.status IS
  'Estado operativo: Activo | Pendiente | Con Incidencias | Desactivado. Desactivado excluye la unidad de procesos y conteos.';
