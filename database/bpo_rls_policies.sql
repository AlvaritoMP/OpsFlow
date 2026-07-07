-- Políticas RLS para tablas BPO (permite guardar con campos parciales vía anon/authenticated)
-- Ejecutar después de crear las tablas BPO en Supabase.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'resource_bpo_profiles',
    'resource_bpo_dependents',
    'resource_bpo_personnel_documents',
    'unit_bpo_contacts',
    'unit_bpo_bank_accounts',
    'unit_bpo_bank_statements'
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
        AND policyname = 'bpo_allow_all'
    ) THEN
      EXECUTE format($f$
        CREATE POLICY bpo_allow_all ON public.%I
        AS PERMISSIVE
        FOR ALL
        TO anon, authenticated
        USING (true)
        WITH CHECK (true)
      $f$, t);
      RAISE NOTICE 'Política bpo_allow_all creada en public.%', t;
    ELSE
      RAISE NOTICE 'Política bpo_allow_all ya existe en public.%', t;
    END IF;
  END LOOP;
END $$;
