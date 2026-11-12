-- Historial de propuestas emitidas.
-- Cada emisión guarda una versión con quién la emitió.
-- Reabrir y anular también quedan en el mismo registro.
-- Ejecutar en el SQL editor de Supabase.

CREATE TABLE IF NOT EXISTS public.commercial_quote_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES public.commercial_quotes(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('issued', 'reopened', 'void')),
    actor_id UUID NULL,
    actor_name TEXT NULL,
    summary TEXT NOT NULL,
    labor_total NUMERIC(14, 2) NULL,
    grand_total NUMERIC(14, 2) NULL,
    total_with_igv NUMERIC(14, 2) NULL,
    payload JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (quote_id, version_no)
);

COMMENT ON TABLE public.commercial_quote_versions IS 'Versiones de una propuesta desde que se emite: quién la emitió, la reabrió o la anuló';
COMMENT ON COLUMN public.commercial_quote_versions.payload IS 'Copia de la propuesta en el momento de emitirla';

CREATE INDEX IF NOT EXISTS idx_commercial_quote_versions_quote
    ON public.commercial_quote_versions(quote_id, version_no DESC);

ALTER TABLE public.commercial_quote_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.commercial_quote_versions;
CREATE POLICY opsflow_allow_ops ON public.commercial_quote_versions
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);
