-- Corridas de facturación y notas de crédito / débito por diferencia entre cálculos.
-- Ejecutar en el SQL editor de Supabase cuando las tablas de MIGRATION_CLIENT_BILLING.sql ya existen.

CREATE TABLE IF NOT EXISTS public.client_billing_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_id UUID NOT NULL REFERENCES public.client_billings(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL,
    client_name TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    period_month DATE NOT NULL,
    title TEXT NOT NULL,
    comment TEXT NULL,
    billing_status TEXT NOT NULL DEFAULT 'draft',
    payload JSONB NOT NULL,
    labor_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    operational_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    admin_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    profit_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    igv_rate NUMERIC(10, 6) NOT NULL DEFAULT 0.18,
    created_by UUID NULL,
    created_by_name TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_billing_runs IS 'Cada guardado de una liquidación, para poder restarlo de otro cálculo';
COMMENT ON COLUMN public.client_billing_runs.payload IS 'Modelo de la liquidación en el momento del guardado';

CREATE INDEX IF NOT EXISTS idx_client_billing_runs_billing
    ON public.client_billing_runs(billing_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.client_billing_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NULL REFERENCES public.units(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    note_kind TEXT NOT NULL CHECK (note_kind IN ('credit', 'debit')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'void')),
    title TEXT NOT NULL,
    source_billing_id UUID NULL REFERENCES public.client_billings(id) ON DELETE SET NULL,
    base_billing_id UUID NULL REFERENCES public.client_billings(id) ON DELETE SET NULL,
    source_run_id UUID NULL REFERENCES public.client_billing_runs(id) ON DELETE SET NULL,
    base_run_id UUID NULL REFERENCES public.client_billing_runs(id) ON DELETE SET NULL,
    source_label TEXT NOT NULL,
    base_label TEXT NOT NULL,
    item_description TEXT NOT NULL,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    signed_difference NUMERIC(14, 2) NOT NULL,
    breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by UUID NULL,
    created_by_name TEXT NULL,
    updated_by UUID NULL,
    updated_by_name TEXT NULL,
    issued_at TIMESTAMPTZ NULL,
    issued_by_name TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_billing_notes IS 'Notas de crédito o débito cuyo ítem es la diferencia entre dos cálculos guardados';
COMMENT ON COLUMN public.client_billing_notes.signed_difference IS 'Total sin IGV del cálculo origen menos el total sin IGV del cálculo restado';
COMMENT ON COLUMN public.client_billing_notes.amount IS 'Valor absoluto de la diferencia: monto del ítem de la nota';

CREATE INDEX IF NOT EXISTS idx_client_billing_notes_unit
    ON public.client_billing_notes(unit_id, created_at DESC);

ALTER TABLE public.client_billing_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_billing_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.client_billing_runs;
CREATE POLICY opsflow_allow_ops ON public.client_billing_runs
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS opsflow_allow_ops ON public.client_billing_notes;
CREATE POLICY opsflow_allow_ops ON public.client_billing_notes
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);
