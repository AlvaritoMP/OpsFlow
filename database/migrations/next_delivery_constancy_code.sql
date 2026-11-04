-- Códigos correlativos de constancias sin colisión entre solicitudes simultáneas.
-- Ejecutar en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS public.delivery_constancy_counters (
  year integer PRIMARY KEY,
  last_number integer NOT NULL
);

INSERT INTO public.delivery_constancy_counters (year, last_number)
SELECT
  (substring(code from '^CONST-([0-9]{4})-'))::integer AS year,
  MAX((substring(code from '-([0-9]+)$'))::integer) AS last_number
FROM public.delivery_constancies
WHERE code ~ '^CONST-[0-9]{4}-[0-9]+$'
GROUP BY 1
ON CONFLICT (year) DO UPDATE
  SET last_number = GREATEST(public.delivery_constancy_counters.last_number, EXCLUDED.last_number);

CREATE OR REPLACE FUNCTION public.next_delivery_constancy_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y integer := EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima'))::integer;
  n integer;
BEGIN
  INSERT INTO public.delivery_constancy_counters (year, last_number)
  VALUES (y, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_number = public.delivery_constancy_counters.last_number + 1
  RETURNING last_number INTO n;

  RETURN 'CONST-' || y::text || '-' || lpad(n::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_delivery_constancy_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_delivery_constancy_code() TO anon, authenticated;

ALTER TABLE public.delivery_constancy_counters ENABLE ROW LEVEL SECURITY;

COMMENT ON FUNCTION public.next_delivery_constancy_code() IS
  'Reserva el siguiente código CONST-YYYY-000001 sin colisión entre solicitudes simultáneas.';
