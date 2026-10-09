-- Recontratación de personal cesado o archivado.
-- Ejecutar en el SQL editor de Supabase.
--
-- Recontratar no modifica la ficha cesada: abre otra relación laboral
-- y guarda una copia del cese que no se borra aunque después se recupere la ficha anterior.

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS rehired_from_resource_id UUID REFERENCES public.resources(id),
  ADD COLUMN IF NOT EXISTS rehire_reason TEXT;

COMMENT ON COLUMN public.resources.rehired_from_resource_id IS
  'Ficha cesada o archivada de la que nace esta relación. Esa ficha no se altera al recontratar.';
COMMENT ON COLUMN public.resources.rehire_reason IS
  'Motivo de la recontratación: nueva unidad, cambio de régimen o condiciones, u otro.';

CREATE INDEX IF NOT EXISTS idx_resources_rehired_from
  ON public.resources (rehired_from_resource_id)
  WHERE rehired_from_resource_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.worker_rehire_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_resource_id UUID NOT NULL REFERENCES public.resources(id),
  new_resource_id UUID NOT NULL REFERENCES public.resources(id),
  source_unit_id UUID,
  target_unit_id UUID NOT NULL,
  source_personnel_status TEXT NOT NULL,
  source_start_date DATE,
  source_end_date DATE,
  termination_reason TEXT,
  source_puesto TEXT,
  source_monthly_salary NUMERIC(10, 2),
  source_work_condition_amount NUMERIC(10, 2),
  source_labor_regime TEXT,
  source_jornada_type TEXT,
  rehire_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.worker_rehire_events IS
  'Cada recontratación. Conserva el cese de la relación anterior aunque esa ficha se edite o se recupere después.';

CREATE INDEX IF NOT EXISTS idx_worker_rehire_events_source
  ON public.worker_rehire_events (source_resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_worker_rehire_events_new
  ON public.worker_rehire_events (new_resource_id);

ALTER TABLE public.worker_rehire_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.worker_rehire_events;
CREATE POLICY opsflow_allow_ops ON public.worker_rehire_events
  AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
