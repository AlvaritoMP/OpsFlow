-- DNI del usuario de OpsFlow. Se envía a OpaloSis como documentoMaker al emitir una liquidación.
-- Ejecutar en el SQL editor de Supabase.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS dni TEXT;

COMMENT ON COLUMN public.users.dni IS 'Documento de identidad del usuario (8 a 20 caracteres). documentoMaker al registrar una OS.';
