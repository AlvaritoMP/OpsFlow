-- Un mes puede tener varias liquidaciones de la misma unidad.
-- Ejecutar en el SQL editor de Supabase.

DROP INDEX IF EXISTS public.uq_client_billings_active_period;
