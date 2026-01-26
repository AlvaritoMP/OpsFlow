-- Script para deshabilitar RLS en la tabla user_visible_units
-- Ejecutar este script si la tabla ya existe y tiene RLS habilitado

-- Eliminar todas las políticas existentes (si las hay)
DO $$
BEGIN
  -- Eliminar políticas existentes
  DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON public.user_visible_units;
  DROP POLICY IF EXISTS "Allow management by admins and superadmins" ON public.user_visible_units;
  DROP POLICY IF EXISTS "Allow read access to all users" ON public.user_visible_units;
  DROP POLICY IF EXISTS "Allow management to all users" ON public.user_visible_units;
END $$;

-- Deshabilitar Row Level Security
ALTER TABLE IF EXISTS public.user_visible_units DISABLE ROW LEVEL SECURITY;

-- Verificar que RLS esté deshabilitado
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename = 'user_visible_units';

-- Si rowsecurity es false, entonces RLS está deshabilitado correctamente
