-- Deshabilitar Row Level Security (RLS) en las tablas principales
-- Esto simplifica el sistema de autenticación para apps internas

-- Deshabilitar RLS en la tabla users
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Deshabilitar RLS en otras tablas principales
ALTER TABLE public.units DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_representatives DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_client_links DISABLE ROW LEVEL SECURITY;

-- Deshabilitar RLS en tablas relacionadas (para imágenes, logs, recursos, etc.)
ALTER TABLE IF EXISTS public.unit_images DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.blueprint_layers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.zones DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.compliance_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.resources DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.personnel DISABLE ROW LEVEL SECURITY;

-- Verificar que RLS está deshabilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE schemaname = 'public'
  AND tablename IN ('users', 'units', 'management_staff', 'audit_logs', 'clients', 'client_representatives', 'user_client_links')
ORDER BY tablename;

-- Nota: Si alguna tabla no existe, verás un error. Simplemente comenta esa línea.

