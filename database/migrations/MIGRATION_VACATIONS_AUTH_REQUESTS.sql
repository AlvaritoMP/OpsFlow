-- ============================================
-- Solicitudes de autorización vacacional (flujo asíncrono)
-- ============================================
-- Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS vacation_authorization_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  request_type TEXT NOT NULL
    CHECK (request_type IN ('create_papeleta', 'cancel_papeleta', 'cancel_day_entry')),
  requester_id UUID NOT NULL REFERENCES users(id),
  assigned_authorizer_id UUID NOT NULL REFERENCES users(id),
  resource_id UUID,
  unit_id UUID,
  payload JSONB NOT NULL DEFAULT '{}',
  justification TEXT,
  rejection_reason TEXT,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_var_pending_authorizer
  ON vacation_authorization_requests (assigned_authorizer_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_var_pending_requester
  ON vacation_authorization_requests (requester_id, created_at DESC)
  WHERE status = 'pending';

COMMENT ON TABLE vacation_authorization_requests IS
  'Cola de autorizaciones vacacionales: goce >7 días y anulaciones';

ALTER TABLE vacation_authorization_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vacation_authorization_requests'
      AND policyname = 'vacation_auth_requests_allow_all'
  ) THEN
    CREATE POLICY vacation_auth_requests_allow_all ON vacation_authorization_requests
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
