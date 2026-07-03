-- =====================================================
-- DESHABILITAR RLS en storage.objects
-- =====================================================
-- 
-- ⚠️ ADVERTENCIA: Esto deshabilitará RLS completamente para Storage
-- Solo hazlo si tienes otros mecanismos de seguridad (como autenticación)
--
-- Si prefieres mantener RLS pero con políticas permisivas,
-- usa el script storage_policies_fix.sql en su lugar
-- =====================================================

-- Deshabilitar RLS en storage.objects
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;

-- Verificar que RLS está deshabilitado
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'storage' 
  AND tablename = 'objects';

-- Mensaje de confirmación
SELECT 
  '✅ RLS deshabilitado' AS status,
  'Row Level Security ha sido deshabilitado en storage.objects. Ahora puedes subir archivos sin políticas RLS.' AS message;

