-- Actualizar la restricción CHECK de daily_shifts para incluir 'Afternoon'
-- Primero eliminamos la restricción existente
ALTER TABLE daily_shifts DROP CONSTRAINT IF EXISTS daily_shifts_type_check;

-- Luego creamos una nueva restricción que incluya 'Afternoon'
ALTER TABLE daily_shifts 
ADD CONSTRAINT daily_shifts_type_check 
CHECK (type IN ('Day', 'Afternoon', 'Night', 'OFF', 'Vacation', 'Sick'));

-- Verificar que la restricción se aplicó correctamente
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'daily_shifts'::regclass
AND conname = 'daily_shifts_type_check';

