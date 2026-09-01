-- Desbloqueo SIN deploy: el frontend actual sigue enviando uploaded_by.
-- El script anterior volvió a crear la FK a public.users; si el ID de sesión
-- de ese operador no está en public.users, el insert sigue fallando.
--
-- Este script:
-- 1) Muestra a qué tabla apunta la FK (diagnóstico)
-- 2) Quita CUALQUIER FK sobre uploaded_by (la subida deja de fallar)
-- 3) Si el ID no existe en public.users, lo guarda como NULL
--
-- Ejecutar en el SQL Editor de Supabase.

-- 1) Diagnóstico: ver a qué tabla apunta hoy
SELECT
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
  AND rel.relname = 'attendance_report_imports'
  AND c.contype = 'f'
  AND a.attname = 'uploaded_by';

ALTER TABLE public.attendance_report_imports
  ALTER COLUMN uploaded_by DROP NOT NULL;

-- 2) Quitar todas las FK de uploaded_by (no solo un nombre)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
    WHERE n.nspname = 'public'
      AND rel.relname = 'attendance_report_imports'
      AND c.contype = 'f'
      AND a.attname = 'uploaded_by'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.attendance_report_imports DROP CONSTRAINT %I',
      r.conname
    );
  END LOOP;
END $$;

-- 3) Antes de insertar: si el usuario no está en public.users, no bloquear
CREATE OR REPLACE FUNCTION public.attendance_imports_fix_uploaded_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.uploaded_by IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.uploaded_by) THEN
    NEW.uploaded_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_imports_fix_uploaded_by
  ON public.attendance_report_imports;

CREATE TRIGGER trg_attendance_imports_fix_uploaded_by
BEFORE INSERT OR UPDATE ON public.attendance_report_imports
FOR EACH ROW
EXECUTE FUNCTION public.attendance_imports_fix_uploaded_by();
