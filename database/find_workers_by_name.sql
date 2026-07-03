-- ============================================
-- BUSCAR TRABAJADORES POR NOMBRE
-- ============================================
-- Este script ayuda a buscar trabajadores específicos
-- y verificar su estado actual
-- ============================================

-- Buscar trabajadores por partes del nombre
-- Reemplaza 'NOMBRE' con el nombre que buscas
SELECT 
  id,
  name,
  dni,
  personnel_status,
  archived,
  unit_id,
  end_date,
  CASE 
    WHEN archived = true THEN 'Archivado'
    WHEN personnel_status = 'cesado' THEN 'Cesado'
    WHEN personnel_status = 'activo' THEN 'Activo'
    WHEN personnel_status IS NULL THEN 'Sin estado'
    ELSE personnel_status
  END as estado_actual,
  CASE 
    WHEN archived = true THEN 'No aparecerá en activos ni archivados (correcto)'
    WHEN personnel_status = 'cesado' AND (archived = false OR archived IS NULL) THEN 'PROBLEMA: Cesado pero no archivado - NO APARECERÁ'
    WHEN personnel_status = 'activo' AND (archived = false OR archived IS NULL) THEN 'Debería aparecer en activos'
    ELSE 'Revisar estado'
  END as observacion
FROM resources
WHERE 
  type = 'PERSONNEL'
  AND (
    name ILIKE '%NOMBRE%'  -- Reemplaza NOMBRE con el nombre que buscas
    -- Ejemplo: name ILIKE '%CARRILLO%' OR name ILIKE '%ALICIA%'
  )
ORDER BY name;

-- Buscar trabajadores específicos mencionados
SELECT 
  id,
  name,
  dni,
  personnel_status,
  archived,
  unit_id,
  end_date
FROM resources
WHERE 
  type = 'PERSONNEL'
  AND (
    name ILIKE '%CARRILLO%' 
    OR name ILIKE '%SALDARRIAGA%'
    OR name ILIKE '%ALICIA%'
    OR name ILIKE '%HAROLD%'
  )
ORDER BY name;

-- Ver todos los trabajadores con estados problemáticos
SELECT 
  id,
  name,
  dni,
  personnel_status,
  archived,
  unit_id,
  'PROBLEMA: Cesado pero no archivado' as problema
FROM resources
WHERE 
  type = 'PERSONNEL'
  AND personnel_status = 'cesado'
  AND (archived = false OR archived IS NULL)
ORDER BY name;
