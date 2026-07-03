-- Migración: Integración OpsFlow → Opalosis (RRHH) — cola diaria y envío por paquetes
-- Ejecutar en el SQL Editor del proyecto OpsFlow.
-- Recomendado después: opsflow_rls_permissive_for_app.sql
--
-- Si ejecutó una versión anterior con hr_ingreso_submissions, puede eliminarla:
--   DROP TABLE IF EXISTS public.hr_ingreso_submissions CASCADE;

-- ============================================
-- Cola de ingresos pendientes de envío a Opalosis
-- (se alimenta al asignar candidato ATS → unidad)
-- ============================================
CREATE TABLE IF NOT EXISTS public.hr_outbound_ingreso_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL,
    inbound_handoff_item_id UUID NULL,
    opsflow_unit_id UUID NOT NULL,
    worker_name TEXT NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    worker_snapshot JSONB NOT NULL,
    hr_fields JSONB NULL,
    ref_operaciones TEXT NOT NULL,
    queue_status TEXT NOT NULL DEFAULT 'pendiente_envio'
        CHECK (queue_status IN ('pendiente_envio', 'incluido_paquete', 'excluido')),
    package_id UUID NULL,
    exclusion_note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT hr_outbound_ingreso_queue_resource_id_key UNIQUE (resource_id),
    CONSTRAINT hr_outbound_ingreso_queue_ref_operaciones_key UNIQUE (ref_operaciones)
);

COMMENT ON TABLE public.hr_outbound_ingreso_queue IS
    'Trabajadores asignados desde ATS pendientes de envío a Opalosis';
COMMENT ON COLUMN public.hr_outbound_ingreso_queue.worker_snapshot IS
    'Snapshot completo OpsFlow + ATS para envío a RRHH';
COMMENT ON COLUMN public.hr_outbound_ingreso_queue.hr_fields IS
    'Campos mapeados al contrato Opalosis (referencial)';

CREATE INDEX IF NOT EXISTS idx_hr_outbound_queue_status_date
    ON public.hr_outbound_ingreso_queue (queue_status, report_date DESC);

CREATE INDEX IF NOT EXISTS idx_hr_outbound_queue_package_id
    ON public.hr_outbound_ingreso_queue (package_id)
    WHERE package_id IS NOT NULL;

-- ============================================
-- Paquetes enviados a Opalosis (reporte diario / batch)
-- ============================================
CREATE TABLE IF NOT EXISTS public.hr_outbound_ingreso_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_package_id UUID NOT NULL,
    report_date DATE NOT NULL,
    worker_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendiente'
        CHECK (status IN (
            'pendiente', 'enviado', 'simulado', 'error',
            'procesado', 'observado', 'rechazado', 'parcialmente_procesado'
        )),
    sender_note TEXT NULL,
    sent_by_name TEXT NULL,
    sent_at TIMESTAMPTZ NULL,
    fecha_recepcion TIMESTAMPTZ NULL,
    opalosis_response JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT hr_outbound_ingreso_packages_source_package_id_key
        UNIQUE (source_package_id)
);

COMMENT ON TABLE public.hr_outbound_ingreso_packages IS
    'Paquetes de ingresos enviados desde OpsFlow hacia la bandeja de Opalosis';

CREATE INDEX IF NOT EXISTS idx_hr_outbound_packages_status_sent
    ON public.hr_outbound_ingreso_packages (status, sent_at DESC NULLS LAST);

-- ============================================
-- Ítems incluidos en cada paquete enviado
-- ============================================
CREATE TABLE IF NOT EXISTS public.hr_outbound_ingreso_package_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL,
    queue_item_id UUID NULL,
    ref_operaciones TEXT NOT NULL,
    resource_id UUID NOT NULL,
    worker_name TEXT NOT NULL,
    worker_snapshot JSONB NOT NULL,
    hr_fields JSONB NULL,
    item_status TEXT NOT NULL DEFAULT 'pendiente'
        CHECK (item_status IN ('pendiente', 'procesado', 'observado', 'rechazado')),
    mensaje TEXT NULL,
    empleado_id_rrhh INTEGER NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT hr_outbound_ingreso_package_items_package_id_fkey
        FOREIGN KEY (package_id)
        REFERENCES public.hr_outbound_ingreso_packages (id)
        ON DELETE CASCADE,
    CONSTRAINT hr_outbound_ingreso_package_items_queue_item_id_fkey
        FOREIGN KEY (queue_item_id)
        REFERENCES public.hr_outbound_ingreso_queue (id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_hr_outbound_package_items_package_id
    ON public.hr_outbound_ingreso_package_items (package_id);

-- FK queue → package (después de crear packages)
ALTER TABLE public.hr_outbound_ingreso_queue
    DROP CONSTRAINT IF EXISTS hr_outbound_ingreso_queue_package_id_fkey;

ALTER TABLE public.hr_outbound_ingreso_queue
    ADD CONSTRAINT hr_outbound_ingreso_queue_package_id_fkey
        FOREIGN KEY (package_id)
        REFERENCES public.hr_outbound_ingreso_packages (id)
        ON DELETE SET NULL;

-- ============================================
-- Cache GET /api/unidades (Opalosis)
-- ============================================
CREATE TABLE IF NOT EXISTS public.hr_units_cache (
    opalosis_unidad_id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Mapeo unidad OpsFlow ↔ unidad Opalosis
-- ============================================
CREATE TABLE IF NOT EXISTS public.hr_unit_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opsflow_unit_id UUID NOT NULL,
    opalosis_unidad_id INTEGER NOT NULL,
    opalosis_unidad_nombre TEXT NULL,
    empresa_codigo INTEGER NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT hr_unit_mappings_opsflow_unit_id_key UNIQUE (opsflow_unit_id)
);

-- Triggers updated_at
CREATE OR REPLACE FUNCTION public.set_hr_outbound_ingreso_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hr_outbound_ingreso_queue_updated_at
    ON public.hr_outbound_ingreso_queue;

CREATE TRIGGER trg_hr_outbound_ingreso_queue_updated_at
    BEFORE UPDATE ON public.hr_outbound_ingreso_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.set_hr_outbound_ingreso_queue_updated_at();

CREATE OR REPLACE FUNCTION public.set_hr_outbound_ingreso_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hr_outbound_ingreso_packages_updated_at
    ON public.hr_outbound_ingreso_packages;

CREATE TRIGGER trg_hr_outbound_ingreso_packages_updated_at
    BEFORE UPDATE ON public.hr_outbound_ingreso_packages
    FOR EACH ROW
    EXECUTE FUNCTION public.set_hr_outbound_ingreso_packages_updated_at();

CREATE OR REPLACE FUNCTION public.set_hr_unit_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hr_unit_mappings_updated_at
    ON public.hr_unit_mappings;

CREATE TRIGGER trg_hr_unit_mappings_updated_at
    BEFORE UPDATE ON public.hr_unit_mappings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_hr_unit_mappings_updated_at();
