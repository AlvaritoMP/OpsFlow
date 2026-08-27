-- Horario real del turno (dentro de la franja Día / Tarde / Noche).
-- Ejecutar en el SQL Editor de Supabase.

ALTER TABLE public.daily_shifts
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time;

CREATE UNIQUE INDEX IF NOT EXISTS daily_shifts_resource_id_date_uidx
  ON public.daily_shifts (resource_id, date);

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

  INSERT INTO public.daily_shifts (resource_id, date, type, hours, start_time, end_time)
  SELECT
    (s->>'resource_id')::uuid,
    (s->>'date')::date,
    s->>'type',
    COALESCE((s->>'hours')::numeric, 0),
    NULLIF(s->>'start_time', '')::time,
    NULLIF(s->>'end_time', '')::time
  FROM jsonb_array_elements(p_shifts) AS s
  WHERE COALESCE(s->>'resource_id', '') <> ''
    AND COALESCE(s->>'date', '') <> ''
    AND COALESCE(s->>'type', '') <> ''
  ON CONFLICT (resource_id, date)
  DO UPDATE SET
    type = EXCLUDED.type,
    hours = EXCLUDED.hours,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_daily_shifts(jsonb) TO anon, authenticated;
