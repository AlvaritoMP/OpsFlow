-- ============================================
-- Permitir eliminar usuarios sin perder historial operativo
-- ============================================
-- El DELETE en public.users fallaba por FKs (sobre todo
-- night_supervision_shifts.supervisor_id ON DELETE RESTRICT y columnas
-- de auditoría / vacaciones).
--
-- Esta migración:
-- 1) Conserva el historial: SET NULL en referencias de auditoría
-- 2) Borra solo accesos del usuario (clientes, unidades visibles, almacenes)
-- 3) Expone RPC delete_opsflow_user para un borrado transaccional
--
-- Ejecutar en Supabase SQL Editor si la app aún no puede eliminar usuarios.

DO $$
DECLARE
  r RECORD;
  ownership_tables text[] := ARRAY[
    'user_client_links',
    'user_visible_units',
    'inv_warehouse_access'
  ];
  delete_action text;
BEGIN
  FOR r IN
    SELECT
      rel.relname AS table_name,
      c.conname,
      a.attname AS column_name,
      a.attnotnull AS not_null
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.users'::regclass
      AND n.nspname = 'public'
      AND array_length(c.conkey, 1) = 1
  LOOP
    IF r.table_name = ANY (ownership_tables)
       OR (r.table_name = 'vacation_authorization_requests' AND r.column_name = 'requester_id')
    THEN
      delete_action := 'CASCADE';
    ELSE
      delete_action := 'SET NULL';
      IF r.not_null THEN
        EXECUTE format(
          'ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL',
          r.table_name,
          r.column_name
        );
      END IF;
    END IF;

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.table_name, r.conname);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.users(id) ON DELETE %s',
      r.table_name,
      r.conname,
      r.column_name,
      delete_action
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.delete_opsflow_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'El ID de usuario es requerido';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'El usuario no existe';
  END IF;

  IF to_regclass('public.vacation_authorization_requests') IS NOT NULL THEN
    UPDATE public.vacation_authorization_requests
    SET status = 'cancelled',
        resolved_at = NOW(),
        resolved_by = NULL
    WHERE assigned_authorizer_id = p_user_id
      AND status = 'pending';
  END IF;

  DELETE FROM public.users WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.delete_opsflow_user(uuid) IS
  'Elimina un usuario de OpsFlow desvinculando historial (SET NULL) y accesos (CASCADE).';

GRANT EXECUTE ON FUNCTION public.delete_opsflow_user(uuid) TO anon, authenticated, service_role;
