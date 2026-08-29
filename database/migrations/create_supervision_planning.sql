-- ============================================
-- SUPERVISIÓN DE CAMPO: rutas, cronograma y ejecución
-- Replica la lógica del Excel "Distribución de Unidades - Supervisión"
-- ============================================

-- Asignación maestra: unidad → supervisor / coordinador / frecuencia / días
CREATE TABLE IF NOT EXISTS public.supervision_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  supervisor_staff_id UUID REFERENCES public.management_staff(id) ON DELETE SET NULL,
  coordinator_staff_id UUID REFERENCES public.management_staff(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'MEDIA' CHECK (category IN ('ALTA', 'MEDIA', 'BAJA')),
  frequency TEXT NOT NULL DEFAULT 'SEMANAL' CHECK (frequency IN (
    'SEMANAL',
    'QUINCENAL',
    'MENSUAL',
    'PERMANENTE',
    'PREVIA_COORDINACION',
    'CUANDO_SE_REQUIERA',
    'SEGUN_RUTA',
    'POR_CONFIRMAR',
    'NINGUNO'
  )),
  visit_days JSONB NOT NULL DEFAULT '{"mon":false,"tue":false,"wed":false,"thu":false,"fri":false,"sat":false,"sun":false}'::jsonb,
  rest_weekday INTEGER NOT NULL DEFAULT 7 CHECK (rest_weekday BETWEEN 1 AND 7),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (unit_id)
);

COMMENT ON TABLE public.supervision_assignments IS 'Asignación de unidades a supervisores de ronda y patrón semanal de visitas';
COMMENT ON COLUMN public.supervision_assignments.visit_days IS 'Días de visita ISO: mon=1 ... sun=7';
COMMENT ON COLUMN public.supervision_assignments.rest_weekday IS 'Día de descanso (1=lunes ... 7=domingo)';

-- Ruta del supervisor para un día de la semana (orden de paradas)
CREATE TABLE IF NOT EXISTS public.supervision_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_staff_id UUID NOT NULL REFERENCES public.management_staff(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  name TEXT NOT NULL,
  is_optimized BOOLEAN NOT NULL DEFAULT false,
  estimated_distance_km NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (supervisor_staff_id, weekday)
);

COMMENT ON TABLE public.supervision_routes IS 'Ruta semanal recurrente de un supervisor (un registro por día)';

CREATE TABLE IF NOT EXISTS public.supervision_route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.supervision_routes(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  stop_order INTEGER NOT NULL CHECK (stop_order >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (route_id, unit_id),
  UNIQUE (route_id, stop_order)
);

COMMENT ON TABLE public.supervision_route_stops IS 'Paradas ordenadas de una ruta de supervisión';

-- Visitas concretas de una semana (cronograma + ejecución)
CREATE TABLE IF NOT EXISTS public.supervision_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES public.supervision_assignments(id) ON DELETE SET NULL,
  route_id UUID REFERENCES public.supervision_routes(id) ON DELETE SET NULL,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  supervisor_staff_id UUID NOT NULL REFERENCES public.management_staff(id) ON DELETE CASCADE,
  coordinator_staff_id UUID REFERENCES public.management_staff(id) ON DELETE SET NULL,
  visit_date DATE NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  stop_order INTEGER,
  planned_start TIME,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'cancelled')),
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  check_in_lat NUMERIC(10, 7),
  check_in_lng NUMERIC(10, 7),
  check_out_lat NUMERIC(10, 7),
  check_out_lng NUMERIC(10, 7),
  notes TEXT,
  skip_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (visit_date, supervisor_staff_id, unit_id)
);

COMMENT ON TABLE public.supervision_visits IS 'Visitas programadas y su ejecución (check-in / check-out)';

CREATE INDEX IF NOT EXISTS idx_supervision_assignments_supervisor ON public.supervision_assignments(supervisor_staff_id);
CREATE INDEX IF NOT EXISTS idx_supervision_assignments_coordinator ON public.supervision_assignments(coordinator_staff_id);
CREATE INDEX IF NOT EXISTS idx_supervision_assignments_active ON public.supervision_assignments(is_active);

CREATE INDEX IF NOT EXISTS idx_supervision_routes_supervisor ON public.supervision_routes(supervisor_staff_id);
CREATE INDEX IF NOT EXISTS idx_supervision_route_stops_route ON public.supervision_route_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_supervision_route_stops_unit ON public.supervision_route_stops(unit_id);

CREATE INDEX IF NOT EXISTS idx_supervision_visits_date ON public.supervision_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_supervision_visits_supervisor ON public.supervision_visits(supervisor_staff_id);
CREATE INDEX IF NOT EXISTS idx_supervision_visits_status ON public.supervision_visits(status);
CREATE INDEX IF NOT EXISTS idx_supervision_visits_unit ON public.supervision_visits(unit_id);

CREATE OR REPLACE FUNCTION public.update_supervision_planning_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_supervision_assignments_updated_at ON public.supervision_assignments;
CREATE TRIGGER update_supervision_assignments_updated_at
  BEFORE UPDATE ON public.supervision_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_supervision_planning_updated_at();

DROP TRIGGER IF EXISTS update_supervision_routes_updated_at ON public.supervision_routes;
CREATE TRIGGER update_supervision_routes_updated_at
  BEFORE UPDATE ON public.supervision_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_supervision_planning_updated_at();

DROP TRIGGER IF EXISTS update_supervision_visits_updated_at ON public.supervision_visits;
CREATE TRIGGER update_supervision_visits_updated_at
  BEFORE UPDATE ON public.supervision_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_supervision_planning_updated_at();

-- RLS permisivo (misma convención OpsFlow / anon key)
ALTER TABLE public.supervision_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.supervision_assignments;
CREATE POLICY opsflow_allow_ops ON public.supervision_assignments
  AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS opsflow_allow_ops ON public.supervision_routes;
CREATE POLICY opsflow_allow_ops ON public.supervision_routes
  AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS opsflow_allow_ops ON public.supervision_route_stops;
CREATE POLICY opsflow_allow_ops ON public.supervision_route_stops
  AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS opsflow_allow_ops ON public.supervision_visits;
CREATE POLICY opsflow_allow_ops ON public.supervision_visits
  AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
