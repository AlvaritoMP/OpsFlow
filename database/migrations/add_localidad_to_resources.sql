-- Migración: Localidad del trabajador (recurso tipo Personal)
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS localidad TEXT NULL;

COMMENT ON COLUMN public.resources.localidad IS 'Localidad o lugar de referencia del trabajador (solo Personal)';
