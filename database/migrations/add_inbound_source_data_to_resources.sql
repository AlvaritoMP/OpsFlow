-- Datos variables recibidos desde Opalo ATS al registrar personal desde recepción
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS inbound_source_data JSONB NULL;

COMMENT ON COLUMN public.resources.inbound_source_data IS
  'Snapshot y metadatos del envío ATS (identity, fields, meta). Inmutable para usos futuros.';

CREATE INDEX IF NOT EXISTS idx_resources_inbound_source_data
  ON public.resources USING GIN (inbound_source_data)
  WHERE inbound_source_data IS NOT NULL;
