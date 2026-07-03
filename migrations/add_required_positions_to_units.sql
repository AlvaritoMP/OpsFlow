-- ============================================
-- MIGRACIÓN: Agregar campo required_positions a units
-- ============================================

-- Agregar columna required_positions como JSONB
-- Esta columna almacenará un array de objetos con la estructura:
-- [{"positionId": "uuid", "positionName": "string", "quantity": number}]
ALTER TABLE units
ADD COLUMN IF NOT EXISTS required_positions JSONB DEFAULT '[]'::jsonb;

-- Crear índice GIN para búsquedas eficientes en JSONB
CREATE INDEX IF NOT EXISTS idx_units_required_positions ON units USING GIN (required_positions);

-- Comentario para documentar la estructura
COMMENT ON COLUMN units.required_positions IS 'Array de puestos requeridos en la unidad. Formato: [{"positionId": "uuid", "positionName": "string", "quantity": number}]';

