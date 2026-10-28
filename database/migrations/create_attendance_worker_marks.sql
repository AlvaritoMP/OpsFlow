-- Registro permanente de marcación por trabajador y día.
-- El Excel de asistencia solo carga este registro. Consolidado, evolución,
-- tareo y facturación leen aquí, no vuelven a abrir los archivos importados.
-- Borrar una importación no borra las marcas ya guardadas.

CREATE TABLE IF NOT EXISTS public.attendance_worker_marks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    mark_date DATE NOT NULL,
    attendance_status TEXT NULL,
    minutes_late INTEGER NULL,
    notes TEXT NULL,
    user_comment TEXT NULL,
    punch_arrival TEXT NULL,
    punch_lunch_out TEXT NULL,
    punch_lunch_in TEXT NULL,
    punch_departure TEXT NULL,
    dni TEXT NULL,
    normalized_dni TEXT NULL,
    worker_name TEXT NULL,
    source_import_id UUID NULL REFERENCES public.attendance_report_imports(id) ON DELETE SET NULL,
    source_row_id UUID NULL REFERENCES public.attendance_report_rows(id) ON DELETE SET NULL,
    source_filename TEXT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attendance_worker_marks_unit_resource_day_unique UNIQUE (unit_id, resource_id, mark_date)
);

COMMENT ON TABLE public.attendance_worker_marks IS 'Marcación vigente de cada trabajador y día. Los Excel son solo el insumo de carga.';
COMMENT ON COLUMN public.attendance_worker_marks.uploaded_at IS 'Momento de la importación que dejó esta marca. Una carga más nueva del mismo día la reemplaza.';

CREATE INDEX IF NOT EXISTS idx_attendance_worker_marks_unit_day
    ON public.attendance_worker_marks(unit_id, mark_date);

CREATE INDEX IF NOT EXISTS idx_attendance_worker_marks_resource_day
    ON public.attendance_worker_marks(resource_id, mark_date);

ALTER TABLE public.attendance_worker_marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.attendance_worker_marks;
CREATE POLICY opsflow_allow_ops ON public.attendance_worker_marks
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

-- Copia lo ya importado: por trabajador y día queda la carga más reciente.
INSERT INTO public.attendance_worker_marks (
    unit_id,
    resource_id,
    mark_date,
    attendance_status,
    minutes_late,
    notes,
    user_comment,
    punch_arrival,
    punch_lunch_out,
    punch_lunch_in,
    punch_departure,
    dni,
    normalized_dni,
    worker_name,
    source_import_id,
    source_row_id,
    source_filename,
    uploaded_at
)
SELECT DISTINCT ON (i.unit_id, r.matched_resource_id, COALESCE(r.mark_date, i.report_date))
    i.unit_id,
    r.matched_resource_id,
    COALESCE(r.mark_date, i.report_date),
    r.attendance_status,
    r.minutes_late,
    r.notes,
    r.user_comment,
    r.punch_arrival,
    r.punch_lunch_out,
    r.punch_lunch_in,
    r.punch_departure,
    r.dni,
    r.normalized_dni,
    r.worker_name,
    i.id,
    r.id,
    i.source_filename,
    i.uploaded_at
FROM public.attendance_report_rows r
JOIN public.attendance_report_imports i ON i.id = r.import_id
WHERE r.matched_resource_id IS NOT NULL
  AND COALESCE(r.mark_date, i.report_date) IS NOT NULL
ORDER BY
    i.unit_id,
    r.matched_resource_id,
    COALESCE(r.mark_date, i.report_date),
    i.uploaded_at DESC,
    r.row_index DESC
ON CONFLICT (unit_id, resource_id, mark_date) DO UPDATE SET
    attendance_status = EXCLUDED.attendance_status,
    minutes_late = EXCLUDED.minutes_late,
    notes = EXCLUDED.notes,
    user_comment = COALESCE(public.attendance_worker_marks.user_comment, EXCLUDED.user_comment),
    punch_arrival = EXCLUDED.punch_arrival,
    punch_lunch_out = EXCLUDED.punch_lunch_out,
    punch_lunch_in = EXCLUDED.punch_lunch_in,
    punch_departure = EXCLUDED.punch_departure,
    dni = EXCLUDED.dni,
    normalized_dni = EXCLUDED.normalized_dni,
    worker_name = EXCLUDED.worker_name,
    source_import_id = EXCLUDED.source_import_id,
    source_row_id = EXCLUDED.source_row_id,
    source_filename = EXCLUDED.source_filename,
    uploaded_at = EXCLUDED.uploaded_at,
    updated_at = now()
WHERE EXCLUDED.uploaded_at >= public.attendance_worker_marks.uploaded_at;
