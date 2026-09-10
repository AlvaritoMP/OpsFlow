-- Cuenta sueldo + CCI desde /ficha hacia la cola Envío Opalosis.
-- Ejecutar COMPLETO en SQL Editor de Supabase OpsFlow.
-- No crea Edge Functions. /ficha ya usa las RPC open/save_public_complementary_ficha.

CREATE OR REPLACE FUNCTION public.sync_public_complementary_ficha(p_dni text, p_complementary jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  status_text text := public.public_ficha_status(p_complementary);
  now_iso text := to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  rec record;
  inbound jsonb;
  snapshot jsonb;
  next_inbound jsonb;
  birth_raw text;
  resource_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF to_regclass('public.resources') IS NULL THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT r.id, r.phone, r.email, r.birth_date, r.inbound_source_data
    FROM public.resources r
    WHERE r.type = 'Personal'
      AND public.public_ficha_normalize_doc(r.dni) = p_dni
  LOOP
    resource_ids := array_append(resource_ids, rec.id);
    inbound := coalesce(rec.inbound_source_data, '{}'::jsonb);
    IF jsonb_typeof(inbound) IS DISTINCT FROM 'object' THEN
      inbound := '{}'::jsonb;
    END IF;
    snapshot := coalesce(inbound -> 'workerSnapshot', '{}'::jsonb);
    IF jsonb_typeof(snapshot) IS DISTINCT FROM 'object' THEN
      snapshot := '{}'::jsonb;
    END IF;

    next_inbound := inbound;
    IF nullif(btrim(coalesce(next_inbound ->> 'sourceApp', '')), '') IS NULL THEN
      next_inbound := next_inbound || jsonb_build_object('sourceApp', 'OpsFlow');
    END IF;
    next_inbound := jsonb_set(
      next_inbound,
      '{workerSnapshot}',
      jsonb_set(
        jsonb_set(
          snapshot,
          '{complementary}',
          p_complementary,
          true
        ),
        '{meta}',
        coalesce(snapshot -> 'meta', '{}'::jsonb) || jsonb_build_object(
          'complementaryStatus', status_text,
          'complementaryFilledAt', now_iso
        ),
        true
      ),
      true
    );

    birth_raw := btrim(coalesce(p_complementary ->> 'fechaNacimiento', ''));

    UPDATE public.resources
    SET
      inbound_source_data = next_inbound,
      phone = CASE
        WHEN nullif(btrim(coalesce(rec.phone, '')), '') IS NULL
          AND nullif(btrim(coalesce(p_complementary ->> 'telefono', '')), '') IS NOT NULL
        THEN btrim(p_complementary ->> 'telefono')
        ELSE rec.phone
      END,
      email = CASE
        WHEN nullif(btrim(coalesce(rec.email, '')), '') IS NULL
          AND nullif(btrim(coalesce(p_complementary ->> 'email', '')), '') IS NOT NULL
        THEN btrim(p_complementary ->> 'email')
        ELSE rec.email
      END,
      birth_date = CASE
        WHEN rec.birth_date IS NULL AND birth_raw ~ '^\d{4}-\d{2}-\d{2}'
        THEN left(birth_raw, 10)::date
        ELSE rec.birth_date
      END
    WHERE id = rec.id;
  END LOOP;

  IF coalesce(array_length(resource_ids, 1), 0) > 0
     AND to_regclass('public.hr_outbound_ingreso_queue') IS NOT NULL THEN
    UPDATE public.hr_outbound_ingreso_queue q
    SET
      hr_fields = coalesce(q.hr_fields, '{}'::jsonb) || jsonb_strip_nulls(
        jsonb_build_object(
          'nombres', nullif(btrim(p_complementary ->> 'nombres'), ''),
          'apellidoPaterno', nullif(btrim(p_complementary ->> 'apellidoPaterno'), ''),
          'apellidoMaterno', nullif(btrim(p_complementary ->> 'apellidoMaterno'), ''),
          'documento', nullif(btrim(p_complementary ->> 'nroDocumento'), ''),
          'fechaNacimiento', nullif(btrim(p_complementary ->> 'fechaNacimiento'), ''),
          'direccion', nullif(btrim(p_complementary ->> 'direccion'), ''),
          'telefono', nullif(btrim(p_complementary ->> 'telefono'), ''),
          'correoPersonal', nullif(btrim(p_complementary ->> 'email'), ''),
          'tallaPoloCamisa', nullif(btrim(p_complementary ->> 'tallaCamisa'), ''),
          'tallaPantalon', nullif(btrim(p_complementary ->> 'tallaPantalon'), ''),
          'bancoPreferencia', nullif(btrim(p_complementary ->> 'bancoSueldo'), ''),
          'numeroCuentaTrabajador', coalesce(
            nullif(btrim(p_complementary ->> 'numeroCuentaTrabajador'), ''),
            nullif(btrim(p_complementary ->> 'numeroCuenta'), '')
          ),
          'cuentaCci', coalesce(
            nullif(btrim(p_complementary ->> 'cuentaCci'), ''),
            nullif(btrim(p_complementary ->> 'cci'), '')
          ),
          'sistemaPension', coalesce(
            nullif(btrim(p_complementary ->> 'sistemaPensionesDeseado'), ''),
            nullif(btrim(p_complementary ->> 'sistemaPensionesAnterior'), '')
          )
        )
      ),
      worker_name = coalesce(
        nullif(btrim(concat_ws(
          ' ',
          nullif(btrim(p_complementary ->> 'apellidoPaterno'), ''),
          nullif(btrim(p_complementary ->> 'apellidoMaterno'), ''),
          nullif(btrim(p_complementary ->> 'nombres'), '')
        )), ''),
        q.worker_name
      ),
      worker_snapshot = jsonb_set(
        coalesce(q.worker_snapshot, '{}'::jsonb),
        '{ats}',
        jsonb_set(
          jsonb_set(
            coalesce(q.worker_snapshot -> 'ats', '{}'::jsonb),
            '{complementary}',
            p_complementary,
            true
          ),
          '{identity}',
          coalesce(q.worker_snapshot -> 'ats' -> 'identity', '{}'::jsonb)
            || jsonb_strip_nulls(jsonb_build_object(
              'dni', nullif(btrim(p_complementary ->> 'nroDocumento'), ''),
              'nombres', nullif(btrim(p_complementary ->> 'nombres'), ''),
              'apellidoPaterno', nullif(btrim(p_complementary ->> 'apellidoPaterno'), ''),
              'apellidoMaterno', nullif(btrim(p_complementary ->> 'apellidoMaterno'), ''),
              'email', nullif(btrim(p_complementary ->> 'email'), ''),
              'phone', nullif(btrim(p_complementary ->> 'telefono'), '')
            )),
          true
        ),
        true
      )
    WHERE q.resource_id = ANY (resource_ids)
      AND q.queue_status = 'pendiente_envio';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_public_complementary_ficha(text, jsonb)
  TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
