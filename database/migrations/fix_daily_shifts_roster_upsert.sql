-- Rostering: upsert atómico de turnos (resource_id + date)
-- Ejecutar en el SQL Editor de Supabase.
--
-- Corrige guardados lentos e intermitentes:
-- 1) Elimina duplicados (resource_id, date)
-- 2) Crea índice único para ON CONFLICT
-- 3) Expone RPC upsert_daily_shifts para guardar muchos turnos en una transacción

-- 1) Dejar una sola fila por trabajador y fecha (se conserva la más reciente por ctid)
DELETE FROM public.daily_shifts d
WHERE d.ctid NOT IN (
  SELECT DISTINCT ON (resource_id, date) ctid
  FROM public.daily_shifts
  ORDER BY resource_id, date, ctid DESC
);

-- 2) Índice único usado por upsert / ON CONFLICT (resource_id, date)
CREATE UNIQUE INDEX IF NOT EXISTS daily_shifts_resource_id_date_uidx
  ON public.daily_shifts (resource_id, date);

-- 3) RPC: inserta o actualiza el lote completo en una sola transacción
CREATE OR REPLACE FUNCTION public.upsert_daily_shifts(p_shifts jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_shifts IS NULL OR jsonb_typeof(p_shifts) <> 'array' OR jsonb_array_length(p_shifts) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.daily_shifts (resource_id, date, type, hours)
  SELECT
    (s->>'resource_id')::uuid,
    (s->>'date')::date,
    s->>'type',
    COALESCE((s->>'hours')::numeric, 0)
  FROM jsonb_array_elements(p_shifts) AS s
  WHERE COALESCE(s->>'resource_id', '') <> ''
    AND COALESCE(s->>'date', '') <> ''
    AND COALESCE(s->>'type', '') <> ''
  ON CONFLICT (resource_id, date)
  DO UPDATE SET
    type = EXCLUDED.type,
    hours = EXCLUDED.hours;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_daily_shifts(jsonb) TO anon, authenticated;

COMMENT ON FUNCTION public.upsert_daily_shifts(jsonb) IS
  'Upsert atómico de daily_shifts para guardar la planificación de rostering en lote.';
