-- Corrige los errores de Postgres vistos en los logs de Supabase:
--   42703  column inv_movements.recipient does not exist
--   23514  management_staff_status_check / assigned_assets_type_check
--   42501  new row violates row-level security policy for table "objects"
--
-- Idempotente. La app entra a Storage con la anon key (sesión propia de OpsFlow),
-- no siempre con un JWT de Supabase Auth.

-- 1) Inventario: columnas que el historial ya consulta, y tipos de descarga.
ALTER TABLE public.inv_movements
  ADD COLUMN IF NOT EXISTS recipient text,
  ADD COLUMN IF NOT EXISTS consumption_reason text,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid;

ALTER TABLE public.inv_movements DROP CONSTRAINT IF EXISTS inv_movements_type_check;
ALTER TABLE public.inv_movements
  ADD CONSTRAINT inv_movements_type_check
  CHECK (type IN ('ENTRADA', 'SALIDA', 'AJUSTE', 'CREACIÓN', 'CONSUMO', 'ENTREGA'));

-- 2) Personal de gestión: cualquier variante de estado queda en el check.
CREATE OR REPLACE FUNCTION public.normalize_management_staff_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  key text;
BEGIN
  key := lower(btrim(coalesce(NEW.status, '')));
  NEW.status := CASE
    WHEN key IN ('cesado') THEN 'cesado'
    WHEN key IN ('archivado') THEN 'archivado'
    ELSE 'activo'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_normalize_management_staff_status ON public.management_staff;
CREATE TRIGGER zzz_normalize_management_staff_status
BEFORE INSERT OR UPDATE ON public.management_staff
FOR EACH ROW
EXECUTE FUNCTION public.normalize_management_staff_status();

-- 3) Activos asignados: acentos, vacíos y tipos viejos entran como un valor válido.
CREATE OR REPLACE FUNCTION public.normalize_assigned_asset_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  key text;
BEGIN
  key := lower(translate(btrim(coalesce(NEW.type, '')), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'));
  NEW.type := CASE
    WHEN key = 'epp' THEN 'EPP'
    WHEN key = 'uniforme' THEN 'Uniforme'
    WHEN key IN ('tecnologia', 'tecnologico') THEN 'Tecnologia'
    WHEN key = 'herramienta' THEN 'Herramienta'
    ELSE 'Otro'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_normalize_assigned_asset_type ON public.assigned_assets;
CREATE TRIGGER zzz_normalize_assigned_asset_type
BEFORE INSERT OR UPDATE ON public.assigned_assets
FOR EACH ROW
EXECUTE FUNCTION public.normalize_assigned_asset_type();

-- 4) Storage: la app sube como anon o authenticated, y upsert necesita UPDATE.
DROP POLICY IF EXISTS opsflow_storage_write ON storage.objects;
CREATE POLICY opsflow_storage_write
ON storage.objects
FOR ALL
TO anon, authenticated
USING (
  bucket_id IN (
    'unit-images',
    'night-supervision-photos',
    'attendance-incident-attachments',
    'staff-photos'
  )
)
WITH CHECK (
  bucket_id IN (
    'unit-images',
    'night-supervision-photos',
    'attendance-incident-attachments',
    'staff-photos'
  )
);
