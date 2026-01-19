-- Script para limpiar y verificar el password_hash del usuario aminano@opaloperu.com
-- Ejecutar en Supabase SQL Editor

-- 1. Verificar el estado actual del usuario
SELECT 
  id,
  email,
  name,
  role,
  LENGTH(password_hash) as hash_length,
  password_hash,
  CASE 
    WHEN password_hash IS NULL THEN 'NO tiene password_hash'
    WHEN TRIM(password_hash) != password_hash THEN 'Tiene espacios extra'
    WHEN LENGTH(password_hash) != 64 THEN 'Longitud incorrecta (esperado: 64)'
    ELSE 'OK'
  END as hash_status,
  created_at,
  updated_at
FROM users
WHERE email = 'aminano@opaloperu.com';

-- 2. Limpiar el hash si tiene espacios (SOLO si el hash tiene espacios)
-- IMPORTANTE: Esto solo limpia espacios, NO cambia la contraseña
UPDATE users
SET 
  password_hash = TRIM(password_hash),
  updated_at = NOW()
WHERE email = 'aminano@opaloperu.com'
  AND password_hash IS NOT NULL
  AND TRIM(password_hash) != password_hash;

-- 3. Verificar después de limpiar
SELECT 
  id,
  email,
  name,
  LENGTH(password_hash) as hash_length,
  CASE 
    WHEN TRIM(password_hash) != password_hash THEN 'AÚN tiene espacios'
    WHEN LENGTH(password_hash) = 64 THEN 'OK - Hash limpio y longitud correcta'
    ELSE 'Revisar formato'
  END as hash_status
FROM users
WHERE email = 'aminano@opaloperu.com';

-- NOTA: Si después de limpiar los espacios el login sigue fallando,
-- puede ser que:
-- 1. La contraseña en la BD no coincide con la que estás ingresando
-- 2. El hash fue generado con un algoritmo diferente
-- 
-- En ese caso, necesitarás resetear la contraseña usando el script JavaScript
-- o ejecutando este UPDATE con un nuevo hash generado.
