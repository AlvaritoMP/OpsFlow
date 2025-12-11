-- =====================================================
-- Script para verificar y corregir la política SELECT
-- del bucket unit-images
-- =====================================================
-- 
-- Este script te ayudará a identificar si hay restricciones
-- por owner_id en la política SELECT que impiden el acceso público
-- =====================================================

-- 1. Ver las políticas actuales del bucket unit-images
SELECT 
  policyname,
  cmd as operation,
  roles,
  qual as using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%unit images%'
ORDER BY cmd, policyname;

-- 2. Verificar si hay restricciones por owner_id
SELECT 
  policyname,
  cmd as operation,
  CASE 
    WHEN qual LIKE '%owner%' OR qual LIKE '%auth.uid()%' THEN '⚠️ TIENE RESTRICCIÓN POR OWNER'
    WHEN with_check LIKE '%owner%' OR with_check LIKE '%auth.uid()%' THEN '⚠️ TIENE RESTRICCIÓN POR OWNER'
    ELSE '✅ SIN RESTRICCIONES POR OWNER'
  END as status,
  qual as using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%unit images%'
  AND cmd = 'SELECT';

-- 3. Si la política SELECT tiene restricciones por owner, necesitas:
--    a) Eliminar la política actual desde el Dashboard
--    b) Crear una nueva política SELECT sin restricciones por owner
--    c) La expresión USING debe ser solo: bucket_id = 'unit-images'

-- NOTA: No puedes eliminar políticas desde SQL sin permisos de superusuario,
-- así que debes hacerlo manualmente desde el Dashboard.

