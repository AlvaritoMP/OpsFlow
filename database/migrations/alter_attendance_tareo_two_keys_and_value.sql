-- Ajuste Tareo: valor en claves + novedad con hasta 2 claves (día + horas).
-- Versión corregida: key_id era NOT NULL y bloqueaba el merge.
-- Seguro re-ejecutar si el intento anterior falló (el DO suele hacer rollback).

ALTER TABLE public.attendance_tareo_keys
  ADD COLUMN IF NOT EXISTS value_amount NUMERIC(10, 2) NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.attendance_tareo_keys.value_amount IS
  'Valor del icono. En claves de días suele ser 1; se suma a la columna del Tareo. En claves de horas el monto lo define hours_value en la novedad.';

ALTER TABLE public.attendance_tareo_novedades
  ADD COLUMN IF NOT EXISTS day_key_id UUID REFERENCES public.attendance_tareo_keys(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS hours_key_id UUID REFERENCES public.attendance_tareo_keys(id) ON DELETE RESTRICT;

-- Migrar desde el modelo anterior (key_id por fila) si existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance_tareo_novedades' AND column_name = 'key_id'
  ) THEN
    -- Quitar NOT NULL de key_id ANTES de reinsertar (era la causa del error 23502)
    ALTER TABLE public.attendance_tareo_novedades
      ALTER COLUMN key_id DROP NOT NULL;

    -- Asignar day_key_id desde filas con clave tipo day/none
    UPDATE public.attendance_tareo_novedades n
    SET day_key_id = n.key_id
    FROM public.attendance_tareo_keys k
    WHERE k.id = n.key_id
      AND k.value_kind IN ('day', 'none')
      AND n.day_key_id IS NULL;

    -- Asignar hours_key_id desde filas con clave tipo hours
    UPDATE public.attendance_tareo_novedades n
    SET hours_key_id = n.key_id
    FROM public.attendance_tareo_keys k
    WHERE k.id = n.key_id
      AND k.value_kind = 'hours'
      AND n.hours_key_id IS NULL;

    -- Fallback: si quedó key_id sin clasificar, úsalo como day_key_id
    UPDATE public.attendance_tareo_novedades
    SET day_key_id = key_id
    WHERE day_key_id IS NULL
      AND hours_key_id IS NULL
      AND key_id IS NOT NULL;

    -- Consolidar duplicados: una fila por (unit, resource, day)
    CREATE TEMP TABLE _tareo_nov_merge ON COMMIT DROP AS
    SELECT
      unit_id,
      resource_id,
      day,
      (ARRAY_AGG(day_key_id) FILTER (WHERE day_key_id IS NOT NULL))[1] AS day_key_id,
      (ARRAY_AGG(hours_key_id) FILTER (WHERE hours_key_id IS NOT NULL))[1] AS hours_key_id,
      MAX(hours_value) AS hours_value,
      (ARRAY_AGG(comment) FILTER (WHERE comment IS NOT NULL AND comment <> ''))[1] AS comment,
      (ARRAY_AGG(source))[1] AS source,
      (ARRAY_AGG(updated_by) FILTER (WHERE updated_by IS NOT NULL))[1] AS updated_by,
      MIN(created_at) AS created_at,
      MAX(updated_at) AS updated_at
    FROM public.attendance_tareo_novedades
    GROUP BY unit_id, resource_id, day;

    DELETE FROM public.attendance_tareo_novedades;

    INSERT INTO public.attendance_tareo_novedades (
      unit_id, resource_id, day,
      key_id,
      day_key_id, hours_key_id, hours_value,
      comment, source, updated_by, created_at, updated_at
    )
    SELECT
      unit_id, resource_id, day,
      COALESCE(day_key_id, hours_key_id), -- temporal hasta dropear key_id
      day_key_id, hours_key_id, hours_value,
      comment, COALESCE(source, 'manual'), updated_by, created_at, updated_at
    FROM _tareo_nov_merge
    WHERE day_key_id IS NOT NULL OR hours_key_id IS NOT NULL;

    ALTER TABLE public.attendance_tareo_novedades
      DROP CONSTRAINT IF EXISTS attendance_tareo_novedades_unit_resource_day_key_unique;
    ALTER TABLE public.attendance_tareo_novedades
      DROP CONSTRAINT IF EXISTS attendance_tareo_novedades_key_id_fkey;
    ALTER TABLE public.attendance_tareo_novedades
      DROP COLUMN IF EXISTS key_id;
  END IF;
END $$;

ALTER TABLE public.attendance_tareo_novedades
  DROP CONSTRAINT IF EXISTS attendance_tareo_novedades_unit_resource_day_unique;

ALTER TABLE public.attendance_tareo_novedades
  ADD CONSTRAINT attendance_tareo_novedades_unit_resource_day_unique UNIQUE (unit_id, resource_id, day);

COMMENT ON COLUMN public.attendance_tareo_novedades.day_key_id IS 'Clave en días (máx. 1 por celda)';
COMMENT ON COLUMN public.attendance_tareo_novedades.hours_key_id IS 'Clave en horas (máx. 1 por celda) junto con hours_value';
