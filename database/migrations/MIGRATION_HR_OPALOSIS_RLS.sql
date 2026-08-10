-- RLS permisivo para tablas HR Opalosis (creadas después de opsflow_rls_permissive_for_app.sql).
-- Sin estas políticas, la SPA (anon key) recibe HTTP 403 al leer/escribir la cola.
-- Ejecutar en el SQL Editor del proyecto OpsFlow.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_outbound_ingreso_queue',
    'hr_outbound_ingreso_packages',
    'hr_outbound_ingreso_package_items',
    'hr_units_cache',
    'hr_unit_mappings'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Tabla public.% no existe — omitida', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS opsflow_allow_ops ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY opsflow_allow_ops ON public.%I
      AS PERMISSIVE
      FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true)
    $f$, t);

    RAISE NOTICE 'RLS permisivo aplicado a public.%', t;
  END LOOP;
END $$;
