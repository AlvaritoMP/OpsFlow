-- Detalle libre del cese. No reemplaza el motivo de la lista.
-- Ejecutar en el SQL Editor del proyecto OpsFlow.

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS termination_detail TEXT NULL;

COMMENT ON COLUMN public.resources.termination_detail IS
  'Texto libre que complementa el motivo del cese. No reemplaza termination_reason.';
