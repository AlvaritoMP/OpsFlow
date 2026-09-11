-- Vacaciones: FKs de auditoría (updated_by, created_by, issued_by, etc.)
-- La app autentica contra public.users, no auth.users.
-- Si esas columnas apuntan a auth.users(id), guardar saldo histórico falla:
--   vacation_balances_updated_by_fkey
--
-- Ejecutar en el SQL Editor de Supabase.

-- 1) Diagnóstico
SELECT
  rel.relname AS table_name,
  a.attname AS column_name,
  c.conname AS constraint_name,
  ns.nspname AS referenced_schema,
  conf.relname AS referenced_table
FROM pg_constraint c
JOIN pg_class rel ON rel.oid = c.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
JOIN pg_class conf ON conf.oid = c.confrelid
JOIN pg_namespace ns ON ns.oid = conf.relnamespace
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
WHERE n.nspname = 'public'
  AND rel.relname IN ('vacation_balances', 'vacation_day_entries', 'vacation_papeletas')
  AND c.contype = 'f'
  AND a.attname IN ('updated_by', 'created_by', 'issued_by', 'cancelled_by', 'authorized_by')
ORDER BY rel.relname, a.attname;

DO $$
DECLARE
  r RECORD;
  cols text[] := ARRAY['updated_by', 'created_by', 'issued_by', 'cancelled_by', 'authorized_by'];
  t text;
  col text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vacation_balances', 'vacation_day_entries', 'vacation_papeletas']
  LOOP
    FOREACH col IN ARRAY cols
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = t
          AND column_name = col
      ) THEN
        CONTINUE;
      END IF;

      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', t, col);

      FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class rel ON rel.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = ANY (c.conkey)
        WHERE n.nspname = 'public'
          AND rel.relname = t
          AND c.contype = 'f'
          AND a.attname = col
          AND array_length(c.conkey, 1) = 1
      LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, r.conname);
      END LOOP;

      EXECUTE format(
        'UPDATE public.%I SET %I = NULL WHERE %I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = public.%I.%I)',
        t, col, col, t, col
      );

      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.users(id) ON DELETE SET NULL',
        t,
        t || '_' || col || '_fkey',
        col
      );
    END LOOP;
  END LOOP;
END $$;

-- 2) Si el ID de sesión no está en public.users, no bloquear el guardado
CREATE OR REPLACE FUNCTION public.vacation_fix_user_audit_fks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'vacation_balances' THEN
    IF NEW.updated_by IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.updated_by) THEN
      NEW.updated_by := NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'vacation_day_entries' THEN
    IF NEW.created_by IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.created_by) THEN
      NEW.created_by := NULL;
    END IF;
    IF NEW.updated_by IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.updated_by) THEN
      NEW.updated_by := NULL;
    END IF;
    IF NEW.cancelled_by IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.cancelled_by) THEN
      NEW.cancelled_by := NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'vacation_papeletas' THEN
    IF NEW.issued_by IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.issued_by) THEN
      NEW.issued_by := NULL;
    END IF;
    IF NEW.updated_by IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.updated_by) THEN
      NEW.updated_by := NULL;
    END IF;
    IF NEW.cancelled_by IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.cancelled_by) THEN
      NEW.cancelled_by := NULL;
    END IF;
    IF NEW.authorized_by IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.authorized_by) THEN
      NEW.authorized_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vacation_balances_fix_user_fks ON public.vacation_balances;
CREATE TRIGGER trg_vacation_balances_fix_user_fks
BEFORE INSERT OR UPDATE ON public.vacation_balances
FOR EACH ROW
EXECUTE FUNCTION public.vacation_fix_user_audit_fks();

DROP TRIGGER IF EXISTS trg_vacation_day_entries_fix_user_fks ON public.vacation_day_entries;
CREATE TRIGGER trg_vacation_day_entries_fix_user_fks
BEFORE INSERT OR UPDATE ON public.vacation_day_entries
FOR EACH ROW
EXECUTE FUNCTION public.vacation_fix_user_audit_fks();

DROP TRIGGER IF EXISTS trg_vacation_papeletas_fix_user_fks ON public.vacation_papeletas;
CREATE TRIGGER trg_vacation_papeletas_fix_user_fks
BEFORE INSERT OR UPDATE ON public.vacation_papeletas
FOR EACH ROW
EXECUTE FUNCTION public.vacation_fix_user_audit_fks();
