-- Landing /ficha sin depender de la Edge Function.
-- IMPORTANTE: después de este archivo, ejecutar también
--   MIGRATION_PUBLIC_COMPLEMENTARY_FICHA_OPEN_FIX.sql
-- Ese fix abre la ficha para Personal ya creado en unidades (sin ATS y sin Opalosis).
-- Ejecutar en SQL Editor de Supabase OpsFlow.

CREATE TABLE IF NOT EXISTS public.public_complementary_fichas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dni text NOT NULL UNIQUE,
  complementary jsonb NOT NULL DEFAULT '{}'::jsonb,
  open_count integer NOT NULL DEFAULT 0,
  max_opens integer NOT NULL DEFAULT 3,
  last_opened_at timestamptz,
  last_saved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_complementary_fichas_dni_check CHECK (dni ~ '^[0-9]{8}$'),
  CONSTRAINT public_complementary_fichas_open_count_check CHECK (open_count >= 0),
  CONSTRAINT public_complementary_fichas_max_opens_check CHECK (max_opens >= 1)
);

CREATE TABLE IF NOT EXISTS public.public_complementary_ficha_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id uuid NOT NULL REFERENCES public.public_complementary_fichas(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours')
);

CREATE INDEX IF NOT EXISTS idx_public_ficha_sessions_ficha
  ON public.public_complementary_ficha_sessions (ficha_id);

CREATE INDEX IF NOT EXISTS idx_public_ficha_sessions_expires
  ON public.public_complementary_ficha_sessions (expires_at);

CREATE OR REPLACE FUNCTION public.set_public_complementary_fichas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_public_complementary_fichas_updated_at
  ON public.public_complementary_fichas;

CREATE TRIGGER trg_public_complementary_fichas_updated_at
  BEFORE UPDATE ON public.public_complementary_fichas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_public_complementary_fichas_updated_at();

CREATE OR REPLACE FUNCTION public.try_open_public_complementary_ficha(p_dni text)
RETURNS public.public_complementary_fichas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  rec public.public_complementary_fichas;
BEGIN
  INSERT INTO public.public_complementary_fichas (dni, open_count, last_opened_at)
  VALUES (p_dni, 1, now())
  ON CONFLICT (dni) DO UPDATE
    SET
      open_count = public.public_complementary_fichas.open_count + 1,
      last_opened_at = now()
    WHERE public.public_complementary_fichas.open_count < public.public_complementary_fichas.max_opens
  RETURNING * INTO rec;

  RETURN rec;
END;
$$;

