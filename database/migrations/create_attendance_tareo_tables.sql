-- Tareo / Novedades de asistencia: catálogo de claves + marcas diarias por trabajador.
-- El export a nóminas agrega estas claves a la estructura de columnas del Excel de Tareo.

CREATE TABLE IF NOT EXISTS public.attendance_tareo_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'circle',
    color TEXT NOT NULL DEFAULT '#64748b',
    value_kind TEXT NOT NULL DEFAULT 'day'
        CHECK (value_kind IN ('day', 'hours', 'none')),
    counts_as_presentismo BOOLEAN NOT NULL DEFAULT false,
    payroll_field TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attendance_tareo_keys_code_unique UNIQUE (code)
);

COMMENT ON TABLE public.attendance_tareo_keys IS 'Catálogo de claves de asistencia/tareo (icono, criterio y mapeo a columna de nómina)';
COMMENT ON COLUMN public.attendance_tareo_keys.value_kind IS 'day = cuenta 1 día; hours = suma hours_value; none = solo marca';
COMMENT ON COLUMN public.attendance_tareo_keys.counts_as_presentismo IS 'Si true, suma 1 a Presentismo Consolidado';
COMMENT ON COLUMN public.attendance_tareo_keys.payroll_field IS 'Campo de agregación: turnos_tm, turnos_tt, turnos_tn, vacaciones, faltas, descanso_medico, licencia_sin_goce, licencia_con_goce, licencia_maternidad, lgc_fallecimiento, bono_nocturno, descansos_dom_feriado, he_d_25, he_d_35, he_n_25, he_n_35, ht, none';

CREATE TABLE IF NOT EXISTS public.attendance_tareo_novedades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    key_id UUID NOT NULL REFERENCES public.attendance_tareo_keys(id) ON DELETE RESTRICT,
    hours_value NUMERIC(10, 2) NULL CHECK (hours_value IS NULL OR hours_value >= 0),
    comment TEXT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'suggested')),
    updated_by TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attendance_tareo_novedades_unit_resource_day_key_unique UNIQUE (unit_id, resource_id, day, key_id)
);

COMMENT ON TABLE public.attendance_tareo_novedades IS 'Novedad diaria de tareo por trabajador (clave de asistencia que alimenta el export de nóminas)';
COMMENT ON COLUMN public.attendance_tareo_novedades.hours_value IS 'Horas cuando la clave es de tipo hours (HE, bono nocturno, HT, etc.)';

CREATE INDEX IF NOT EXISTS idx_attendance_tareo_novedades_unit_day
    ON public.attendance_tareo_novedades(unit_id, day);

CREATE INDEX IF NOT EXISTS idx_attendance_tareo_novedades_resource_day
    ON public.attendance_tareo_novedades(resource_id, day);

-- Semilla de claves alineada al Excel de Tareo para nóminas
INSERT INTO public.attendance_tareo_keys
    (code, name, icon, color, value_kind, counts_as_presentismo, payroll_field, sort_order, is_system)
VALUES
    ('OK_TM', 'Asistencia OK — Turno mañana', 'dot', '#10b981', 'day', true, 'turnos_tm', 10, true),
    ('OK_TT', 'Asistencia OK — Turno tarde', 'dot', '#3b82f6', 'day', true, 'turnos_tt', 20, true),
    ('OK_TN', 'Asistencia OK — Turno noche', 'dot', '#8b5cf6', 'day', true, 'turnos_tn', 30, true),
    ('V', 'Vacaciones', 'palm', '#0ea5e9', 'day', false, 'vacaciones', 40, true),
    ('DM', 'Descanso médico', 'cross', '#f59e0b', 'day', false, 'descanso_medico', 50, true),
    ('F', 'Falta', 'x', '#ef4444', 'day', false, 'faltas', 60, true),
    ('LCG', 'Licencia con goce', 'file', '#14b8a6', 'day', false, 'licencia_con_goce', 70, true),
    ('LSG', 'Licencia sin goce', 'file-off', '#f97316', 'day', false, 'licencia_sin_goce', 80, true),
    ('LM', 'Licencia maternidad/paternidad', 'baby', '#ec4899', 'day', false, 'licencia_maternidad', 90, true),
    ('LGC_F', 'LGC por fallecimiento de familiar', 'heart', '#64748b', 'day', false, 'lgc_fallecimiento', 100, true),
    ('DESC_DOM', 'Descansos Domingos / días no laborables', 'clock', '#78716c', 'hours', false, 'descansos_dom_feriado', 110, true),
    ('BONO_N', 'Bono nocturno', 'moon', '#6366f1', 'hours', false, 'bono_nocturno', 120, true),
    ('HE_D_25', 'HE diurnas 25%', 'zap', '#eab308', 'hours', false, 'he_d_25', 130, true),
    ('HE_D_35', 'HE diurnas 35%', 'zap', '#ca8a04', 'hours', false, 'he_d_35', 140, true),
    ('HE_N_25', 'HE nocturnas 25%', 'zap', '#a855f7', 'hours', false, 'he_n_25', 150, true),
    ('HE_N_35', 'HE nocturnas 35%', 'zap', '#7c3aed', 'hours', false, 'he_n_35', 160, true),
    ('HT', 'Horas en descansos o feriados', 'calendar-clock', '#0f766e', 'hours', false, 'ht', 170, true)
ON CONFLICT (code) DO NOTHING;

-- RLS permisivo (misma convención que el resto de OpsFlow / anon key)
ALTER TABLE public.attendance_tareo_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_tareo_novedades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.attendance_tareo_keys;
CREATE POLICY opsflow_allow_ops ON public.attendance_tareo_keys
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS opsflow_allow_ops ON public.attendance_tareo_novedades;
CREATE POLICY opsflow_allow_ops ON public.attendance_tareo_novedades
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);
