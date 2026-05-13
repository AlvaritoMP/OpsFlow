-- Columnas explícitas del reporte OPALO (marcación día + 4 turnos por fila).

ALTER TABLE public.attendance_report_rows
  ADD COLUMN IF NOT EXISTS mark_date date,
  ADD COLUMN IF NOT EXISTS punch_arrival text,
  ADD COLUMN IF NOT EXISTS punch_lunch_out text,
  ADD COLUMN IF NOT EXISTS punch_lunch_in text,
  ADD COLUMN IF NOT EXISTS punch_departure text;

COMMENT ON COLUMN public.attendance_report_rows.mark_date IS 'Día efectivo del registro tomado del Excel (p. ej. columna Dia), ISO en la app.';
COMMENT ON COLUMN public.attendance_report_rows.punch_arrival IS 'Primera marca: Llegada';
COMMENT ON COLUMN public.attendance_report_rows.punch_lunch_out IS 'Salida almuerzo';
COMMENT ON COLUMN public.attendance_report_rows.punch_lunch_in IS 'Regreso almuerzo';
COMMENT ON COLUMN public.attendance_report_rows.punch_departure IS 'Salida';