ALTER TABLE public.public_complementary_fichas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_complementary_ficha_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_complementary_fichas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.public_complementary_ficha_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_open_public_complementary_ficha(text) FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.public_complementary_fichas TO service_role;
GRANT ALL ON TABLE public.public_complementary_ficha_sessions TO service_role;
GRANT ALL ON FUNCTION public.try_open_public_complementary_ficha(text) TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Helpers (no exponer a anon)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.public_ficha_digits(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.public_ficha_fill(p jsonb, p_key text, p_value text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN nullif(btrim(coalesce(p ->> p_key, '')), '') IS NOT NULL THEN p
    WHEN nullif(btrim(coalesce(p_value, '')), '') IS NULL THEN p
    ELSE p || jsonb_build_object(p_key, btrim(p_value))
  END;
$$;

CREATE OR REPLACE FUNCTION public.public_ficha_status(p jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  keys text[] := ARRAY[
    'nombres', 'apellidoPaterno', 'apellidoMaterno', 'nroDocumento',
    'fechaNacimiento', 'sexo', 'email', 'telefono', 'direccion',
    'distrito', 'provincia'
  ];
  filled int := 0;
  k text;
BEGIN
  FOREACH k IN ARRAY keys LOOP
    IF nullif(btrim(coalesce(p ->> k, '')), '') IS NOT NULL THEN
      filled := filled + 1;
    END IF;
  END LOOP;
  IF filled = 0 THEN
    RETURN 'missing';
  END IF;
  IF filled < ceil(array_length(keys, 1) * 0.6) THEN
    RETURN 'incomplete';
  END IF;
  RETURN 'complete';
END;
$$;

CREATE OR REPLACE FUNCTION public.hydrate_public_complementary_ficha(p_dni text, p_stored jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored jsonb := coalesce(p_stored, '{}'::jsonb);
  snapshot jsonb := '{}'::jsonb;
  identity jsonb := '{}'::jsonb;
  fields jsonb := '{}'::jsonb;
  inbound jsonb := '{}'::jsonb;
  result jsonb;
  res_name text;
  res_phone text;
  res_email text;
  res_birth text;
BEGIN
  IF to_regclass('public.resources') IS NOT NULL THEN
    SELECT
      r.name,
      r.phone,
      r.email,
      r.birth_date::text,
      coalesce(r.inbound_source_data, '{}'::jsonb)
    INTO res_name, res_phone, res_email, res_birth, inbound
    FROM public.resources r
    WHERE r.type = 'Personal'
      AND public.public_ficha_digits(r.dni) = p_dni
    ORDER BY r.created_at DESC NULLS LAST
    LIMIT 1;

    IF FOUND THEN
      snapshot := coalesce(inbound -> 'workerSnapshot', '{}'::jsonb);
    END IF;
  END IF;

  IF snapshot = '{}'::jsonb
     AND to_regclass('public.inbound_worker_handoff_items') IS NOT NULL THEN
    SELECT
      coalesce(i.worker_snapshot, '{}'::jsonb),
      coalesce(i.complementary, '{}'::jsonb)
    INTO snapshot, stored
    FROM public.inbound_worker_handoff_items i
    WHERE public.public_ficha_digits(
        coalesce(
          i.worker_snapshot #>> '{identity,dni}',
          i.complementary ->> 'nroDocumento',
          i.worker_snapshot #>> '{complementary,nroDocumento}'
        )
      ) = p_dni
    ORDER BY i.created_at DESC NULLS LAST
    LIMIT 1;

    IF FOUND AND stored = '{}'::jsonb THEN
      stored := coalesce(snapshot -> 'complementary', '{}'::jsonb);
    ELSIF NOT FOUND THEN
      snapshot := '{}'::jsonb;
      stored := coalesce(p_stored, '{}'::jsonb);
    END IF;
  END IF;

  identity := coalesce(snapshot -> 'identity', '{}'::jsonb);
  fields := coalesce(snapshot -> 'fields', '{}'::jsonb);
  result := coalesce(snapshot -> 'complementary', '{}'::jsonb) || coalesce(p_stored, '{}'::jsonb) || stored;

  result := public.public_ficha_fill(result, 'nombres', coalesce(identity ->> 'nombres', fields ->> 'nombres', fields ->> 'firstName', res_name));
  result := public.public_ficha_fill(result, 'apellidoPaterno', coalesce(identity ->> 'apellidoPaterno', fields ->> 'apellidoPaterno', fields ->> 'apPaterno'));
  result := public.public_ficha_fill(result, 'apellidoMaterno', coalesce(identity ->> 'apellidoMaterno', fields ->> 'apellidoMaterno', fields ->> 'apMaterno'));
  result := public.public_ficha_fill(result, 'nroDocumento', coalesce(identity ->> 'dni', fields ->> 'dni', fields ->> 'nroDocumento', p_dni));
  result := public.public_ficha_fill(result, 'fechaNacimiento', coalesce(fields ->> 'fechaNacimiento', fields ->> 'birthDate', res_birth));
  result := public.public_ficha_fill(result, 'email', coalesce(identity ->> 'email', fields ->> 'email', res_email));
  result := public.public_ficha_fill(result, 'telefono', coalesce(identity ->> 'phone', fields ->> 'phone', fields ->> 'telefono', res_phone));
  result := public.public_ficha_fill(result, 'direccion', coalesce(fields ->> 'direccion', fields ->> 'address'));
  result := public.public_ficha_fill(result, 'distrito', coalesce(fields ->> 'distrito', fields ->> 'district'));
  result := public.public_ficha_fill(result, 'provincia', coalesce(fields ->> 'provincia', fields ->> 'province'));
  result := public.public_ficha_fill(result, 'departamento', coalesce(fields ->> 'departamento', fields ->> 'department'));
  result := public.public_ficha_fill(result, 'sexo', coalesce(fields ->> 'sexo', fields ->> 'sex'));
  result := public.public_ficha_fill(result, 'estadoCivil', fields ->> 'estadoCivil');
  result := public.public_ficha_fill(result, 'nacionalidad', fields ->> 'nacionalidad');
  result := public.public_ficha_fill(result, 'puestoContrato', fields ->> 'puestoContrato');
  result := public.public_ficha_fill(result, 'unidadDestaque', fields ->> 'unidadDestaque');
  result := public.public_ficha_fill(result, 'tipoDocumento', 'DNI');
  result := public.public_ficha_fill(result, 'nroDocumento', p_dni);

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_public_complementary_ficha(p_dni text, p_complementary jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  status_text text := public.public_ficha_status(p_complementary);
  now_iso text := to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  rec record;
  inbound jsonb;
  snapshot jsonb;
  next_inbound jsonb;
  resource_ids uuid[] := ARRAY[]::uuid[];
  item record;
  next_snapshot jsonb;
BEGIN

  IF to_regclass('public.resources') IS NOT NULL THEN
    FOR rec IN
      SELECT r.id, r.dni, r.phone, r.email, r.birth_date, r.inbound_source_data
      FROM public.resources r
      WHERE r.type = 'Personal'
        AND public.public_ficha_digits(r.dni) = p_dni
    LOOP
      resource_ids := array_append(resource_ids, rec.id);
      inbound := coalesce(rec.inbound_source_data, '{}'::jsonb);
      snapshot := coalesce(inbound -> 'workerSnapshot', '{}'::jsonb);
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
          WHEN rec.birth_date IS NULL
            AND btrim(coalesce(p_complementary ->> 'fechaNacimiento', '')) ~ '^\d{4}-\d{2}-\d{2}'
          THEN left(btrim(p_complementary ->> 'fechaNacimiento'), 10)::date
          ELSE rec.birth_date
        END
      WHERE id = rec.id;
    END LOOP;
  END IF;

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

  IF to_regclass('public.inbound_worker_handoff_items') IS NOT NULL THEN
    FOR item IN
      SELECT i.id, i.worker_snapshot, i.complementary, i.item_status
      FROM public.inbound_worker_handoff_items i
      WHERE i.item_status IS DISTINCT FROM 'rejected'
        AND i.item_status IS DISTINCT FROM 'archived_no_hire'
        AND public.public_ficha_digits(
          coalesce(
            i.worker_snapshot #>> '{identity,dni}',
            i.complementary ->> 'nroDocumento',
            i.worker_snapshot #>> '{complementary,nroDocumento}'
          )
        ) = p_dni
    LOOP
      next_snapshot := jsonb_set(
        jsonb_set(
          coalesce(item.worker_snapshot, '{}'::jsonb),
          '{complementary}',
          p_complementary,
          true
        ),
        '{meta}',
        coalesce(item.worker_snapshot -> 'meta', '{}'::jsonb) || jsonb_build_object(
          'complementaryStatus', status_text,
          'complementaryFilledAt', now_iso
        ),
        true
      );
      UPDATE public.inbound_worker_handoff_items
      SET
        complementary = p_complementary,
        complementary_status = status_text,
        complementary_filled_at = now(),
        worker_snapshot = next_snapshot
      WHERE id = item.id;
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.public_ficha_payload(
  p_ficha public.public_complementary_fichas,
  p_can_edit boolean,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  max_opens int := coalesce(p_ficha.max_opens, 3);
  remaining int;
BEGIN
  IF NOT p_can_edit THEN
    remaining := 0;
  ELSE
    remaining := greatest(0, max_opens - p_ficha.open_count);
  END IF;

  RETURN jsonb_build_object(
    'dni', p_ficha.dni,
    'complementary', coalesce(p_ficha.complementary, '{}'::jsonb),
    'openCount', p_ficha.open_count,
    'maxOpens', max_opens,
    'remainingOpens', remaining,
    'canEdit', p_can_edit,
    'locked', NOT p_can_edit,
    'sessionToken', p_session_token
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Entry points for the public landing (anon + authenticated)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.open_public_complementary_ficha(
  p_dni text,
  p_session_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dni text := public.public_ficha_digits(p_dni);
  ficha public.public_complementary_fichas;
  session_row public.public_complementary_ficha_sessions;
  opened public.public_complementary_fichas;
  can_edit boolean := false;
  token text;
  complementary jsonb;
BEGIN
  IF dni IS NULL OR length(dni) <> 8 THEN
    RETURN jsonb_build_object('error', 'Ingresa un DNI válido de 8 dígitos');
  END IF;

  IF nullif(btrim(coalesce(p_session_token, '')), '') IS NOT NULL THEN
    SELECT s.*
    INTO session_row
    FROM public.public_complementary_ficha_sessions s
    JOIN public.public_complementary_fichas f ON f.id = s.ficha_id
    WHERE s.session_token = btrim(p_session_token)
      AND s.expires_at > now()
      AND f.dni = dni
    LIMIT 1;

    IF FOUND THEN
      SELECT * INTO ficha FROM public.public_complementary_fichas WHERE id = session_row.ficha_id;
      RETURN public.public_ficha_payload(ficha, true, session_row.session_token);
    END IF;
  END IF;

  opened := public.try_open_public_complementary_ficha(dni);
  IF opened IS NOT NULL AND opened.id IS NOT NULL THEN
    can_edit := true;
    ficha := opened;
  ELSE
    can_edit := false;
    SELECT * INTO ficha FROM public.public_complementary_fichas WHERE public.public_complementary_fichas.dni = dni;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'No se pudo abrir la ficha');
    END IF;
  END IF;

  complementary := coalesce(ficha.complementary, '{}'::jsonb);
  IF complementary = '{}'::jsonb
     OR (complementary - 'tipoDocumento' - 'nroDocumento' - 'submittedAt') = '{}'::jsonb THEN
    complementary := public.hydrate_public_complementary_ficha(dni, complementary);
    UPDATE public.public_complementary_fichas
    SET complementary = complementary
    WHERE id = ficha.id;
    ficha.complementary := complementary;
  ELSE
    complementary := complementary || jsonb_build_object('tipoDocumento', 'DNI', 'nroDocumento', dni);
    ficha.complementary := complementary;
  END IF;

  token := NULL;
  IF can_edit THEN
    token := gen_random_uuid()::text;
    INSERT INTO public.public_complementary_ficha_sessions (ficha_id, session_token, expires_at)
    VALUES (ficha.id, token, now() + interval '12 hours');
  END IF;

  RETURN public.public_ficha_payload(ficha, can_edit, token);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'open_public_complementary_ficha: %', SQLERRM;
    RETURN jsonb_build_object('error', 'No se pudo abrir la ficha');
END;
$$;

CREATE OR REPLACE FUNCTION public.save_public_complementary_ficha(
  p_dni text,
  p_session_token text,
  p_complementary jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dni text := public.public_ficha_digits(p_dni);
  ficha public.public_complementary_fichas;
  complementary jsonb := coalesce(p_complementary, '{}'::jsonb);
BEGIN
  IF dni IS NULL OR length(dni) <> 8 THEN
    RETURN jsonb_build_object('error', 'Ingresa un DNI válido de 8 dígitos');
  END IF;

  IF nullif(btrim(coalesce(p_session_token, '')), '') IS NULL THEN
    RETURN jsonb_build_object('error', 'Sesión vencida o sin cupos. Vuelve a ingresar tu DNI.');
  END IF;

  SELECT f.*
  INTO ficha
  FROM public.public_complementary_ficha_sessions s
  JOIN public.public_complementary_fichas f ON f.id = s.ficha_id
  WHERE s.session_token = btrim(p_session_token)
    AND s.expires_at > now()
    AND f.dni = dni
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Sesión vencida o sin cupos. Vuelve a ingresar tu DNI.');
  END IF;

  IF octet_length(complementary::text) > 100000 THEN
    RETURN jsonb_build_object('error', 'La ficha es demasiado grande');
  END IF;

  complementary := complementary || jsonb_build_object(
    'tipoDocumento', 'DNI',
    'nroDocumento', dni,
    'submittedAt', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  UPDATE public.public_complementary_fichas
  SET
    complementary = complementary,
    last_saved_at = now()
  WHERE id = ficha.id
  RETURNING * INTO ficha;

  BEGIN
    PERFORM public.sync_public_complementary_ficha(dni, complementary);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'sync_public_complementary_ficha: %', SQLERRM;
  END;

  RETURN public.public_ficha_payload(ficha, true, btrim(p_session_token));
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'save_public_complementary_ficha: %', SQLERRM;
    RETURN jsonb_build_object('error', 'No se pudo guardar la ficha');
END;
$$;

REVOKE ALL ON FUNCTION public.public_ficha_digits(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_ficha_fill(jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_ficha_status(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hydrate_public_complementary_ficha(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_public_complementary_ficha(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_ficha_payload(public.public_complementary_fichas, boolean, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.public_ficha_digits(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hydrate_public_complementary_ficha(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_public_complementary_ficha(text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.open_public_complementary_ficha(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_public_complementary_ficha(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_public_complementary_ficha(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_public_complementary_ficha(text, text, jsonb) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.open_public_complementary_ficha(text, text) IS
  'Abre la ficha complementaria pública por DNI (hasta 3 aperturas). Hidrata datos de Personal en unidad aunque no haya venido del ATS.';
COMMENT ON FUNCTION public.save_public_complementary_ficha(text, text, jsonb) IS
  'Guarda la ficha complementaria pública y replica a resources / cola Opalosis / presentaciones ATS.';

NOTIFY pgrst, 'reload schema';
