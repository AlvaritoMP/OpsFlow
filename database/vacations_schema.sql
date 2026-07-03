-- ============================================
-- ESQUEMA: CONTROL DE VACACIONES (Régimen General Perú - 30 días/año)
-- ============================================

-- Saldo histórico pre-sistema por trabajador
CREATE TABLE IF NOT EXISTS vacation_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  historical_taken_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  annual_entitlement INTEGER NOT NULL DEFAULT 30,
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  UNIQUE(resource_id)
);

-- Días individuales gozados "a cuenta" (acumulables hasta mínimo 7 para papeleta)
CREATE TABLE IF NOT EXISTS vacation_day_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  vacation_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_batch'
    CHECK (status IN ('pending_batch', 'batched', 'cancelled')),
  papeleta_id UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE(resource_id, vacation_date)
);

-- Papeletas de vacaciones (documento formal de salida/retorno)
CREATE TABLE IF NOT EXISTS vacation_papeletas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  worker_name TEXT NOT NULL,
  worker_dni TEXT,
  unit_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  return_date DATE NOT NULL,
  calendar_days INTEGER NOT NULL CHECK (calendar_days >= 1),
  source_type TEXT NOT NULL DEFAULT 'direct'
    CHECK (source_type IN ('direct', 'accumulated')),
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft', 'issued', 'cancelled')),
  notes TEXT,
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  issued_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- FK de días acumulados hacia papeleta (después de crear vacation_papeletas)
ALTER TABLE vacation_day_entries
  DROP CONSTRAINT IF EXISTS vacation_day_entries_papeleta_id_fkey;

ALTER TABLE vacation_day_entries
  ADD CONSTRAINT vacation_day_entries_papeleta_id_fkey
  FOREIGN KEY (papeleta_id) REFERENCES vacation_papeletas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vacation_balances_resource ON vacation_balances(resource_id);
CREATE INDEX IF NOT EXISTS idx_vacation_day_entries_resource ON vacation_day_entries(resource_id);
CREATE INDEX IF NOT EXISTS idx_vacation_day_entries_status ON vacation_day_entries(status);
CREATE INDEX IF NOT EXISTS idx_vacation_day_entries_papeleta ON vacation_day_entries(papeleta_id);
CREATE INDEX IF NOT EXISTS idx_vacation_papeletas_resource ON vacation_papeletas(resource_id);
CREATE INDEX IF NOT EXISTS idx_vacation_papeletas_unit ON vacation_papeletas(unit_id);
CREATE INDEX IF NOT EXISTS idx_vacation_papeletas_dates ON vacation_papeletas(start_date, end_date);

-- ============================================
-- RLS (mismo patrón que opsflow_rls_permissive_for_app.sql)
-- ============================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vacation_balances',
    'vacation_day_entries',
    'vacation_papeletas'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'vacation_allow_all'
    ) THEN
      EXECUTE format($f$
        CREATE POLICY vacation_allow_all ON public.%I
        AS PERMISSIVE
        FOR ALL
        TO anon, authenticated
        USING (true)
        WITH CHECK (true)
      $f$, t);
    END IF;
  END LOOP;
END $$;
