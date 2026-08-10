-- Deja la cola pendiente vacía para luego encolar solo el lote por DNI desde la UI
-- («Encolar por DNI»).

DELETE FROM public.hr_outbound_ingreso_queue
WHERE queue_status = 'pendiente_envio';
