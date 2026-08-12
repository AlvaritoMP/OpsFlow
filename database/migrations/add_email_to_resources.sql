-- Migración: Correo electrónico del trabajador (recurso tipo Personal)
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS email TEXT NULL;

COMMENT ON COLUMN public.resources.email IS 'Correo electrónico de contacto del trabajador (solo Personal)';
