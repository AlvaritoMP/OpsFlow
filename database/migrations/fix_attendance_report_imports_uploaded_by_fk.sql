-- La app autentica contra public.users, no auth.users.
-- Si uploaded_by apunta a auth.users(id), subir asistencia falla para
-- operadores creados en OpsFlow (existen en public.users, no en Auth):
--   attendance_report_imports_uploaded_by_fkey
--
-- Ejecutar en el SQL Editor de Supabase.

ALTER TABLE public.attendance_report_imports
  ALTER COLUMN uploaded_by DROP NOT NULL;

ALTER TABLE public.attendance_report_imports
  DROP CONSTRAINT IF EXISTS attendance_report_imports_uploaded_by_fkey;

UPDATE public.attendance_report_imports i
SET uploaded_by = NULL
WHERE uploaded_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = i.uploaded_by);

ALTER TABLE public.attendance_report_imports
  ADD CONSTRAINT attendance_report_imports_uploaded_by_fkey
  FOREIGN KEY (uploaded_by)
  REFERENCES public.users(id)
  ON DELETE SET NULL;
