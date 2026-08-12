-- Landing público de ficha complementaria (sin login).
-- Cada DNI puede abrir la ficha hasta 3 veces; luego queda solo lectura.
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

COMMENT ON TABLE public.public_complementary_fichas IS
  'Fichas complementarias capturadas desde el landing público /ficha. Límite de aperturas por DNI.';

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

-- Incrementa open_count solo si aún hay cupo.
-- Devuelve la fila si se abrió (incluye la 3.ª vez). Devuelve NULL si ya no hay cupos.
CREATE OR REPLACE FUNCTION public.try_open_public_complementary_ficha(p_dni text)
RETURNS public.public_complementary_fichas
LANGUAGE plpgsql
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
GRANT ALL ON FUNCTION public.try_open_public_complementary_ficha(text) TO service_role;
