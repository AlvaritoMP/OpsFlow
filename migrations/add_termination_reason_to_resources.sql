-- Motivo del cese/archivo del trabajador (recurso tipo Personal)
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS termination_reason TEXT NULL;

COMMENT ON COLUMN public.resources.termination_reason IS
  'Motivo del cese o archivo del trabajador (ej. fin de contrato, renuncia, despido). Solo Personal.';
