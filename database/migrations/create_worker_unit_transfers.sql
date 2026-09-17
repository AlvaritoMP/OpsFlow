-- Historial de traslados / intercambios de trabajadores entre unidades.
-- El trabajador sigue siendo el mismo resource: contratos, incrementos,
-- capacitaciones y dotaciones viajan con resource_id. Esta tabla solo audita
-- el cambio de unidad (resources.unit_id).

CREATE TABLE IF NOT EXISTS public.worker_unit_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  from_unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  to_unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  swapped_resource_id UUID REFERENCES public.resources(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'transfer' CHECK (mode IN ('transfer', 'swap')),
  notes TEXT,
  transferred_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  transferred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_unit_transfers_resource
  ON public.worker_unit_transfers(resource_id, transferred_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_unit_transfers_from_unit
  ON public.worker_unit_transfers(from_unit_id, transferred_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_unit_transfers_to_unit
  ON public.worker_unit_transfers(to_unit_id, transferred_at DESC);

COMMENT ON TABLE public.worker_unit_transfers IS
  'Auditoría de traslados e intercambios de personal entre unidades. El historial HR (contratos, incrementos, capacitaciones, dotaciones) permanece en el resource.';
COMMENT ON COLUMN public.worker_unit_transfers.mode IS
  'transfer = un trabajador cambia de unidad; swap = se intercambia con otro trabajador';
COMMENT ON COLUMN public.worker_unit_transfers.swapped_resource_id IS
  'En un intercambio, el otro trabajador que ocupó la unidad de origen';

ALTER TABLE public.worker_unit_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.worker_unit_transfers;
CREATE POLICY opsflow_allow_ops ON public.worker_unit_transfers
  AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
