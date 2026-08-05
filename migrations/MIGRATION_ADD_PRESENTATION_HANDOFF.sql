-- Migración: Handoff de presentación/entrevista (snapshotVersion 3)
-- Extiende recepción ATS sin romper el pipeline de contratación (v1 / purpose null).
-- Ejecutar en SQL Editor de Supabase OpsFlow.
-- Tras crear tablas nuevas, re-ejecutar opsflow_rls_permissive_for_app.sql si aplica.

-- ============================================
-- Columns en packages (purpose a nivel paquete)
-- ============================================
ALTER TABLE public.inbound_worker_handoff_packages
  ADD COLUMN IF NOT EXISTS purpose TEXT NULL;

COMMENT ON COLUMN public.inbound_worker_handoff_packages.purpose IS
  'presentation = bandeja entrevista; NULL = hire/legacy (Recepción ATS)';

CREATE INDEX IF NOT EXISTS idx_inbound_handoff_packages_purpose
  ON public.inbound_worker_handoff_packages (purpose)
  WHERE purpose IS NOT NULL;

-- ============================================
-- Columns en items (complementary + decisión)
-- ============================================
ALTER TABLE public.inbound_worker_handoff_items
  ADD COLUMN IF NOT EXISTS purpose TEXT NULL,
  ADD COLUMN IF NOT EXISTS snapshot_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS complementary JSONB NULL,
  ADD COLUMN IF NOT EXISTS complementary_status TEXT NULL
    CHECK (complementary_status IS NULL OR complementary_status IN ('complete', 'incomplete', 'missing')),
  ADD COLUMN IF NOT EXISTS complementary_filled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS complementary_missing_fields JSONB NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS decision_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS decided_by_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN public.inbound_worker_handoff_items.purpose IS
  'presentation | NULL (hire/legacy)';
COMMENT ON COLUMN public.inbound_worker_handoff_items.complementary IS
  'Ficha complementaria del candidato (snapshotVersion >= 3)';
COMMENT ON COLUMN public.inbound_worker_handoff_items.complementary_status IS
  'complete | incomplete | missing';

-- Ampliar item_status: hire + presentation
ALTER TABLE public.inbound_worker_handoff_items
  DROP CONSTRAINT IF EXISTS inbound_worker_handoff_items_item_status_check;

ALTER TABLE public.inbound_worker_handoff_items
  ADD CONSTRAINT inbound_worker_handoff_items_item_status_check
  CHECK (item_status IN (
    'pending',
    'accepted',
    'rejected',
    'assigned',
    'pending_interview',
    'in_review',
    'approved'
  ));

CREATE INDEX IF NOT EXISTS idx_inbound_handoff_items_purpose_status
  ON public.inbound_worker_handoff_items (purpose, item_status);

CREATE INDEX IF NOT EXISTS idx_inbound_handoff_items_presentation_pending
  ON public.inbound_worker_handoff_items (item_status, created_at DESC)
  WHERE purpose = 'presentation';

-- updated_at trigger for items
CREATE OR REPLACE FUNCTION public.set_inbound_handoff_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inbound_handoff_items_updated_at
  ON public.inbound_worker_handoff_items;

CREATE TRIGGER trg_inbound_handoff_items_updated_at
  BEFORE UPDATE ON public.inbound_worker_handoff_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_inbound_handoff_items_updated_at();

-- ============================================
-- Outbox de decisiones → ATS (stub / cola)
-- ============================================
CREATE TABLE IF NOT EXISTS public.inbound_handoff_decision_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_item_id UUID NOT NULL
    REFERENCES public.inbound_worker_handoff_items (id) ON DELETE CASCADE,
  source_package_id UUID NOT NULL,
  opsflow_package_id UUID NOT NULL
    REFERENCES public.inbound_worker_handoff_packages (id) ON DELETE CASCADE,
  source_candidate_id UUID NULL,
  source_process_id UUID NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'rejected')),
  decided_at TIMESTAMPTZ NOT NULL,
  decided_by_name TEXT NULL,
  reason TEXT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.inbound_handoff_decision_outbox IS
  'Eventos de aprobación/rechazo de presentaciones para callback al ATS (stub hasta existir endpoint)';

CREATE INDEX IF NOT EXISTS idx_inbound_handoff_decision_outbox_delivery
  ON public.inbound_handoff_decision_outbox (delivery_status, created_at);

DROP TRIGGER IF EXISTS trg_inbound_handoff_decision_outbox_updated_at
  ON public.inbound_handoff_decision_outbox;

CREATE TRIGGER trg_inbound_handoff_decision_outbox_updated_at
  BEFORE UPDATE ON public.inbound_handoff_decision_outbox
  FOR EACH ROW
  EXECUTE FUNCTION public.set_inbound_handoff_packages_updated_at();

-- RLS permisivo para la tabla nueva (alineado a opsflow_rls_permissive_for_app.sql)
ALTER TABLE public.inbound_handoff_decision_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.inbound_handoff_decision_outbox;
CREATE POLICY opsflow_allow_ops ON public.inbound_handoff_decision_outbox
  AS PERMISSIVE
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
