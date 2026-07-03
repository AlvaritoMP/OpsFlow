-- Migración: Teléfono del trabajador (recurso tipo Personal)
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS phone TEXT NULL;

COMMENT ON COLUMN public.resources.phone IS 'Teléfono de contacto del trabajador (solo Personal)';
