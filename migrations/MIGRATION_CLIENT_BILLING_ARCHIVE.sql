-- Archivo de liquidaciones históricas.
-- No crea una orden en OpaloSis. Sirve como base al armar una liquidación nueva.
-- Ejecutar en el SQL editor de Supabase cuando MIGRATION_CLIENT_BILLING.sql ya existe.

ALTER TABLE public.client_billings
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

ALTER TABLE public.client_billings
    ADD COLUMN IF NOT EXISTS archived_by_name TEXT NULL;

COMMENT ON COLUMN public.client_billings.archived_at IS 'Cuándo se guardó en el archivo histórico, sin emitir orden en OpaloSis';
COMMENT ON COLUMN public.client_billings.archived_by_name IS 'Quién archivó la liquidación';

DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'client_billings'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.client_billings DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

ALTER TABLE public.client_billings
    ADD CONSTRAINT client_billings_status_check
    CHECK (status IN ('draft', 'issued', 'void', 'archived'));
