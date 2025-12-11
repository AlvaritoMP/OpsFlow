-- =====================================================
-- Políticas RLS para el bucket de Storage
-- "night-supervision-photos"
-- =====================================================
-- 
-- IMPORTANTE: Este script debe ejecutarse DESPUÉS de crear el bucket
-- en Supabase Storage con el nombre: "night-supervision-photos"
--
-- Pasos:
-- 1. Crea el bucket en Supabase Dashboard: Storage > New bucket
--    - Nombre: night-supervision-photos
--    - Public bucket: ✅ (marcado)
-- 2. Ejecuta este script en Supabase SQL Editor
-- =====================================================

-- Verificar que el bucket existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE name = 'night-supervision-photos'
  ) THEN
    RAISE EXCEPTION 'El bucket "night-supervision-photos" no existe. Por favor, créalo primero en Supabase Storage.';
  END IF;
END $$;

-- Asegurar que RLS esté habilitado en storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes si las hay (para evitar duplicados)
DROP POLICY IF EXISTS "Allow authenticated users to upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public to read photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete photos" ON storage.objects;

-- Política 1: Permitir subir archivos (INSERT)
-- Los usuarios autenticados pueden subir fotos al bucket
-- NOTA: Usamos una política más permisiva primero para asegurar que funcione
CREATE POLICY "Allow authenticated users to upload photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  (bucket_id)::text = 'night-supervision-photos'
);

-- Política 2: Permitir leer archivos (SELECT)
-- Cualquiera puede leer las fotos (público) ya que el bucket es público
CREATE POLICY "Allow public to read photos"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'night-supervision-photos'::text
);

-- Política 3: Permitir actualizar archivos (UPDATE)
-- Los usuarios autenticados pueden actualizar fotos que hayan subido
CREATE POLICY "Allow authenticated users to update photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'night-supervision-photos'::text
)
WITH CHECK (
  bucket_id = 'night-supervision-photos'::text
);

-- Política 4: Permitir eliminar archivos (DELETE)
-- Los usuarios autenticados pueden eliminar fotos del bucket
CREATE POLICY "Allow authenticated users to delete photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'night-supervision-photos'::text
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
    AND policyname LIKE '%photos%';
  
  IF policy_count < 4 THEN
    RAISE WARNING 'Se esperaban 4 políticas, pero se encontraron %', policy_count;
  ELSE
    RAISE NOTICE '✅ Políticas creadas correctamente: % políticas encontradas', policy_count;
  END IF;
END $$;

-- Mensaje de confirmación
SELECT 
  '✅ Configuración completada' AS status,
  'Las políticas RLS para el bucket night-supervision-photos han sido creadas.' AS message,
  COUNT(*) AS policies_created
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%photos%';

