-- Seguimiento comercial del Cotizador.
-- Columnas compartidas (texto, número o categoría) y el valor de cada propuesta.
-- El seguimiento no forma parte del PDF ni del cálculo.
-- Ejecutar en el SQL editor de Supabase.

ALTER TABLE public.commercial_quotes
    ADD COLUMN IF NOT EXISTS tracking JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.commercial_quotes.tracking IS 'Valores de las columnas de seguimiento. La clave es el id de la columna.';

CREATE TABLE IF NOT EXISTS public.commercial_quote_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('text', 'number', 'category')),
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commercial_quote_fields IS 'Columnas de seguimiento del cotizador: texto, número o categoría';
COMMENT ON COLUMN public.commercial_quote_fields.options IS 'Opciones de una categoría. Cada una es un texto o un objeto {label, color} con color hex.';

CREATE INDEX IF NOT EXISTS idx_commercial_quote_fields_position
    ON public.commercial_quote_fields(position, created_at);

ALTER TABLE public.commercial_quote_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.commercial_quote_fields;
CREATE POLICY opsflow_allow_ops ON public.commercial_quote_fields
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- Un valor a la vez, sin pisar las otras columnas de la misma propuesta.
CREATE OR REPLACE FUNCTION public.set_quote_tracking(
    p_quote_id UUID,
    p_field_id UUID,
    p_value JSONB
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    base JSONB;
    next_tracking JSONB;
BEGIN
    SELECT coalesce(tracking, '{}'::jsonb)
      INTO base
      FROM public.commercial_quotes
     WHERE id = p_quote_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró la propuesta';
    END IF;

    IF jsonb_typeof(base) IS DISTINCT FROM 'object' THEN
        base := '{}'::jsonb;
    END IF;

    IF p_value IS NULL OR p_value = 'null'::jsonb OR p_value = '""'::jsonb THEN
        next_tracking := base - p_field_id::text;
    ELSE
        next_tracking := base || jsonb_build_object(p_field_id::text, p_value);
    END IF;

    UPDATE public.commercial_quotes
       SET tracking = next_tracking
     WHERE id = p_quote_id;

    RETURN next_tracking;
END;
$$;

COMMENT ON FUNCTION public.set_quote_tracking(UUID, UUID, JSONB) IS 'Anota un valor de seguimiento en una propuesta sin modificar el resto';

GRANT EXECUTE ON FUNCTION public.set_quote_tracking(UUID, UUID, JSONB) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
