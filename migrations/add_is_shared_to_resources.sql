-- ============================================
-- MIGRACIÓN: Agregar campo is_shared a resources
-- ============================================

-- Agregar columna is_shared como BOOLEAN
-- true = trabajador compartido (puede trabajar en múltiples unidades)
-- false = trabajador único (solo trabaja en una unidad)
ALTER TABLE resources
ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;

-- Comentario para documentar la columna
COMMENT ON COLUMN resources.is_shared IS 'Indica si el trabajador es compartido (true) entre múltiples unidades o único (false) para una sola unidad. Por defecto false (único).';

-- Crear índice para búsquedas rápidas de trabajadores compartidos
CREATE INDEX IF NOT EXISTS idx_resources_is_shared ON resources(is_shared) WHERE type = 'Personal';

