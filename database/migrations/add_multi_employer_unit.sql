-- Unidad que agrupa trabajadores de más de una razón social del grupo
-- (Staff Opalo: Opalo Peru 103, Opalo Intermediación 104, Opalo Tercerización 153).
-- La razón social de cada trabajador vive en el recurso, no en la unidad.

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS multi_employer BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.units.multi_employer IS
  'Si es true, la unidad puede agrupar personal de varias razones sociales del grupo. Lo activa un administrador.';

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS employer_company_code INTEGER NULL;

COMMENT ON COLUMN public.resources.employer_company_code IS
  'Código Opalosis de la razón social empleadora (103 Opalo Peru, 104 Opalo Intermediación, 153 Opalo Tercerización).';

CREATE INDEX IF NOT EXISTS idx_resources_employer_company_code
  ON public.resources (employer_company_code)
  WHERE employer_company_code IS NOT NULL;
