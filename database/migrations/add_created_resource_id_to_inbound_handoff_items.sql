-- Vincular ítem de recepción ATS con el recurso (colaborador) creado en OpsFlow
ALTER TABLE public.inbound_worker_handoff_items
  ADD COLUMN IF NOT EXISTS created_resource_id UUID NULL;

COMMENT ON COLUMN public.inbound_worker_handoff_items.created_resource_id IS
  'Recurso de personal creado en OpsFlow a partir de este ítem ATS';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inbound_worker_handoff_items_created_resource_id_fkey'
  ) THEN
    ALTER TABLE public.inbound_worker_handoff_items
      ADD CONSTRAINT inbound_worker_handoff_items_created_resource_id_fkey
      FOREIGN KEY (created_resource_id)
      REFERENCES public.resources(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inbound_handoff_items_created_resource
  ON public.inbound_worker_handoff_items(created_resource_id)
  WHERE created_resource_id IS NOT NULL;
