-- ============================================
-- CORRECCIÓN DE POLÍTICAS RLS PARA POSITIONS (VERSIÓN SEGURA)
-- ============================================
-- Este script crea nuevas políticas RLS para la tabla positions
-- SIN eliminar las políticas existentes, evitando así advertencias
-- de operaciones destructivas.
--
-- Problema identificado:
-- Las políticas actuales requieren auth.role() = 'authenticated',
-- pero cuando no hay sesión de Supabase Auth activa, las consultas fallan.
--
-- Solución:
-- Crear nuevas políticas que permitan acceso a puestos activos
-- a usuarios autenticados. Las políticas antiguas seguirán existiendo
-- pero las nuevas tendrán prioridad.

-- 1. Crear política que permita a todos los usuarios autenticados ver puestos activos
-- Esta política permite ver puestos activos a cualquier usuario autenticado
DO $$
BEGIN
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
    
    RAISE NOTICE 'Política "Authenticated users can view active positions" creada exitosamente';
  ELSE
    RAISE NOTICE 'Política "Authenticated users can view active positions" ya existe';
  END IF;
END $$;

-- 2. Crear política que permita a admins ver todos los puestos (activos e inactivos)
DO $$
BEGIN
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
    
    RAISE NOTICE 'Política "Admins can view all positions (updated)" creada exitosamente';
  ELSE
    RAISE NOTICE 'Política "Admins can view all positions (updated)" ya existe';
  END IF;
END $$;

-- 3. Verificar y crear políticas de escritura si no existen

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
    
    RAISE NOTICE 'Política "Admins can insert positions" creada exitosamente';
  ELSE
    RAISE NOTICE 'Política "Admins can insert positions" ya existe';
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
    
    RAISE NOTICE 'Política "Admins can update positions" creada exitosamente';
  ELSE
    RAISE NOTICE 'Política "Admins can update positions" ya existe';
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
    
    RAISE NOTICE 'Política "Admins can delete positions" creada exitosamente';
  ELSE
    RAISE NOTICE 'Política "Admins can delete positions" ya existe';
  END IF;
END $$;

-- ============================================
-- NOTA IMPORTANTE:
-- ============================================
-- Este script NO elimina políticas existentes, solo crea nuevas.
-- Si quieres eliminar las políticas antiguas después de verificar
-- que las nuevas funcionan, puedes ejecutar manualmente:
--
-- DROP POLICY IF EXISTS "Users can view active positions" ON positions;
-- DROP POLICY IF EXISTS "Admins can view all positions" ON positions;
--
-- Si el problema persiste después de ejecutar este script,
-- puede ser que el usuario no tenga una sesión de Supabase Auth activa.
-- En ese caso, el usuario debe:
-- 1. Cerrar sesión
-- 2. Volver a iniciar sesión
-- Esto creará la sesión de Supabase Auth necesaria para que RLS funcione.
