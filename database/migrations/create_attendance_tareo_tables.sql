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
    value_amount NUMERIC(10, 2) NOT NULL DEFAULT 1,
    counts_as_presentismo BOOLEAN NOT NULL DEFAULT false,
    payroll_field TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attendance_tareo_keys_code_unique UNIQUE (code)
);

COMMENT ON TABLE public.attendance_tareo_keys IS 'Catálogo de iconos/claves de novedades (valor + mapeo a columna del Tareo)';
COMMENT ON COLUMN public.attendance_tareo_keys.value_kind IS 'day = valor en días; hours = valor en horas (monto en la novedad); none = marca';
COMMENT ON COLUMN public.attendance_tareo_keys.value_amount IS 'Valor del icono (típicamente 1 día). Se suma a la columna del Tareo.';
COMMENT ON COLUMN public.attendance_tareo_keys.counts_as_presentismo IS 'Si true, también suma value_amount a Presentismo Consolidado';
COMMENT ON COLUMN public.attendance_tareo_keys.payroll_field IS 'Columna del Tareo (paso 2) donde se acumula el valor';

CREATE TABLE IF NOT EXISTS public.attendance_tareo_novedades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    day_key_id UUID REFERENCES public.attendance_tareo_keys(id) ON DELETE RESTRICT,
    hours_key_id UUID REFERENCES public.attendance_tareo_keys(id) ON DELETE RESTRICT,
    hours_value NUMERIC(10, 2) NULL CHECK (hours_value IS NULL OR hours_value >= 0),
    comment TEXT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'suggested')),
    updated_by TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attendance_tareo_novedades_unit_resource_day_unique UNIQUE (unit_id, resource_id, day)
);

COMMENT ON TABLE public.attendance_tareo_novedades IS 'Paso 1: novedades diarias. Hasta 2 claves por día (días + horas).';
COMMENT ON COLUMN public.attendance_tareo_novedades.day_key_id IS 'Clave de días (icono con value_amount)';
COMMENT ON COLUMN public.attendance_tareo_novedades.hours_key_id IS 'Clave de horas; el monto está en hours_value';
COMMENT ON COLUMN public.attendance_tareo_novedades.hours_value IS 'Horas asociadas a hours_key_id';

CREATE INDEX IF NOT EXISTS idx_attendance_tareo_novedades_unit_day
    ON public.attendance_tareo_novedades(unit_id, day);

CREATE INDEX IF NOT EXISTS idx_attendance_tareo_novedades_resource_day
    ON public.attendance_tareo_novedades(resource_id, day);

-- Semilla de claves alineada al Excel de Tareo para nóminas
INSERT INTO public.attendance_tareo_keys
    (code, name, icon, color, value_kind, value_amount, counts_as_presentismo, payroll_field, sort_order, is_system)
VALUES
    ('OK_TM', 'Asistencia OK — Turno mañana', '☀️', '#10b981', 'day', 1, true, 'turnos_tm', 10, true),
    ('OK_TT', 'Asistencia OK — Turno tarde', '🌤️', '#3b82f6', 'day', 1, true, 'turnos_tt', 20, true),
    ('OK_TN', 'Asistencia OK — Turno noche', '🌙', '#8b5cf6', 'day', 1, true, 'turnos_tn', 30, true),
    ('DS', 'Descanso semanal', '💤', '#94a3b8', 'day', 1, false, 'none', 35, true),
    ('FER', 'Feriado / día no laborable', '📅', '#a8a29e', 'day', 1, false, 'none', 36, true),
    ('V', 'Vacaciones', '🏖️', '#0ea5e9', 'day', 1, false, 'vacaciones', 40, true),
    ('DM', 'Descanso médico', '🏥', '#f59e0b', 'day', 1, false, 'descanso_medico', 50, true),
    ('F', 'Falta', '❌', '#ef4444', 'day', 1, false, 'faltas', 60, true),
    ('LCG', 'Licencia con goce', '📄', '#14b8a6', 'day', 1, false, 'licencia_con_goce', 70, true),
    ('LSG', 'Licencia sin goce', '📭', '#f97316', 'day', 1, false, 'licencia_sin_goce', 80, true),
    ('LM', 'Licencia maternidad/paternidad', '👶', '#ec4899', 'day', 1, false, 'licencia_maternidad', 90, true),
    ('LGC_F', 'LGC por fallecimiento de familiar', '🖤', '#64748b', 'day', 1, false, 'lgc_fallecimiento', 100, true),
    ('DESC_DOM', 'Descansos Domingos / días no laborables', '⏰', '#78716c', 'hours', 0, false, 'descansos_dom_feriado', 110, true),
    ('BONO_N', 'Bono nocturno', '🌃', '#6366f1', 'hours', 0, false, 'bono_nocturno', 120, true),
    ('HE_D_25', 'HE diurnas 25%', '⚡', '#eab308', 'hours', 0, false, 'he_d_25', 130, true),
    ('HE_D_35', 'HE diurnas 35%', '💥', '#ca8a04', 'hours', 0, false, 'he_d_35', 140, true),
    ('HE_N_25', 'HE nocturnas 25%', '🔦', '#a855f7', 'hours', 0, false, 'he_n_25', 150, true),
    ('HE_N_35', 'HE nocturnas 35%', '✨', '#7c3aed', 'hours', 0, false, 'he_n_35', 160, true),
    ('HT', 'Horas en descansos o feriados', '🕐', '#0f766e', 'hours', 0, false, 'ht', 170, true)
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
