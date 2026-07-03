-- ============================================
-- CORRECCIÓN DE POLÍTICAS RLS PARA POSITIONS
-- ============================================
-- Este script ajusta las políticas RLS de la tabla positions
-- para permitir que todos los usuarios autenticados puedan ver
-- los puestos activos, independientemente de su rol.
--
-- Problema identificado:
-- Las políticas actuales requieren auth.role() = 'authenticated',
-- pero cuando no hay sesión de Supabase Auth activa, las consultas fallan.
--
-- Solución:
-- Permitir acceso a puestos activos a usuarios autenticados
-- y mantener restricciones solo para operaciones de escritura.

-- 1. Crear o reemplazar política que permita a todos los usuarios autenticados ver puestos activos
-- Esta política permite ver puestos activos a cualquier usuario autenticado
DO $$
BEGIN
  -- Eliminar política antigua si existe
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'positions' 
    AND policyname = 'Users can view active positions'
  ) THEN
    DROP POLICY "Users can view active positions" ON positions;
  END IF;
  
  -- Crear nueva política
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'positions' 
    AND policyname = 'Authenticated users can view active positions'
  ) THEN
    CREATE POLICY "Authenticated users can view active positions"
    ON positions
    FOR SELECT
    TO authenticated
    USING (is_active = true);
  END IF;
END $$;

-- 2. Crear o reemplazar política que permita a admins ver todos los puestos (activos e inactivos)
DO $$
BEGIN
  -- Eliminar política antigua si existe
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'positions' 
    AND policyname = 'Admins can view all positions'
  ) THEN
    DROP POLICY "Admins can view all positions" ON positions;
  END IF;
  
  -- Crear nueva política si no existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'positions' 
    AND policyname = 'Admins can view all positions (updated)'
  ) THEN
    CREATE POLICY "Admins can view all positions (updated)"
    ON positions
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM users
        WHERE users.id = auth.uid()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
      )
    );
  END IF;
END $$;

-- 4. Mantener las políticas de escritura existentes (ya están bien configuradas)
-- Solo verificar que existan, si no, crearlas

-- Política para INSERT (solo admins)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'positions' 
    AND policyname = 'Admins can insert positions'
  ) THEN
    CREATE POLICY "Admins can insert positions"
    ON positions
    FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM users
        WHERE users.id = auth.uid()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
      )
    );
  END IF;
END $$;

-- Política para UPDATE (solo admins)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'positions' 
    AND policyname = 'Admins can update positions'
  ) THEN
    CREATE POLICY "Admins can update positions"
    ON positions
    FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM users
        WHERE users.id = auth.uid()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
      )
    );
  END IF;
END $$;

-- Política para DELETE (solo admins)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'positions' 
    AND policyname = 'Admins can delete positions'
  ) THEN
    CREATE POLICY "Admins can delete positions"
    ON positions
    FOR DELETE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM users
        WHERE users.id = auth.uid()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
      )
    );
  END IF;
END $$;

-- ============================================
-- NOTA IMPORTANTE:
-- ============================================
-- Si el problema persiste después de ejecutar este script,
-- puede ser que el usuario no tenga una sesión de Supabase Auth activa.
-- En ese caso, el usuario debe:
-- 1. Cerrar sesión
-- 2. Volver a iniciar sesión
-- Esto creará la sesión de Supabase Auth necesaria para que RLS funcione.
--
-- Alternativamente, si se necesita acceso sin sesión de Auth,
-- se puede deshabilitar RLS temporalmente o crear políticas más permisivas,
-- pero esto no es recomendado por seguridad.
