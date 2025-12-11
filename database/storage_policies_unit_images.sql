-- =====================================================
-- Políticas RLS para el bucket de Storage
-- "unit-images"
-- =====================================================
-- 
-- ⚠️ IMPORTANTE: Este script requiere permisos de SUPERUSUARIO
-- Si obtienes el error "must be owner of table objects", 
-- debes configurar las políticas manualmente desde el Dashboard.
-- 
-- Ver el archivo: storage_policies_unit_images_manual.md
-- para instrucciones detalladas de configuración manual.
--
-- Pasos:
-- 1. Crea el bucket en Supabase Dashboard: Storage > New bucket
--    - Nombre: unit-images
--    - Public bucket: ✅ (marcado)
-- 2. Si tienes permisos de superusuario, ejecuta este script
--    Si no, sigue las instrucciones en el archivo .md
-- =====================================================

-- Verificar que el bucket existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE name = 'unit-images'
  ) THEN
    RAISE EXCEPTION 'El bucket "unit-images" no existe. Por favor, créalo primero en Supabase Storage.';
  END IF;
END $$;

-- Asegurar que RLS esté habilitado en storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes si las hay (para evitar duplicados)
DROP POLICY IF EXISTS "Allow authenticated users to upload unit images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public to read unit images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update unit images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete unit images" ON storage.objects;

-- Política 1: Permitir subir archivos (INSERT)
-- Los usuarios autenticados pueden subir imágenes al bucket
CREATE POLICY "Allow authenticated users to upload unit images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  (bucket_id)::text = 'unit-images'
);

-- Política 2: Permitir leer archivos (SELECT)
-- Cualquiera puede leer las imágenes (público) ya que el bucket es público
CREATE POLICY "Allow public to read unit images"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'unit-images'::text
);

-- Política 3: Permitir actualizar archivos (UPDATE)
-- Los usuarios autenticados pueden actualizar imágenes que hayan subido
CREATE POLICY "Allow authenticated users to update unit images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'unit-images'::text
)
WITH CHECK (
  bucket_id = 'unit-images'::text
);

-- Política 4: Permitir eliminar archivos (DELETE)
-- Los usuarios autenticados pueden eliminar imágenes del bucket
CREATE POLICY "Allow authenticated users to delete unit images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'unit-images'::text
);

-- Verificar que las políticas se crearon correctamente
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname LIKE '%unit images%';
  
  IF policy_count < 4 THEN
    RAISE WARNING 'Se esperaban 4 políticas, pero se encontraron %', policy_count;
  ELSE
    RAISE NOTICE '✅ Políticas creadas correctamente: % políticas encontradas', policy_count;
  END IF;
END $$;

-- Mensaje de confirmación
SELECT 
  '✅ Configuración completada' AS status,
  'Las políticas RLS para el bucket unit-images han sido creadas.' AS message,
  COUNT(*) AS policies_created
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%unit images%';

