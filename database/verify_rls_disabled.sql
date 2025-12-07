-- Verificar si RLS está deshabilitado en TODAS las tablas

SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    CASE 
        WHEN rowsecurity THEN '❌ RLS ACTIVO - Debe deshabilitarse'
        ELSE '✅ UNRESTRICTED (RLS deshabilitado)'
    END as status
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'pg_%'
  AND tablename NOT LIKE '_prisma%'
ORDER BY 
    CASE WHEN rowsecurity THEN 0 ELSE 1 END, -- RLS activo primero
    tablename;

-- Si alguna tabla muestra "RLS ACTIVO", ejecuta:
-- ALTER TABLE public.[nombre_tabla] DISABLE ROW LEVEL SECURITY;

-- O ejecuta database/disable_all_rls.sql para deshabilitar RLS en todas las tablas automáticamente

