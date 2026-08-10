-- Tras limpiar la cola masiva con UPDATE a «excluido», el UNIQUE(resource_id)
-- impedía volver a encolar. Este script BORRA esas filas excluidas por la limpieza
-- para liberar el resource_id. Luego en la UI: «Sincronizar cola».

DELETE FROM public.hr_outbound_ingreso_queue
WHERE queue_status = 'excluido'
  AND (
    exclusion_note ILIKE '%Limpieza cola masiva%'
    OR exclusion_note ILIKE '%sync hist%'
  );
