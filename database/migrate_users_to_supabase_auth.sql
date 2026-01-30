-- ============================================
-- MIGRACIÓN DE USUARIOS A SUPABASE AUTH
-- ============================================
-- Este script ayuda a migrar usuarios de la tabla users a Supabase Auth.
-- 
-- IMPORTANTE: Este script NO crea usuarios automáticamente en auth.users
-- porque Supabase Auth requiere que las contraseñas se hasheen con su propio sistema.
--
-- Este script solo muestra los usuarios que necesitan ser migrados.
-- Para migrar usuarios, debes hacerlo manualmente desde Supabase Dashboard
-- o usar la API de administración de Supabase.
--
-- ============================================
-- PASO 1: Verificar usuarios que necesitan migración
-- ============================================

-- Listar usuarios en la tabla users que NO están en auth.users
SELECT 
  u.id,
  u.email,
  u.name,
  u.role,
  CASE 
    WHEN au.id IS NULL THEN 'NO EXISTE EN AUTH'
    ELSE 'EXISTE EN AUTH'
  END as auth_status
FROM users u
LEFT JOIN auth.users au ON u.email = au.email
ORDER BY u.email;

-- ============================================
-- PASO 2: Verificar usuarios en auth.users que NO están en users
-- ============================================

-- Listar usuarios en auth.users que NO están en la tabla users
SELECT 
  au.id,
  au.email,
  au.raw_user_meta_data->>'name' as name,
  au.raw_user_meta_data->>'role' as role,
  'EXISTE EN AUTH PERO NO EN USERS' as status
FROM auth.users au
LEFT JOIN users u ON au.email = u.email
WHERE u.id IS NULL
ORDER BY au.email;

-- ============================================
-- NOTA IMPORTANTE:
-- ============================================
-- Para migrar usuarios manualmente:
--
-- 1. Ve a Supabase Dashboard → Authentication → Users
-- 2. Haz clic en "Add User" o "Invite User"
-- 3. Ingresa el email y contraseña del usuario
-- 4. Asegúrate de que el email coincida exactamente con el de la tabla users
--
-- O usa la API de administración de Supabase (requiere service_role key):
--
-- POST https://[project].supabase.co/auth/v1/admin/users
-- Headers: {
--   "Authorization": "Bearer [SERVICE_ROLE_KEY]",
--   "Content-Type": "application/json"
-- }
-- Body: {
--   "email": "usuario@ejemplo.com",
--   "password": "contraseña",
--   "email_confirm": true,
--   "user_metadata": {
--     "name": "Nombre del Usuario",
--     "role": "OPERATIONS"
--   }
-- }
--
-- ============================================
-- ALTERNATIVA: Deshabilitar RLS temporalmente
-- ============================================
-- Si no puedes migrar usuarios inmediatamente, puedes ejecutar
-- el script fix_positions_rls_allow_public_read.sql para permitir
-- acceso público a puestos activos (solo lectura).
