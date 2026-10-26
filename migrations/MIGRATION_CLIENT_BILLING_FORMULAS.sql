-- Método de cálculo de la facturación, editable por un administrador.
-- Una fila guarda las fórmulas publicadas. Las liquidaciones nuevas las copian.
-- Ejecutar en el SQL editor de Supabase.

CREATE TABLE IF NOT EXISTS public.client_billing_formula_catalog (
    id TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_by_name TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_billing_formula_catalog IS 'Fórmulas publicadas del cálculo de facturación';
COMMENT ON COLUMN public.client_billing_formula_catalog.payload IS 'Mapa de fórmulas por celda. La fila active es el método vigente.';

ALTER TABLE public.client_billing_formula_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.client_billing_formula_catalog;
CREATE POLICY opsflow_allow_ops ON public.client_billing_formula_catalog
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);
