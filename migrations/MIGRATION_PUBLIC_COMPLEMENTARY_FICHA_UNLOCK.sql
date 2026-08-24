-- Quita el candado de /ficha. try_open ya no deja de devolver fila al 3er intento.
-- Ejecutar COMPLETO en SQL Editor de Supabase OpsFlow.

UPDATE public.public_complementary_fichas
SET open_count = 0, last_opened_at = NULL;

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
  RETURNING * INTO rec;

  RETURN rec;
END;
$$;

REVOKE ALL ON FUNCTION public.try_open_public_complementary_ficha(text) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.try_open_public_complementary_ficha(text) TO postgres, service_role;

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
  v_dni text := regexp_replace(coalesce(p_dni, ''), '[^0-9]', '', 'g');
  ficha public.public_complementary_fichas;
  session_row public.public_complementary_ficha_sessions;
  token text;
  comp jsonb;
BEGIN
  IF length(v_dni) <> 8 THEN
    RETURN jsonb_build_object('error', 'Ingresa un DNI válido de 8 dígitos');
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

  comp := coalesce(ficha.complementary, '{}'::jsonb);
  IF comp = '{}'::jsonb
     OR (comp - 'tipoDocumento' - 'nroDocumento' - 'submittedAt') = '{}'::jsonb THEN
    BEGIN
      comp := public.hydrate_public_complementary_ficha(v_dni, comp);
    EXCEPTION
      WHEN OTHERS THEN
        comp := jsonb_build_object('tipoDocumento', 'DNI', 'nroDocumento', v_dni);
    END;
    UPDATE public.public_complementary_fichas
    SET complementary = comp
    WHERE id = ficha.id;
    ficha.complementary := comp;
  ELSE
    comp := comp || jsonb_build_object('tipoDocumento', 'DNI', 'nroDocumento', v_dni);
    ficha.complementary := comp;
  END IF;

  token := gen_random_uuid()::text;
  INSERT INTO public.public_complementary_ficha_sessions (ficha_id, session_token, expires_at)
  VALUES (ficha.id, token, now() + interval '12 hours');

  -- Siempre editable. El contador de aperturas es informativo, no un candado.
  RETURN public.public_ficha_payload(ficha, true, token);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'open_public_complementary_ficha: %', SQLERRM;
    RETURN jsonb_build_object('error', 'No se pudo abrir la ficha: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_public_complementary_ficha(text, text)
  TO anon, authenticated, service_role, postgres;

NOTIFY pgrst, 'reload schema';
