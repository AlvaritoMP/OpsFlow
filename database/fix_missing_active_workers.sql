-- ============================================
-- CORREGIR TRABAJADORES QUE NO APARECEN COMO ACTIVOS
-- ============================================
-- Este script busca y corrige trabajadores que deberían estar activos
-- pero no aparecen en la vista de gestión de personal.
--
-- Problema: Trabajadores con personnelStatus = 'cesado' pero que NO están archivados
-- no aparecen ni en la vista de activos ni en archivados.
--
-- Solución: Establecer personnelStatus = 'activo' y archived = false
-- ============================================

-- PASO 1: Buscar trabajadores problemáticos
-- (trabajadores con personnelStatus = 'cesado' pero archived = false)
SELECT 
  id,
  name,
  dni,
  personnel_status,
  archived,
  unit_id,
  end_date,
  'PROBLEMA: Cesado pero no archivado' as problema
FROM resources
WHERE 
  type = 'PERSONNEL'
  AND personnel_status = 'cesado'
  AND (archived = false OR archived IS NULL)
ORDER BY name;

-- PASO 2: Buscar trabajadores específicos mencionados
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
    name ILIKE '%CARRILLO%ALICIA%' 
    OR name ILIKE '%SALDARRIAGA%HAROLD%'
    OR (name ILIKE '%CARRILLO%' AND name ILIKE '%ALICIA%')
    OR (name ILIKE '%SALDARRIAGA%' AND name ILIKE '%HAROLD%')
  )
ORDER BY name;

-- PASO 3: CORREGIR trabajadores con personnelStatus = 'cesado' pero NO archivados
-- Esto los hará aparecer como activos nuevamente
UPDATE resources
SET 
  personnel_status = 'activo',
  archived = false
WHERE 
  type = 'PERSONNEL'
  AND personnel_status = 'cesado'
  AND (archived = false OR archived IS NULL);

-- Verificar cuántos se corrigieron
SELECT 
  COUNT(*) as trabajadores_corregidos
FROM resources
WHERE 
  type = 'PERSONNEL'
  AND personnel_status = 'activo'
  AND (archived = false OR archived IS NULL);

-- PASO 4: Verificar trabajadores específicos después de la corrección
SELECT 
  id,
  name,
  dni,
  personnel_status,
  archived,
  unit_id
FROM resources
WHERE 
  type = 'PERSONNEL'
  AND (
    name ILIKE '%CARRILLO%ALICIA%' 
    OR name ILIKE '%SALDARRIAGA%HAROLD%'
    OR (name ILIKE '%CARRILLO%' AND name ILIKE '%ALICIA%')
    OR (name ILIKE '%SALDARRIAGA%' AND name ILIKE '%HAROLD%')
  )
ORDER BY name;
