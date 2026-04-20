-- ============================================
-- RENÚMERO DE CONTRATOS PARA RENOVACIONES HISTÓRICAS
-- ============================================
-- Objetivo:
-- - Si un trabajador ya tenía fecha de inicio laboral (resources.start_date),
--   pero su historial de contratos no contiene ese contrato inicial,
--   entonces su primera renovación no debe ser #1 sino #2.
-- - Este script renumera esos casos para que la secuencia empiece en 2.
--
-- Criterio aplicado:
-- - Recurso de tipo Personal con contratos en contract_history.
-- - resources.start_date NO es null.
-- - No existe un contrato con start_date = resources.start_date.
--
-- Resultado:
-- - Se recalcula contract_number en orden cronológico por trabajador,
--   iniciando en 2 (row_number + 1).

WITH resources_missing_initial_contract AS (
  SELECT r.id AS resource_id
  FROM public.resources r
  WHERE r.type = 'Personal'
    AND r.start_date IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.contract_history ch
      WHERE ch.resource_id = r.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.contract_history ch
      WHERE ch.resource_id = r.id
        AND ch.start_date = r.start_date
    )
),
renumbered AS (
  SELECT
    ch.id,
    ROW_NUMBER() OVER (
      PARTITION BY ch.resource_id
      ORDER BY ch.start_date ASC, ch.contract_number ASC, ch.created_at ASC
    ) + 1 AS new_contract_number
  FROM public.contract_history ch
  INNER JOIN resources_missing_initial_contract m
    ON m.resource_id = ch.resource_id
)
UPDATE public.contract_history ch
SET contract_number = r.new_contract_number
FROM renumbered r
WHERE ch.id = r.id;
