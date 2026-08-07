-- Backfill: paquetes/ítems recibidos sin purpose que deben ir a Presentaciones ATS
-- (Recepción ATS quedó como archivo; el flujo activo es presentación/entrevista).
-- Incluye el envío de Juan José Díaz Márquez (DNI 06302994).

UPDATE public.inbound_worker_handoff_packages
SET purpose = 'presentation'
WHERE purpose IS NULL
  AND status IN ('received', 'processing');

UPDATE public.inbound_worker_handoff_items i
SET
  purpose = 'presentation',
  item_status = CASE
    WHEN i.item_status = 'pending' THEN 'pending_interview'
    WHEN i.item_status = 'accepted' THEN 'in_review'
    ELSE i.item_status
  END,
  complementary_status = COALESCE(i.complementary_status, 'missing'),
  complementary_missing_fields = COALESCE(i.complementary_missing_fields, '[]'::jsonb),
  snapshot_version = COALESCE(NULLIF(i.snapshot_version, 1), 2)
WHERE i.purpose IS NULL
  AND i.item_status IN ('pending', 'accepted')
  AND EXISTS (
    SELECT 1
    FROM public.inbound_worker_handoff_packages p
    WHERE p.id = i.package_id
      AND p.purpose = 'presentation'
  );
