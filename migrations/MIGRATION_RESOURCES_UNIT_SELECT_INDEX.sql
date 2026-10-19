-- Acelera el desplegable de /falta: operarios de una unidad, ordenados por nombre.
CREATE INDEX IF NOT EXISTS idx_resources_personal_by_unit
  ON public.resources (unit_id, name)
  WHERE type = 'Personal' AND COALESCE(archived, false) = false;
