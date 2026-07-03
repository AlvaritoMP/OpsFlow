-- Script para asignar rol SUPER_ADMIN al usuario aminano@opaloperu.com
-- Ejecutar en el SQL Editor de Supabase
-- 
-- IMPORTANTE: Antes de ejecutar este script, ejecuta primero:
-- database/update_users_role_check.sql
-- para actualizar la restricción CHECK de la columna role

-- Actualizar el rol del usuario a SUPER_ADMIN
UPDATE public.users
SET role = 'SUPER_ADMIN'
WHERE email = 'aminano@opaloperu.com';

-- Verificar que se actualizó correctamente
SELECT id, name, email, role 
FROM public.users 
WHERE email = 'aminano@opaloperu.com';

-- También actualizar en auth.users metadata si es necesario
-- (Esto se hace automáticamente cuando el usuario inicia sesión, pero podemos hacerlo manualmente)
-- Nota: Esto requiere permisos de administrador de Supabase

