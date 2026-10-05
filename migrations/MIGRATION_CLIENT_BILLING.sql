-- Facturación de clientes (intermediación / tercerización).
-- Guarda cada liquidación mensual y la bitácora de ajustes del usuario.
-- Ejecutar en el SQL editor de Supabase.

CREATE TABLE IF NOT EXISTS public.client_billings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    client_name TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    period_month DATE NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'void')),
    payload JSONB NOT NULL,
    labor_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    operational_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    admin_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    profit_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_by UUID NULL,
    created_by_name TEXT NULL,
    updated_by UUID NULL,
    updated_by_name TEXT NULL,
    issued_at TIMESTAMPTZ NULL,
    issued_by_name TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_billings IS 'Liquidaciones mensuales de facturación al cliente por unidad';
COMMENT ON COLUMN public.client_billings.payload IS 'Modelo editable (personal, costos, tasas) y resultado calculado';
COMMENT ON COLUMN public.client_billings.period_month IS 'Primer día del mes facturado';

CREATE INDEX IF NOT EXISTS idx_client_billings_unit_period
    ON public.client_billings(unit_id, period_month DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_billings_active_period
    ON public.client_billings(unit_id, period_month)
    WHERE status <> 'void';

CREATE TABLE IF NOT EXISTS public.client_billing_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_id UUID NOT NULL REFERENCES public.client_billings(id) ON DELETE CASCADE,
    actor_id UUID NULL,
    actor_name TEXT NULL,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    changes JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_billing_audit IS 'Quién ajustó cada facturación y qué valores cambió';

CREATE INDEX IF NOT EXISTS idx_client_billing_audit_billing
    ON public.client_billing_audit(billing_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.client_billing_profiles (
    unit_id UUID PRIMARY KEY REFERENCES public.units(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    updated_by_name TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_billing_profiles IS 'Condiciones comerciales reutilizables por unidad (utilidad, tasas, gastos de estructura)';

ALTER TABLE public.client_billings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_billing_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_billing_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.client_billings;
CREATE POLICY opsflow_allow_ops ON public.client_billings
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS opsflow_allow_ops ON public.client_billing_audit;
CREATE POLICY opsflow_allow_ops ON public.client_billing_audit
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS opsflow_allow_ops ON public.client_billing_profiles;
CREATE POLICY opsflow_allow_ops ON public.client_billing_profiles
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);
