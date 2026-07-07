-- Expediente ampliado de personal para unidades BPO

CREATE TABLE IF NOT EXISTS resource_bpo_profiles (
  resource_id UUID PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  nationality TEXT,
  address TEXT,
  marital_status TEXT CHECK (marital_status IS NULL OR marital_status IN (
    'soltero', 'casado', 'conviviente', 'divorciado', 'viudo', 'otro'
  )),
  gender TEXT,
  afp_name TEXT,
  afp_affiliation_date DATE,
  afp_email TEXT,
  afp_cuspp TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  education_level TEXT CHECK (education_level IS NULL OR education_level IN (
    'sin_estudios', 'primaria', 'secundaria', 'tecnico',
    'universitario_incompleto', 'universitario_completo', 'postgrado', 'otro'
  )),
  education_institution TEXT,
  education_career TEXT,
  education_completion_year INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resource_bpo_dependents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (relationship IN (
    'conyuge', 'hijo', 'hija', 'padre', 'madre', 'hermano', 'hermana', 'otro'
  )),
  full_name TEXT NOT NULL,
  document_type TEXT DEFAULT 'DNI',
  document_number TEXT,
  birth_date DATE,
  is_dependent BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resource_bpo_personnel_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  dependent_id UUID REFERENCES resource_bpo_dependents(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'otro' CHECK (category IN (
    'dni_trabajador', 'dni_familiar', 'constancia', 'afp', 'educacion', 'otro'
  )),
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_resource_bpo_profiles_unit ON resource_bpo_profiles(unit_id);
CREATE INDEX IF NOT EXISTS idx_resource_bpo_dependents_resource ON resource_bpo_dependents(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_bpo_personnel_docs_resource ON resource_bpo_personnel_documents(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_bpo_personnel_docs_dependent ON resource_bpo_personnel_documents(dependent_id);
