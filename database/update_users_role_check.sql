-- Script para actualizar la restricción CHECK de la columna role en la tabla users
-- para incluir el nuevo rol SUPER_ADMIN
-- Ejecutar en el SQL Editor de Supabase

-- Paso 1: Eliminar la restricción CHECK existente
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_role_check;

-- Paso 2: Crear una nueva restricción CHECK que incluya SUPER_ADMIN
ALTER TABLE public.users
ADD CONSTRAINT users_role_check 
CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'OPERATIONS', 'OPERATIONS_SUPERVISOR', 'CLIENT'));

-- Verificar que la restricción se creó correctamente
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.users'::regclass
AND conname = 'users_role_check';

