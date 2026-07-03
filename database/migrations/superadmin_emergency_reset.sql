-- Script SQL de EMERGENCIA para resetear contraseña del Super Administrador
-- SOLO usar si no puedes acceder al sistema de recuperación web
-- 
-- INSTRUCCIONES:
-- 1. Ir a Supabase Dashboard → SQL Editor
-- 2. Copiar y pegar este script
-- 3. Reemplazar 'NuevaContraseña123!' con tu nueva contraseña
-- 4. Ejecutar el script
--
-- IMPORTANTE: Este script solo funciona para el usuario superadmin (aminano@opaloperu.com)

-- Paso 1: Verificar que el usuario existe y es SUPER_ADMIN
SELECT 
  id,
  email,
  name,
  role,
  CASE 
    WHEN role = 'SUPER_ADMIN' THEN '✅ Es Super Admin'
    ELSE '❌ NO es Super Admin'
  END as status
FROM users
WHERE email = 'aminano@opaloperu.com';

-- Paso 2: Generar el hash de la nueva contraseña
-- NOTA: Necesitas generar el hash usando JavaScript o el script de utilidad
-- El hash SHA-256 de 'NuevaContraseña123!' es: (generar usando el script)
--
-- Para generar el hash, usa este código en la consola del navegador:
-- (async () => {
--   const password = 'NuevaContraseña123!';
--   const encoder = new TextEncoder();
--   const data = encoder.encode(password);
--   const hashBuffer = await crypto.subtle.digest('SHA-256', data);
--   const hashArray = Array.from(new Uint8Array(hashBuffer));
--   const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
--   console.log('Hash:', hashHex);
-- })();

-- Paso 3: Actualizar la contraseña (REEMPLAZAR EL HASH AQUÍ)
-- IMPORTANTE: Reemplaza 'AQUI_VA_EL_HASH_GENERADO' con el hash real generado arriba
UPDATE users
SET 
  password_hash = 'AQUI_VA_EL_HASH_GENERADO',  -- ⚠️ REEMPLAZAR CON EL HASH REAL
  updated_at = NOW()
WHERE email = 'aminano@opaloperu.com'
  AND role = 'SUPER_ADMIN';

-- Paso 4: Verificar que se actualizó correctamente
SELECT 
  id,
  email,
  name,
  role,
  LENGTH(password_hash) as hash_length,
  CASE 
    WHEN password_hash IS NULL THEN '❌ No tiene hash'
    WHEN LENGTH(password_hash) = 64 THEN '✅ Hash válido (64 caracteres)'
    ELSE '⚠️ Hash con longitud inusual'
  END as hash_status,
  updated_at
FROM users
WHERE email = 'aminano@opaloperu.com';

-- NOTA DE SEGURIDAD:
-- Este script solo actualiza la tabla 'users'.
-- Si el usuario también existe en Supabase Auth (auth.users),
-- necesitarás resetear la contraseña allí también usando:
-- 1. El dashboard de Supabase → Authentication → Users
-- 2. O usando "Olvidé mi contraseña" si está configurado
