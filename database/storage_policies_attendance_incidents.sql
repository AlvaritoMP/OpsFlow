-- Políticas de Storage para sustentos de /falta (Mattermost).
-- Ejecutar DESPUÉS de create_payroll_attendance_incidents.sql (crea el bucket).
--
-- NO hace ALTER TABLE storage.objects: esa tabla es del sistema
-- (dueño supabase_storage_admin) y el SQL Editor no puede tocarla (42501).
-- RLS en storage.objects ya viene habilitado en Supabase.
--
-- Si CREATE POLICY también falla por permisos, créalas en el Dashboard:
--   Storage → attendance-incident-attachments → Policies
--   SELECT público:  bucket_id = 'attendance-incident-attachments'
--   INSERT/UPDATE/DELETE (anon + authenticated): mismo predicado
--
-- Con bucket público + SUPABASE_SERVICE_ROLE_KEY el bot igual puede subir
-- y las URLs públicas se ven en OpsFlow aunque no existan estas políticas.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'attendance-incident-attachments'
  ) THEN
    RAISE EXCEPTION
      'El bucket "attendance-incident-attachments" no existe. Ejecuta primero create_payroll_attendance_incidents.sql o créalo en Storage (público).';
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "attendance_incidents_public_read" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "attendance_incidents_insert" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "attendance_incidents_update" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "attendance_incidents_delete" ON storage.objects';

  EXECUTE $p$
    CREATE POLICY "attendance_incidents_public_read"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'attendance-incident-attachments')
  $p$;

  EXECUTE $p$
    CREATE POLICY "attendance_incidents_insert"
    ON storage.objects
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (bucket_id = 'attendance-incident-attachments')
  $p$;

  EXECUTE $p$
    CREATE POLICY "attendance_incidents_update"
    ON storage.objects
    FOR UPDATE
    TO anon, authenticated
    USING (bucket_id = 'attendance-incident-attachments')
    WITH CHECK (bucket_id = 'attendance-incident-attachments')
  $p$;

  EXECUTE $p$
    CREATE POLICY "attendance_incidents_delete"
    ON storage.objects
    FOR DELETE
    TO anon, authenticated
    USING (bucket_id = 'attendance-incident-attachments')
  $p$;

  RAISE NOTICE 'Políticas de attendance-incident-attachments creadas.';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE
      'Sin permiso para crear políticas en storage.objects. Ve a Dashboard → Storage → attendance-incident-attachments → Policies y crea SELECT público + INSERT para anon/authenticated con: bucket_id = ''attendance-incident-attachments''. El bot con service_role puede subir igual si el bucket es público.';
  WHEN OTHERS THEN
    RAISE NOTICE 'No se pudieron crear políticas de Storage (%). Configúralas en el Dashboard si hace falta. Detalle: %', SQLSTATE, SQLERRM;
END $$;
