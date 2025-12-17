-- Agregar campos de capacitación a la tabla resources
-- Estos campos permiten rastrear trabajadores en periodo de capacitación
-- y generar alertas cuando cumplen 3 días para generar contratos

ALTER TABLE resources 
ADD COLUMN IF NOT EXISTS in_training BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS training_start_date DATE,
ADD COLUMN IF NOT EXISTS contract_generated BOOLEAN DEFAULT FALSE;

-- Crear índice para búsquedas rápidas de trabajadores en capacitación
CREATE INDEX IF NOT EXISTS idx_resources_in_training 
ON resources(in_training, training_start_date) 
WHERE type = 'Personal' AND in_training = TRUE;

-- Comentarios para documentación
COMMENT ON COLUMN resources.in_training IS 'Indica si el trabajador está en periodo de capacitación';
COMMENT ON COLUMN resources.training_start_date IS 'Fecha de inicio del periodo de capacitación (YYYY-MM-DD)';
COMMENT ON COLUMN resources.contract_generated IS 'Indica si ya se generó el contrato de trabajo (resuelve la alerta de 3 días)';

