-- ============================================
-- MIGRACIÓN: Metadatos de Headcount en units
-- ============================================
-- Almacena preventivo FDM y observaciones por cargo,
-- editables desde la vista Headcount a criterio del usuario.
-- Formato:
-- [
--   {
--     "positionId": "uuid",
--     "preventivo": { "Day": 0, "Afternoon": 0, "Night": 0 },
--     "observaciones": "texto opcional"
--   }
-- ]

ALTER TABLE units
ADD COLUMN IF NOT EXISTS headcount_meta JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_units_headcount_meta ON units USING GIN (headcount_meta);

COMMENT ON COLUMN units.headcount_meta IS 'Metadatos de Headcount por cargo. Formato: [{"positionId":"uuid","preventivo":{"Day":n,"Afternoon":n,"Night":n},"observaciones":"string"}]';
