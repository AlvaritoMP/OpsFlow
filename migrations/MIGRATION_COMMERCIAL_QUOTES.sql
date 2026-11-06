-- Cotizador: propuestas económicas (PES).
-- Cada propuesta guarda el mismo modelo de cálculo que una liquidación,
-- más las condiciones del servicio y las notas del anexo.
-- Ejecutar en el SQL editor de Supabase.

CREATE TABLE IF NOT EXISTS public.commercial_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    client_name TEXT NOT NULL,
    service_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'void')),
    payload JSONB NOT NULL,
    labor_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_with_igv NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_by UUID NULL,
    created_by_name TEXT NULL,
    updated_by UUID NULL,
    updated_by_name TEXT NULL,
    issued_at TIMESTAMPTZ NULL,
    issued_by_name TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commercial_quotes IS 'Propuestas técnico económicas armadas con el método de liquidación';
COMMENT ON COLUMN public.commercial_quotes.payload IS 'Puestos, tasas, costos, condiciones del servicio y notas del anexo';
COMMENT ON COLUMN public.commercial_quotes.code IS 'Código PES de la propuesta, único';

CREATE INDEX IF NOT EXISTS idx_commercial_quotes_updated
    ON public.commercial_quotes(updated_at DESC);

ALTER TABLE public.commercial_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.commercial_quotes;
CREATE POLICY opsflow_allow_ops ON public.commercial_quotes
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);
