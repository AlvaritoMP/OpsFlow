-- Migración: Crear tabla para comisiones y remuneraciones variables
-- Descripción: Registra pagos variables por trabajador, unidad y mes.

CREATE TABLE IF NOT EXISTS public.variable_compensations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL,
    resource_id UUID NOT NULL,
    period_month DATE NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    concept TEXT NOT NULL DEFAULT 'Comisión',
    payment_date DATE NULL,
    notes TEXT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT variable_compensations_unit_id_fkey
        FOREIGN KEY (unit_id)
        REFERENCES public.units(id)
        ON DELETE CASCADE,

    CONSTRAINT variable_compensations_resource_id_fkey
        FOREIGN KEY (resource_id)
        REFERENCES public.resources(id)
        ON DELETE CASCADE
);

COMMENT ON TABLE public.variable_compensations IS 'Comisiones y remuneraciones variables pagadas a trabajadores por unidad y mes';
COMMENT ON COLUMN public.variable_compensations.period_month IS 'Mes del pago variable. Guardar siempre como primer día del mes';
COMMENT ON COLUMN public.variable_compensations.amount IS 'Monto pagado por comisión o remuneración variable';
COMMENT ON COLUMN public.variable_compensations.source IS 'Origen del registro: manual o import';

-- RLS: no deshabilitar; la migración global opsflow_rls_permissive_for_app.sql
-- habilita RLS y políticas para anon/authenticated en todas las tablas public.

CREATE INDEX IF NOT EXISTS idx_variable_compensations_unit_month
    ON public.variable_compensations(unit_id, period_month);

CREATE INDEX IF NOT EXISTS idx_variable_compensations_resource_month
    ON public.variable_compensations(resource_id, period_month);
