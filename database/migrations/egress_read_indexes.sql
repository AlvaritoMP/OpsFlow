-- Índices para las lecturas acotadas por fecha / unidad / estado.
-- Versión para el SQL editor de Supabase: ese editor envuelve el script
-- en una transacción, y CREATE INDEX CONCURRENTLY no puede correr ahí.
-- Estas sentencias sí. Bloquean escrituras en cada tabla solo mientras
-- se construye el índice (segundos en tablas operativas).

CREATE INDEX IF NOT EXISTS idx_operational_logs_unit_date
  ON public.operational_logs (unit_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_client_requests_unit_status_date
  ON public.client_requests (unit_id, status, date DESC);

CREATE INDEX IF NOT EXISTS idx_vacation_papeletas_unit_range
  ON public.vacation_papeletas (unit_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_vacation_day_entries_unit_date
  ON public.vacation_day_entries (unit_id, vacation_date DESC);

CREATE INDEX IF NOT EXISTS idx_night_supervision_shifts_date
  ON public.night_supervision_shifts (date DESC, unit_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resources_unit_type_active
  ON public.resources (unit_id, type)
  WHERE archived IS NOT TRUE;

-- daily_shifts ya tiene UNIQUE (resource_id, date), que cubre el filtro del roster.
-- attendance_tareo_novedades, attendance_worker_marks y payroll_attendance_incidents
-- ya indexan (unit_id, fecha).
