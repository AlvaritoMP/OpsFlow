-- ============================================
-- RLS: tablas de vacaciones (sin DROP — seguro para Supabase SQL Editor)
-- ============================================
-- Corrige: "new row violates row-level security policy for table 'vacation_papeletas'"
-- No elimina datos; solo crea políticas de acceso si aún no existen.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vacation_balances',
    'vacation_day_entries',
    'vacation_papeletas'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      RAISE NOTICE 'Tabla public.% no existe, se omite', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'vacation_allow_all'
    ) THEN
      EXECUTE format($f$
        CREATE POLICY vacation_allow_all ON public.%I
        AS PERMISSIVE
        FOR ALL
        TO anon, authenticated
        USING (true)
        WITH CHECK (true)
      $f$, t);
      RAISE NOTICE 'Política creada en public.%', t;
    ELSE
      RAISE NOTICE 'Política vacation_allow_all ya existe en public.%', t;
    END IF;
  END LOOP;
END $$;
