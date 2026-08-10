-- Limpieza de cola masiva: excluye todos los pendientes actuales.
-- Úsalo si «Sincronizar cola» encoló la nómina histórica completa.
-- Luego, en la UI, vuelve a «Sincronizar cola» (solo presentaciones 30d + altas 14d).

UPDATE public.hr_outbound_ingreso_queue
SET
  queue_status = 'excluido',
  exclusion_note = COALESCE(exclusion_note, 'Limpieza cola masiva (sync histórico)'),
  updated_at = NOW()
WHERE queue_status = 'pendiente_envio';
