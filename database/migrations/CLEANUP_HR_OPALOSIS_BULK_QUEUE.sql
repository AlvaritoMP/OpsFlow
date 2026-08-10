-- Limpieza de cola masiva: elimina pendientes actuales (libera UNIQUE resource_id).
-- Úsalo si «Sincronizar cola» encoló la nómina histórica completa.
-- Luego, en la UI, vuelve a «Sincronizar cola» (presentaciones 60d + altas 30d).

DELETE FROM public.hr_outbound_ingreso_queue
WHERE queue_status = 'pendiente_envio';
