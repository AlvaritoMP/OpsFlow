-- Deshabilitar RLS en TODAS las tablas de la base de datos
-- Esto es seguro para apps internas con pocos usuarios

-- Obtener lista de todas las tablas con RLS activo
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        AND tablename NOT LIKE 'pg_%'
        AND tablename NOT LIKE '_prisma%'
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tablename);
            RAISE NOTICE 'RLS deshabilitado en: %', r.tablename;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Error al deshabilitar RLS en %: %', r.tablename, SQLERRM;
        END;
    END LOOP;
END $$;

-- Verificar estado de RLS en todas las tablas
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    CASE 
        WHEN rowsecurity THEN '❌ RLS ACTIVO'
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

