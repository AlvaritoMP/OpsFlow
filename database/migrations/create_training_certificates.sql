-- Catálogo de temas de capacitación y certificados / actas emitidos.
-- El certificado queda en el récord del trabajador (tabla trainings, certificate_url = código).
-- Ejecutar en el SQL Editor de Supabase antes de usar la sección Capacitaciones.

CREATE TABLE IF NOT EXISTS public.training_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    hours NUMERIC(6, 2),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.training_topic_positions (
    topic_id UUID NOT NULL REFERENCES public.training_topics(id) ON DELETE CASCADE,
    position_id UUID NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
    PRIMARY KEY (topic_id, position_id)
);

CREATE TABLE IF NOT EXISTS public.training_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    document_type TEXT NOT NULL CHECK (document_type IN ('certificado', 'acta')),
    topic_id UUID REFERENCES public.training_topics(id) ON DELETE SET NULL,
    topic_name TEXT NOT NULL,
    description TEXT,
    hours NUMERIC(6, 2),
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    worker_name TEXT NOT NULL,
    worker_dni TEXT,
    position_name TEXT,
    unit_name TEXT NOT NULL,
    client_name TEXT,
    training_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Completado',
    score NUMERIC(5, 2),
    instructor TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_certificates_unit_date
    ON public.training_certificates(unit_id, training_date DESC);

CREATE INDEX IF NOT EXISTS idx_training_certificates_resource
    ON public.training_certificates(resource_id, training_date DESC);

CREATE INDEX IF NOT EXISTS idx_training_topic_positions_position
    ON public.training_topic_positions(position_id);

COMMENT ON TABLE public.training_topics IS 'Temas de capacitación. Pueden asociarse a uno o varios puestos.';
COMMENT ON TABLE public.training_certificates IS 'Certificado o acta emitido a un trabajador. El código se guarda también en trainings.certificate_url.';

ALTER TABLE public.training_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_topic_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.training_topics;
CREATE POLICY opsflow_allow_ops ON public.training_topics
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS opsflow_allow_ops ON public.training_topic_positions;
CREATE POLICY opsflow_allow_ops ON public.training_topic_positions
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS opsflow_allow_ops ON public.training_certificates;
CREATE POLICY opsflow_allow_ops ON public.training_certificates
    AS PERMISSIVE FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);
