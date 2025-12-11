-- =====================================================
-- Script de diagnóstico y corrección de políticas RLS
-- para el bucket "night-supervision-photos"
-- =====================================================

-- 1. Verificar que el bucket existe
SELECT 
  name,
  id,
  public,
  created_at
FROM storage.buckets 
WHERE name = 'night-supervision-photos';

-- 2. Verificar si RLS está habilitado
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'storage' 
  AND tablename = 'objects';

-- 3. Habilitar RLS si no está habilitado
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 4. Verificar políticas existentes
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%photo%';

-- 5. Eliminar TODAS las políticas existentes relacionadas con photos
DROP POLICY IF EXISTS "Allow authenticated users to upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public to read photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;

-- 6. Crear política PERMISIVA para INSERT (para probar)
-- Esta política permite a cualquier usuario autenticado subir archivos
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 7. Crear política para SELECT (lectura pública)
CREATE POLICY "Public read access"
ON storage.objects
FOR SELECT
TO public
USING (true);

-- 8. Crear política para UPDATE
CREATE POLICY "Allow authenticated updates"
ON storage.objects
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 9. Crear política para DELETE
CREATE POLICY "Allow authenticated deletes"
ON storage.objects
FOR DELETE
TO authenticated
USING (true);

-- 10. Verificar que las políticas se crearon
SELECT 
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;

-- Mensaje final
SELECT 
  '✅ Políticas creadas' AS status,
  'Las políticas permisivas han sido creadas. Intenta subir un archivo ahora.' AS message;

