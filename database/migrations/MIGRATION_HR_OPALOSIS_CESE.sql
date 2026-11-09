-- Solicitudes de cese OpsFlow → Opalosis (POST /registro-cese).
-- Ejecutar en el SQL Editor del proyecto OpsFlow.
-- El cese en OpsFlow se guarda aunque Opalosis rechace o no responda.

CREATE TABLE IF NOT EXISTS public.hr_outbound_cese (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL,
    opsflow_unit_id UUID NULL,
    worker_name TEXT NOT NULL,
    documento TEXT NOT NULL DEFAULT '',
    fecha_cese DATE NOT NULL,
    motivo_cese_id INTEGER NULL,
    observaciones TEXT NULL,
    usuario_of TEXT NULL,
    personnel_status TEXT NULL,
    termination_reason TEXT NULL,
    request_payload JSONB NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'pendiente'
        CHECK (sync_status IN (
            'pendiente',
            'error_tecnico',
            'rechazo_negocio',
            'enviado',
            'rechazado_rrhh',
            'procesado'
        )),
    cese_id INTEGER NULL,
    cese_cod TEXT NULL,
    opalosis_estado TEXT NULL,
    opalosis_etapa TEXT NULL,
    mensaje TEXT NULL,
    http_status INTEGER NULL,
    opalosis_response JSONB NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.hr_outbound_cese IS
    'Solicitudes de cese enviadas desde OpsFlow a la bandeja de Opalosis';
COMMENT ON COLUMN public.hr_outbound_cese.sync_status IS
    'pendiente | error_tecnico (reintentar) | rechazo_negocio (Opalosis rechazó el POST) | enviado (en bandeja) | rechazado_rrhh | procesado';
COMMENT ON COLUMN public.hr_outbound_cese.cese_cod IS
    'Código de seguimiento Opalosis (ej. CES-210826-02)';
COMMENT ON COLUMN public.hr_outbound_cese.request_payload IS
    'Cuerpo enviado a POST /registro-cese';

CREATE INDEX IF NOT EXISTS idx_hr_outbound_cese_resource
    ON public.hr_outbound_cese (resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_outbound_cese_status
    ON public.hr_outbound_cese (sync_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_hr_outbound_cese_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hr_outbound_cese_updated_at
    ON public.hr_outbound_cese;

CREATE TRIGGER trg_hr_outbound_cese_updated_at
    BEFORE UPDATE ON public.hr_outbound_cese
    FOR EACH ROW
    EXECUTE FUNCTION public.set_hr_outbound_cese_updated_at();

ALTER TABLE public.hr_outbound_cese ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.hr_outbound_cese;

CREATE POLICY opsflow_allow_ops ON public.hr_outbound_cese
    AS PERMISSIVE
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
