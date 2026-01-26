-- Script SEGURO para deshabilitar RLS en la tabla user_visible_units
-- Esta versión solo deshabilita RLS sin eliminar políticas primero
-- Si prefieres, puedes ejecutar este script en lugar del otro

-- Deshabilitar Row Level Security
-- NOTA: Esto es seguro porque solo deshabilita RLS, las políticas existentes
-- simplemente dejarán de aplicarse (pero no se eliminan)
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
-- Esto es suficiente para que la tabla funcione con autenticación personalizada
