-- Ampliar item_status: archivar presentación aprobada sin registrar en unidad
-- (candidato aprobado que nunca inicia labores / sin contrato)

ALTER TABLE public.inbound_worker_handoff_items
  DROP CONSTRAINT IF EXISTS inbound_worker_handoff_items_item_status_check;

ALTER TABLE public.inbound_worker_handoff_items
  ADD CONSTRAINT inbound_worker_handoff_items_item_status_check
  CHECK (item_status IN (
    'pending',
    'accepted',
    'rejected',
    'assigned',
    'pending_interview',
    'in_review',
    'approved',
    'archived_no_hire'
  ));

COMMENT ON COLUMN public.inbound_worker_handoff_items.item_status IS
  'Hire: pending|accepted|rejected|assigned. Presentation: pending_interview|in_review|approved|rejected|assigned|archived_no_hire (aprobado sin ingreso)';
