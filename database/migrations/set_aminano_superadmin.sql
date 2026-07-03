-- Script para establecer el usuario aminano@opaloperu.com como SUPER_ADMIN
-- Ejecutar en Supabase SQL Editor

-- Paso 1: Verificar el estado actual del usuario
SELECT 
  id,
  email,
  name,
  role,
  created_at,
  updated_at
FROM users
WHERE email = 'aminano@opaloperu.com';

-- Paso 2: Actualizar el rol a SUPER_ADMIN
UPDATE users
SET 
  role = 'SUPER_ADMIN',
  updated_at = NOW()
WHERE email = 'aminano@opaloperu.com';

-- Paso 3: Verificar que se actualizó correctamente
SELECT 
  id,
  email,
  name,
  role,
  CASE 
    WHEN role = 'SUPER_ADMIN' THEN '✅ Es Super Administrador'
    ELSE '❌ NO es Super Administrador'
  END as status,
  updated_at
FROM users
WHERE email = 'aminano@opaloperu.com';

-- NOTA: Si el UPDATE no funciona, puede ser por restricciones de RLS (Row Level Security)
-- En ese caso, ejecuta este comando para deshabilitar temporalmente RLS:
-- ALTER TABLE users DISABLE ROW LEVEL SECURITY;
-- 
-- Luego ejecuta el UPDATE de nuevo, y después vuelve a habilitar RLS:
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
