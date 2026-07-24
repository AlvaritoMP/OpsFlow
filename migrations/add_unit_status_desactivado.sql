-- ============================================
-- MIGRACIÓN: Estado Desactivado en units
-- ============================================
-- Extiende el dominio de units.status con 'Desactivado'.
-- Las unidades desactivadas no participan en procesos ni
-- conteos de la aplicación (filtrado en frontend).
-- No requiere ALTER de tipo: status es TEXT libre.

COMMENT ON COLUMN units.status IS
  'Estado operativo: Activo | Pendiente | Con Incidencias | Desactivado. Desactivado excluye la unidad de procesos y conteos.';
