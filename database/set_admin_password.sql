-- Script para establecer contraseña inicial del administrador
-- INSTRUCCIONES:
-- 1. Reemplaza 'TU_CONTRASEÑA_AQUI' en la línea 20 con tu contraseña real
-- 2. Ejecuta este script completo en Supabase SQL Editor

-- Habilitar extensión pgcrypto si no está habilitada (Supabase generalmente la tiene)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- OPCIÓN 1: Usar pgcrypto (RECOMENDADO - más fácil)
-- Reemplaza 'TU_CONTRASEÑA_AQUI' con tu contraseña real
UPDATE users 
SET password_hash = encode(digest('TU_CONTRASEÑA_AQUI', 'sha256'), 'hex')
WHERE role = 'ADMIN' 
  AND (password_hash IS NULL OR password_hash = '');

-- OPCIÓN 2: Si pgcrypto no funciona, usa el hash calculado manualmente
-- 1. Abre utils/setInitialPassword.html en tu navegador
-- 2. Ingresa tu contraseña y genera el hash
-- 3. Descomenta las líneas de abajo y reemplaza 'HASH_AQUI' con el hash generado
-- UPDATE users 
-- SET password_hash = 'HASH_AQUI'
-- WHERE role = 'ADMIN' 
--   AND (password_hash IS NULL OR password_hash = '');

-- Verificar que se actualizó correctamente
SELECT id, name, email, role, 
       CASE 
         WHEN password_hash IS NOT NULL AND password_hash != '' THEN 'Contraseña configurada'
         ELSE 'Sin contraseña'
       END as password_status
FROM users 
WHERE role = 'ADMIN';

