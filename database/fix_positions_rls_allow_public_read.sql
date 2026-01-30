-- ============================================
-- PERMITIR ACCESO PÚBLICO A PUESTOS ACTIVOS
-- ============================================
-- Este script crea una política que permite acceso público (sin autenticación)
-- a los puestos activos, ya que son datos de referencia necesarios para la aplicación.
--
-- IMPORTANTE: Esta política es segura porque solo permite LECTURA de puestos activos.
-- Las operaciones de escritura (INSERT, UPDATE, DELETE) siguen requiriendo autenticación y permisos de admin.

-- Crear política que permita acceso público a puestos activos (solo lectura)
DO $$
BEGIN
  -- Eliminar política antigua si existe con el mismo nombre
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'positions' 
    AND policyname = 'Public can view active positions'
  ) THEN
    DROP POLICY "Public can view active positions" ON positions;
  END IF;
  
  -- Crear nueva política que permita acceso público
  CREATE POLICY "Public can view active positions"
  ON positions
  FOR SELECT
  TO public
  USING (is_active = true);
  
  RAISE NOTICE 'Política "Public can view active positions" creada exitosamente';
END $$;

-- ============================================
-- NOTA IMPORTANTE:
-- ============================================
-- Esta política permite que CUALQUIERA (incluso sin autenticación) pueda
-- leer los puestos activos. Esto es seguro porque:
-- 1. Solo permite LECTURA (SELECT)
-- 2. Solo muestra puestos activos (is_active = true)
-- 3. No expone información sensible
-- 4. Las operaciones de escritura siguen protegidas por otras políticas
--
-- Si prefieres mantener el acceso solo para usuarios autenticados,
-- NO ejecutes este script y asegúrate de que todos los usuarios tengan
-- una sesión de Supabase Auth activa (cerrando sesión y volviendo a iniciar).
