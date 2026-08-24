-- Desbloquea /ficha: los 3 intentos de prueba dejaron open_count en el tope.
-- Ejecutar completo en SQL Editor de Supabase OpsFlow.

-- 1) Quitar el candado de TODAS las fichas públicas (incluye 46896659).
UPDATE public.public_complementary_fichas
SET open_count = 0, last_opened_at = NULL;

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
  opened public.public_complementary_fichas;
  can_edit boolean := false;
  token text;
  comp jsonb;
  ficha_status text;
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

  opened := public.try_open_public_complementary_ficha(v_dni);

  -- Si ya no hay cupos, reabrir cuando la ficha aún no está completa.
  IF opened IS NULL OR opened.id IS NULL THEN
    SELECT * INTO ficha
    FROM public.public_complementary_fichas f
    WHERE f.dni = v_dni;

    IF FOUND THEN
      ficha_status := public.public_ficha_status(coalesce(ficha.complementary, '{}'::jsonb));
      IF ficha.last_saved_at IS NULL OR ficha_status IN ('missing', 'incomplete') THEN
        UPDATE public.public_complementary_fichas f
        SET open_count = 0, last_opened_at = NULL
        WHERE f.dni = v_dni;

        opened := public.try_open_public_complementary_ficha(v_dni);
      END IF;
    END IF;
  END IF;

  IF opened IS NOT NULL AND opened.id IS NOT NULL THEN
    can_edit := true;
    ficha := opened;
  ELSE
    can_edit := false;
    SELECT * INTO ficha
    FROM public.public_complementary_fichas f
    WHERE f.dni = v_dni;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'No se pudo abrir la ficha');
    END IF;
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
    RETURN jsonb_build_object('error', 'No se pudo abrir la ficha: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_public_complementary_ficha(text, text) TO anon, authenticated, service_role, postgres;

NOTIFY pgrst, 'reload schema';
