-- Evidencia fotográfica al registrar llegada de supervisión de campo
ALTER TABLE public.supervision_visits
  ADD COLUMN IF NOT EXISTS evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.supervision_visits.evidence_urls IS 'URLs de fotos de evidencia al check-in';
