-- Permite DNI, CE y pasaporte (letras y números) en /ficha.
-- Ejecutar COMPLETO en SQL Editor de Supabase OpsFlow.

ALTER TABLE public.public_complementary_fichas
  DROP CONSTRAINT IF EXISTS public_complementary_fichas_dni_check;

ALTER TABLE public.public_complementary_fichas
  ADD CONSTRAINT public_complementary_fichas_dni_check
  CHECK (dni ~ '^[A-Z0-9]{5,15}$');

CREATE OR REPLACE FUNCTION public.public_ficha_normalize_doc(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(regexp_replace(coalesce(p_value, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.public_ficha_infer_tipo_documento(p_doc text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_doc, '') ~ '[A-Za-z]' THEN 'Pasaporte'
    WHEN coalesce(p_doc, '') ~ '^[0-9]{8}$' THEN 'DNI'
    WHEN coalesce(p_doc, '') ~ '^[0-9]{9}$' THEN 'CE'
    ELSE 'DNI'
  END;
$$;

CREATE OR REPLACE FUNCTION public.hydrate_public_complementary_ficha(p_dni text, p_stored jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  stored jsonb := coalesce(p_stored, '{}'::jsonb);
  snapshot jsonb := '{}'::jsonb;
  identity jsonb := '{}'::jsonb;
  fields jsonb := '{}'::jsonb;
  inbound jsonb := '{}'::jsonb;
  result jsonb;
  res_json jsonb;
  v_tipo text;
BEGIN
  IF to_regclass('public.resources') IS NOT NULL THEN
    SELECT to_jsonb(r)
    INTO res_json
    FROM public.resources r
    WHERE r.type = 'Personal'
      AND public.public_ficha_normalize_doc(r.dni) = p_dni
    ORDER BY r.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF res_json IS NOT NULL THEN
    inbound := coalesce(res_json -> 'inbound_source_data', '{}'::jsonb);
    IF jsonb_typeof(inbound) IS DISTINCT FROM 'object' THEN
      inbound := '{}'::jsonb;
    END IF;
    snapshot := coalesce(inbound -> 'workerSnapshot', '{}'::jsonb);
    IF jsonb_typeof(snapshot) IS DISTINCT FROM 'object' THEN
      snapshot := '{}'::jsonb;
    END IF;
  END IF;

  identity := coalesce(snapshot -> 'identity', '{}'::jsonb);
  fields := coalesce(snapshot -> 'fields', '{}'::jsonb);
  result := coalesce(snapshot -> 'complementary', '{}'::jsonb) || stored;

  result := public.public_ficha_fill(result, 'nombres', coalesce(identity ->> 'nombres', fields ->> 'nombres', fields ->> 'firstName', res_json ->> 'name'));
  result := public.public_ficha_fill(result, 'apellidoPaterno', coalesce(identity ->> 'apellidoPaterno', fields ->> 'apellidoPaterno', fields ->> 'apPaterno'));
  result := public.public_ficha_fill(result, 'apellidoMaterno', coalesce(identity ->> 'apellidoMaterno', fields ->> 'apellidoMaterno', fields ->> 'apMaterno'));
  result := public.public_ficha_fill(result, 'nroDocumento', coalesce(identity ->> 'dni', fields ->> 'dni', fields ->> 'nroDocumento', res_json ->> 'dni', p_dni));
  result := public.public_ficha_fill(result, 'fechaNacimiento', coalesce(fields ->> 'fechaNacimiento', fields ->> 'birthDate', res_json ->> 'birth_date'));
  result := public.public_ficha_fill(result, 'email', coalesce(identity ->> 'email', fields ->> 'email', res_json ->> 'email'));
  result := public.public_ficha_fill(result, 'telefono', coalesce(identity ->> 'phone', fields ->> 'phone', fields ->> 'telefono', res_json ->> 'phone'));
  result := public.public_ficha_fill(result, 'direccion', coalesce(fields ->> 'direccion', fields ->> 'address'));
  result := public.public_ficha_fill(result, 'distrito', coalesce(fields ->> 'distrito', fields ->> 'district'));
  result := public.public_ficha_fill(result, 'provincia', coalesce(fields ->> 'provincia', fields ->> 'province'));
  result := public.public_ficha_fill(result, 'departamento', coalesce(fields ->> 'departamento', fields ->> 'department'));
  result := public.public_ficha_fill(result, 'sexo', coalesce(fields ->> 'sexo', fields ->> 'sex'));
  result := public.public_ficha_fill(result, 'estadoCivil', fields ->> 'estadoCivil');
  result := public.public_ficha_fill(result, 'nacionalidad', fields ->> 'nacionalidad');
  result := public.public_ficha_fill(result, 'puestoContrato', coalesce(fields ->> 'puestoContrato', res_json ->> 'puesto'));
  result := public.public_ficha_fill(result, 'unidadDestaque', fields ->> 'unidadDestaque');
  result := public.public_ficha_fill(result, 'tipoDocumento', coalesce(fields ->> 'tipoDocumento', identity ->> 'tipoDocumento'));
  result := public.public_ficha_fill(result, 'nroDocumento', p_dni);

  v_tipo := nullif(btrim(coalesce(result ->> 'tipoDocumento', '')), '');
  IF v_tipo IS NULL THEN
    result := result || jsonb_build_object('tipoDocumento', public.public_ficha_infer_tipo_documento(p_dni));
  END IF;

  RETURN coalesce(
    result,
    jsonb_build_object('tipoDocumento', public.public_ficha_infer_tipo_documento(p_dni), 'nroDocumento', p_dni)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN coalesce(p_stored, '{}'::jsonb) || jsonb_build_object(
      'tipoDocumento', public.public_ficha_infer_tipo_documento(p_dni),
      'nroDocumento', p_dni
    );
END;
$$;

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
END;
$$;

CREATE OR REPLACE FUNCTION public.open_public_complementary_ficha(
  p_dni text,
  p_session_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_dni text := public.public_ficha_normalize_doc(p_dni);
  v_tipo text;
  ficha public.public_complementary_fichas;
  session_row public.public_complementary_ficha_sessions;
  token text;
  comp jsonb;
BEGIN
  IF v_dni IS NULL OR length(v_dni) < 5 OR length(v_dni) > 15 THEN
    RETURN jsonb_build_object('error', 'Ingresa un documento válido (DNI, CE o pasaporte)');
  END IF;

  IF nullif(btrim(coalesce(p_session_token, '')), '') IS NOT NULL THEN
    SELECT s.*
    INTO session_row
    FROM public.public_complementary_ficha_sessions s
    JOIN public.public_complementary_fichas f ON f.id = s.ficha_id
    WHERE s.session_token = btrim(p_session_token)
      AND s.expires_at > now()
      AND f.dni = v_dni
    LIMIT 1;

    IF FOUND THEN
      SELECT * INTO ficha FROM public.public_complementary_fichas WHERE id = session_row.ficha_id;
      RETURN public.public_ficha_payload(ficha, true, session_row.session_token);
    END IF;
  END IF;

  ficha := public.try_open_public_complementary_ficha(v_dni);
  IF ficha IS NULL THEN
    SELECT * INTO ficha
    FROM public.public_complementary_fichas f
    WHERE f.dni = v_dni;
  END IF;

  IF ficha IS NULL THEN
    INSERT INTO public.public_complementary_fichas (dni, open_count, last_opened_at)
    VALUES (v_dni, 1, now())
    RETURNING * INTO ficha;
  END IF;

  IF ficha IS NULL THEN
    RETURN jsonb_build_object('error', 'No se pudo abrir la ficha');
  END IF;

  v_tipo := public.public_ficha_infer_tipo_documento(v_dni);
  comp := coalesce(ficha.complementary, '{}'::jsonb);
  IF comp = '{}'::jsonb
     OR (comp - 'tipoDocumento' - 'nroDocumento' - 'submittedAt') = '{}'::jsonb THEN
    BEGIN
      comp := public.hydrate_public_complementary_ficha(v_dni, comp);
    EXCEPTION
      WHEN OTHERS THEN
        comp := jsonb_build_object('tipoDocumento', v_tipo, 'nroDocumento', v_dni);
    END;
    UPDATE public.public_complementary_fichas
    SET complementary = comp
    WHERE id = ficha.id;
    ficha.complementary := comp;
  ELSE
    comp := jsonb_set(comp, '{nroDocumento}', to_jsonb(v_dni), true);
    IF nullif(btrim(coalesce(comp ->> 'tipoDocumento', '')), '') IS NULL THEN
      comp := jsonb_set(comp, '{tipoDocumento}', to_jsonb(v_tipo), true);
    END IF;
    ficha.complementary := comp;
  END IF;

  token := gen_random_uuid()::text;
  INSERT INTO public.public_complementary_ficha_sessions (ficha_id, session_token, expires_at)
  VALUES (ficha.id, token, now() + interval '12 hours');

  RETURN public.public_ficha_payload(ficha, true, token);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'open_public_complementary_ficha: %', SQLERRM;
    RETURN jsonb_build_object('error', 'No se pudo abrir la ficha: ' || SQLERRM);
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
SET row_security = off
AS $$
DECLARE
  v_dni text := public.public_ficha_normalize_doc(p_dni);
  v_tipo text;
  ficha public.public_complementary_fichas;
  comp jsonb := coalesce(p_complementary, '{}'::jsonb);
BEGIN
  IF v_dni IS NULL OR length(v_dni) < 5 OR length(v_dni) > 15 THEN
    RETURN jsonb_build_object('error', 'Ingresa un documento válido (DNI, CE o pasaporte)');
  END IF;

  IF nullif(btrim(coalesce(p_session_token, '')), '') IS NULL THEN
    RETURN jsonb_build_object('error', 'Sesión vencida o sin cupos. Vuelve a ingresar tu documento.');
  END IF;

  SELECT f.*
  INTO ficha
  FROM public.public_complementary_ficha_sessions s
  JOIN public.public_complementary_fichas f ON f.id = s.ficha_id
  WHERE s.session_token = btrim(p_session_token)
    AND s.expires_at > now()
    AND f.dni = v_dni
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Sesión vencida o sin cupos. Vuelve a ingresar tu documento.');
  END IF;

  IF octet_length(comp::text) > 100000 THEN
    RETURN jsonb_build_object('error', 'La ficha es demasiado grande');
  END IF;

  v_tipo := nullif(btrim(coalesce(comp ->> 'tipoDocumento', '')), '');
  IF v_tipo IS NULL THEN
    v_tipo := public.public_ficha_infer_tipo_documento(v_dni);
  END IF;

  comp := comp || jsonb_build_object(
    'tipoDocumento', v_tipo,
    'nroDocumento', v_dni,
    'submittedAt', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  UPDATE public.public_complementary_fichas
  SET
    complementary = comp,
    last_saved_at = now()
  WHERE id = ficha.id
  RETURNING * INTO ficha;

  BEGIN
    PERFORM public.sync_public_complementary_ficha(v_dni, comp);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'sync_public_complementary_ficha: %', SQLERRM;
  END;

  RETURN public.public_ficha_payload(ficha, true, btrim(p_session_token));
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'save_public_complementary_ficha: %', SQLERRM;
    RETURN jsonb_build_object('error', 'No se pudo guardar la ficha: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_ficha_normalize_doc(text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.public_ficha_infer_tipo_documento(text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.open_public_complementary_ficha(text, text)
  TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.save_public_complementary_ficha(text, text, jsonb)
  TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.hydrate_public_complementary_ficha(text, jsonb) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.sync_public_complementary_ficha(text, jsonb) TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
