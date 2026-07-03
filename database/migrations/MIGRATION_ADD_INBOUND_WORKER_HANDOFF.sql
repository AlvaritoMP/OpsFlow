-- Migración: Recepción de paquetes de trabajadores enviados desde Opalo ATS
-- Descripción: Tablas para ingesta vía API (Edge Function) y bandeja operativa en OpsFlow.
-- NOTA: Tras ejecutar, correr opsflow_rls_permissive_for_app.sql si las tablas nuevas no tienen políticas RLS.

-- ============================================
-- Paquetes recibidos desde ATS
-- ============================================
CREATE TABLE IF NOT EXISTS public.inbound_worker_handoff_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_app TEXT NOT NULL DEFAULT 'Opalo ATS',
    source_package_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'received'
        CHECK (status IN ('received', 'processing', 'completed', 'rejected', 'partially_completed')),
    worker_count INTEGER NOT NULL,
    sender_note TEXT NULL,
    source_created_by_name TEXT NULL,
    source_sent_at TIMESTAMPTZ NOT NULL,
    payload_version INTEGER NOT NULL DEFAULT 1,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    receiver_note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT inbound_worker_handoff_packages_source_package_id_key
        UNIQUE (source_package_id)
);

COMMENT ON TABLE public.inbound_worker_handoff_packages IS
    'Paquetes de trabajadores enviados manualmente desde Opalo ATS hacia OpsFlow';
COMMENT ON COLUMN public.inbound_worker_handoff_packages.source_package_id IS
    'UUID del paquete en la BD del ATS (trazabilidad, sin FK externa)';
COMMENT ON COLUMN public.inbound_worker_handoff_packages.status IS
    'received → processing → completed | rejected | partially_completed';

CREATE INDEX IF NOT EXISTS idx_inbound_handoff_packages_status_sent
    ON public.inbound_worker_handoff_packages (status, source_sent_at DESC);

-- ============================================
-- Ítems (trabajadores) dentro de cada paquete
-- ============================================
CREATE TABLE IF NOT EXISTS public.inbound_worker_handoff_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL,
    source_candidate_id UUID NULL,
    source_process_id UUID NULL,
    worker_name TEXT NOT NULL,
    worker_snapshot JSONB NOT NULL,
    item_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (item_status IN ('pending', 'accepted', 'rejected', 'assigned')),
    assigned_work_unit_id UUID NULL,
    assigned_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT inbound_worker_handoff_items_package_id_fkey
        FOREIGN KEY (package_id)
        REFERENCES public.inbound_worker_handoff_packages (id)
        ON DELETE CASCADE
);

COMMENT ON TABLE public.inbound_worker_handoff_items IS
    'Trabajadores incluidos en un paquete de recepción ATS';
COMMENT ON COLUMN public.inbound_worker_handoff_items.worker_snapshot IS
    'Snapshot inmutable enviado por ATS (identity + fields + meta, payload_version 1)';
COMMENT ON COLUMN public.inbound_worker_handoff_items.assigned_work_unit_id IS
    'Fase 2: unidad OpsFlow asignada al trabajador';

CREATE INDEX IF NOT EXISTS idx_inbound_handoff_items_package_id
    ON public.inbound_worker_handoff_items (package_id);

-- Trigger updated_at en packages
CREATE OR REPLACE FUNCTION public.set_inbound_handoff_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inbound_handoff_packages_updated_at
    ON public.inbound_worker_handoff_packages;

CREATE TRIGGER trg_inbound_handoff_packages_updated_at
    BEFORE UPDATE ON public.inbound_worker_handoff_packages
    FOR EACH ROW
    EXECUTE FUNCTION public.set_inbound_handoff_packages_updated_at();
