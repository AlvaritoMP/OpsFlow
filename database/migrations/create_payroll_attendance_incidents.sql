-- Faltas de asistencia reportadas desde Mattermost (/falta).
-- El modal nativo no admite archivos: las fotos/CITT llegan como respuestas al hilo
-- y se vinculan al expediente (attachments JSONB + tabla relacional).

CREATE TABLE IF NOT EXISTS public.payroll_attendance_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  incident_type TEXT NOT NULL
    CHECK (incident_type IN (
      'INASISTENCIA',
      'TARDANZA',
      'DESCANSO_MEDICO_INICIAL',
      'PERMISO_LICENCIA'
    )),
  incident_reason TEXT NOT NULL
    CHECK (incident_reason IN (
      'SALUD_EMERGENCIA',
      'PROBLEMA_PERSONAL',
      'TRAMITE_DOCUMENTARIO',
      'SIN_COMUNICACION',
      'OPERATIVO_TRASLADO'
    )),
  has_coverage TEXT NOT NULL
    CHECK (has_coverage IN ('CON_COBERTURA', 'SIN_COBERTURA', 'NO_APLICA')),
  status TEXT NOT NULL DEFAULT 'PENDING_JUSTIFICATION'
    CHECK (status IN (
      'PENDING_JUSTIFICATION',
      'MEDICAL_REST',
      'LEAVE_OR_PERMIT',
      'UNJUSTIFIED_ABSENCE'
    )),
  incident_date DATE NOT NULL DEFAULT ((timezone('America/Lima', now()))::date),
  observations TEXT NULL,
  reported_by TEXT NULL,
  reported_by_user_id TEXT NULL,
  mattermost_post_id TEXT NULL,
  mattermost_channel_id TEXT NULL,
  mattermost_team_id TEXT NULL,
  mattermost_permalink TEXT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payroll_attendance_incidents IS
  'Incidencias de asistencia registradas por supervisores vía slash command Mattermost /falta.';
COMMENT ON COLUMN public.payroll_attendance_incidents.employee_id IS
  'FK a resources (operario).';
COMMENT ON COLUMN public.payroll_attendance_incidents.has_coverage IS
  'CON_COBERTURA | SIN_COBERTURA | NO_APLICA';
COMMENT ON COLUMN public.payroll_attendance_incidents.status IS
  'PENDING_JUSTIFICATION al crear; RRHH reclasifica a MEDICAL_REST, LEAVE_OR_PERMIT o UNJUSTIFIED_ABSENCE.';
COMMENT ON COLUMN public.payroll_attendance_incidents.mattermost_post_id IS
  'Post raíz del hilo en Mattermost; las fotos se adjuntan respondiendo a este post.';
COMMENT ON COLUMN public.payroll_attendance_incidents.attachments IS
  'Espejo JSON de sustentos (url, nombre, mime) para lectura rápida en el expediente.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_attendance_incidents_post_id
  ON public.payroll_attendance_incidents(mattermost_post_id)
  WHERE mattermost_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_attendance_incidents_unit_date
  ON public.payroll_attendance_incidents(unit_id, incident_date DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_attendance_incidents_employee_date
  ON public.payroll_attendance_incidents(employee_id, incident_date DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_attendance_incidents_status
  ON public.payroll_attendance_incidents(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payroll_attendance_incident_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.payroll_attendance_incidents(id) ON DELETE CASCADE,
  mattermost_file_id TEXT NOT NULL,
  mattermost_post_id TEXT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  uploaded_by_username TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_attendance_incident_attachments_file_unique UNIQUE (mattermost_file_id)
);

COMMENT ON TABLE public.payroll_attendance_incident_attachments IS
  'Sustentos fotográficos/PDF descargados del hilo de Mattermost y guardados en Storage.';

CREATE INDEX IF NOT EXISTS idx_payroll_attendance_incident_attachments_incident
  ON public.payroll_attendance_incident_attachments(incident_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.payroll_attendance_incidents_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_attendance_incidents_updated_at
  ON public.payroll_attendance_incidents;
CREATE TRIGGER trg_payroll_attendance_incidents_updated_at
  BEFORE UPDATE ON public.payroll_attendance_incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.payroll_attendance_incidents_set_updated_at();

ALTER TABLE public.payroll_attendance_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_attendance_incident_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.payroll_attendance_incidents;
CREATE POLICY opsflow_allow_ops ON public.payroll_attendance_incidents
  AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS opsflow_allow_ops ON public.payroll_attendance_incident_attachments;
CREATE POLICY opsflow_allow_ops ON public.payroll_attendance_incident_attachments
  AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Bucket de sustentos (fotos / CITT). Si no hay permiso sobre storage, créelo en el Dashboard.
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'attendance-incident-attachments',
    'attendance-incident-attachments',
    true,
    10485760,
    ARRAY[
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/gif',
      'image/webp',
      'application/pdf'
    ]
  )
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sin permiso para crear el bucket. Créelo en Storage: attendance-incident-attachments';
  WHEN undefined_table THEN
    RAISE NOTICE 'storage.buckets no existe en este entorno.';
END $$;
