-- ============================================
-- BPO: Contactos y cuentas bancarias por unidad
-- ============================================

CREATE TABLE IF NOT EXISTS unit_bpo_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('client', 'provider', 'support', 'other')),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  organization TEXT,
  role_title TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unit_bpo_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'own'
    CHECK (account_type IN ('own', 'provider', 'detraction')),
  bank_name TEXT NOT NULL,
  account_holder_name TEXT,
  account_number TEXT,
  interbank_account TEXT,
  currency TEXT NOT NULL DEFAULT 'PEN'
    CHECK (currency IN ('PEN', 'USD', 'EUR', 'OTHER')),
  currency_other TEXT,
  swift_code TEXT,
  provider_name TEXT,
  executive_name TEXT,
  executive_phone TEXT,
  executive_email TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unit_bpo_bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES unit_bpo_bank_accounts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  period_month TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_unit_bpo_contacts_unit ON unit_bpo_contacts(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_bpo_bank_accounts_unit ON unit_bpo_bank_accounts(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_bpo_bank_statements_account ON unit_bpo_bank_statements(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_unit_bpo_bank_statements_unit ON unit_bpo_bank_statements(unit_id);
