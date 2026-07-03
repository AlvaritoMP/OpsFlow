-- Script para verificar y resetear contraseña de usuario
-- USO: Ejecutar en Supabase SQL Editor

-- 1. Verificar si el usuario existe y tiene password_hash
-- Reemplazar 'tu-email@ejemplo.com' con el email del usuario
SELECT 
  id,
  email,
  name,
  role,
  CASE 
    WHEN password_hash IS NULL THEN 'NO tiene password_hash'
    WHEN password_hash = '' THEN 'password_hash vacío'
    ELSE 'Tiene password_hash (' || LENGTH(password_hash) || ' caracteres)'
  END as password_status,
  created_at,
  updated_at
FROM users
WHERE email = 'tu-email@ejemplo.com';

-- 2. Verificar si el usuario existe en Supabase Auth
-- Reemplazar 'tu-email@ejemplo.com' con el email del usuario
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at,
  last_sign_in_at
FROM auth.users
WHERE email = 'tu-email@ejemplo.com';

-- 3. RESETEAR CONTRASEÑA (solo si es necesario)
-- IMPORTANTE: Esto generará un nuevo hash. El usuario deberá usar la nueva contraseña.
-- Reemplazar:
--   'tu-email@ejemplo.com' con el email del usuario
--   'NuevaContraseña123!' con la nueva contraseña (se hasheará automáticamente)

-- NOTA: Este script solo actualiza la tabla users.
-- Si el usuario también existe en Supabase Auth, necesitará usar "Olvidé mi contraseña"
-- o actualizar manualmente desde el dashboard de Supabase.

-- Para generar el hash de la nueva contraseña, puedes usar este código JavaScript:
-- const encoder = new TextEncoder();
-- const data = encoder.encode('NuevaContraseña123!');
-- const hashBuffer = await crypto.subtle.digest('SHA-256', data);
-- const hashArray = Array.from(new Uint8Array(hashBuffer));
-- const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
-- console.log(hashHex);

-- O usar este comando en la consola del navegador:
-- (async () => {
--   const password = 'NuevaContraseña123!';
--   const encoder = new TextEncoder();
--   const data = encoder.encode(password);
--   const hashBuffer = await crypto.subtle.digest('SHA-256', data);
--   const hashArray = Array.from(new Uint8Array(hashBuffer));
--   const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
--   console.log('Hash:', hashHex);
-- })();

-- Una vez que tengas el hash, actualiza la contraseña:
-- UPDATE users
-- SET password_hash = 'AQUI_VA_EL_HASH_GENERADO',
--     updated_at = NOW()
-- WHERE email = 'tu-email@ejemplo.com';

-- 4. CREAR USUARIO EN SUPABASE AUTH (si no existe)
-- Esto requiere usar el dashboard de Supabase o una Edge Function con service_role key
-- No se puede hacer directamente desde el cliente por seguridad
