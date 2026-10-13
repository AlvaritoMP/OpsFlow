-- Plan de trabajo y cronograma por unidad.
-- Ejecutar en el SQL editor de Supabase.
--
-- Cada unidad arma sus propios turnos, horarios y actividades.
-- El detalle vive en JSON para no obligar el mismo esquema (mañana/tarde/noche) a todas.

CREATE TABLE IF NOT EXISTS public.unit_work_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  valid_from DATE,
  valid_until DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active')),
  shifts JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.unit_work_plans IS
  'Planes de trabajo por unidad: turnos, horarios y actividades. Un solo plan vigente por unidad.';
COMMENT ON COLUMN public.unit_work_plans.shifts IS
  'Turnos del plan: [{id, name, people:[{id, resourceId, name, role}], slots:[{id, startTime, endTime, activities:[{id, text, frequency, weekdays, personIds, zone}]}]}]';
COMMENT ON COLUMN public.unit_work_plans.status IS
  'draft = borrador; active = plan vigente de la unidad.';

CREATE INDEX IF NOT EXISTS idx_unit_work_plans_unit
  ON public.unit_work_plans (unit_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS unit_work_plans_one_active
  ON public.unit_work_plans (unit_id)
  WHERE status = 'active';

ALTER TABLE public.unit_work_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.unit_work_plans;
CREATE POLICY opsflow_allow_ops ON public.unit_work_plans
  AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
