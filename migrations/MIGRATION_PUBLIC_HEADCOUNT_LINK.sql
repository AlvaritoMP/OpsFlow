-- Enlace público de solo lectura del cuadro de Headcount.
-- El token no autoriza nada por sí solo: la Edge Function public-headcount
-- lo valida y solo entrega datos entre las 08:00 y las 18:00 (America/Lima).
-- anon y authenticated no pueden leer esta tabla.

CREATE TABLE IF NOT EXISTS public.public_headcount_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_public_headcount_links_active
  ON public.public_headcount_links (created_at DESC)
  WHERE revoked_at IS NULL;

-- Un solo enlace vigente a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_headcount_links_one_active
  ON public.public_headcount_links ((1))
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.public_headcount_links IS
  'Token del enlace público de Headcount. Solo lo usa la Edge Function con service role.';

ALTER TABLE public.public_headcount_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_headcount_links FROM PUBLIC, anon, authenticated;
