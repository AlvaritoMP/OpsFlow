-- Comentario manual del usuario sobre la marca (tras importar el Excel; distinto de `notes` del archivo)
ALTER TABLE public.attendance_report_rows
  ADD COLUMN IF NOT EXISTS user_comment TEXT NULL;

COMMENT ON COLUMN public.attendance_report_rows.user_comment IS 'Comentario del usuario en OpsFlow sobre esta marca (ej. explicar marcación incompleta)';
