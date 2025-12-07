-- Verificar si RLS está deshabilitado en las tablas principales

SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    CASE 
        WHEN rowsecurity THEN '❌ RLS ACTIVO - Debe deshabilitarse'
        ELSE '✅ RLS DESHABILITADO'
    END as status
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE schemaname = 'public'
  AND tablename IN ('users', 'units', 'management_staff', 'audit_logs', 'clients', 'client_representatives', 'user_client_links')
ORDER BY tablename;

-- Si alguna tabla muestra "RLS ACTIVO", ejecuta:
-- ALTER TABLE public.[nombre_tabla] DISABLE ROW LEVEL SECURITY;

