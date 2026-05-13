-- OpsFlow: RLS habilitado con políticas permisivas para anon + authenticated
-- ---------------------------------------------------------------------------
-- Contexto: La SPA usa VITE_SUPABASE_ANON_KEY y a menudo sesión propia
-- (OPSFLOW_SESSION) sin JWT de Supabase Auth, por lo que las peticiones REST
-- llegan como rol `anon`. Políticas que solo usan auth.uid() bloquean la app.
--
-- Esta migración:
-- 1) Elimina políticas existentes en public (evita conflictos y reglas rotas)
-- 2) Habilita RLS en todas las tablas base de public
-- 3) Crea UNA política PERMISSIVE por tabla para roles anon + authenticated
--
-- Seguridad: equivale a tener RLS desactivado para acceso vía PostgREST con
-- anon key (cualquiera con la URL y anon key ya puede operar). La protección
-- real sigue siendo no exponer datos sensibles y, a futuro, Edge Functions o
-- políticas por fila cuando la app use siempre Supabase Auth alineado con users.
--
-- El rol service_role de Supabase sigue pudiendo bypass RLS según documentación.

-- 1) Quitar políticas previas en public
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );
  END LOOP;
END $$;

-- 2) RLS + política permisiva en cada tabla base
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY opsflow_allow_ops ON public.%I
      AS PERMISSIVE
      FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true)
    $f$, t);
  END LOOP;
END $$;
