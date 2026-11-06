-- Rol Comercial: arma propuestas en el Cotizador.
-- Ejecutar en el SQL Editor de Supabase.
-- Administrador y Super Administrador ya pueden entrar al Cotizador
-- sin este cambio. Este script habilita guardar usuarios con role = 'COMMERCIAL'.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'SUPER_ADMIN',
    'ADMIN',
    'OPERATIONS',
    'OPERATIONS_SUPERVISOR',
    'WAREHOUSE_ADMIN',
    'COMMERCIAL',
    'CLIENT'
  ));
