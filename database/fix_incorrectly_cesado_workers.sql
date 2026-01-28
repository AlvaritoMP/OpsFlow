-- Script para corregir trabajadores que están marcados como "cesado" 
-- pero que deberían estar como "activo" porque tienen fecha de fin de contrato
-- pero NO han sido archivados explícitamente
--
-- La fecha de fin de contrato (end_date) es solo referencial para monitoreo
-- y NO debe cambiar automáticamente el estado a "cesado"
-- El estado "cesado" solo debe establecerse mediante la acción explícita de cese

-- Actualizar trabajadores que tienen end_date pero están marcados como "cesado"
-- y NO están archivados (archived = false o NULL)
-- Estos deben volver a estado "activo"
UPDATE resources
SET personnel_status = 'activo'
WHERE type = 'Personal'
  AND end_date IS NOT NULL
  AND personnel_status = 'cesado'
  AND (archived = false OR archived IS NULL);

-- Verificar cuántos trabajadores fueron corregidos
SELECT 
  COUNT(*) as trabajadores_corregidos,
  'Trabajadores cambiados de "cesado" a "activo"' as descripcion
FROM resources
WHERE type = 'Personal'
  AND end_date IS NOT NULL
  AND personnel_status = 'activo'
  AND (archived = false OR archived IS NULL);

-- Mostrar los trabajadores que fueron corregidos (opcional, para verificación)
SELECT 
  id,
  name,
  dni,
  end_date,
  personnel_status,
  archived,
  unit_id
FROM resources
WHERE type = 'Personal'
  AND end_date IS NOT NULL
  AND personnel_status = 'activo'
  AND (archived = false OR archived IS NULL)
ORDER BY name;
