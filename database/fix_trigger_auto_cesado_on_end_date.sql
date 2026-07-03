-- ============================================
-- FIX: Evitar cambio automático a "cesado" por end_date
-- ============================================
-- Problema:
-- El trigger trigger_update_personnel_status ejecutaba la función
-- update_personnel_status_on_end_date() y cambiaba automáticamente
-- personnel_status a 'cesado' cuando end_date cambiaba.
--
-- Impacto:
-- En renovaciones de contrato (donde se actualiza end_date referencial),
-- trabajadores activos terminaban en "cesado" sin acción explícita.
--
-- Solución:
-- 1) Convertir la función a no-op (mantiene trigger sin lógica automática).
-- 2) Corregir registros activos mal marcados como cesado.

CREATE OR REPLACE FUNCTION public.update_personnel_status_on_end_date()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- end_date es solo referencial para monitoreo de contrato.
  -- El estado del trabajador se gestiona manualmente mediante
  -- el flujo de cese/archivo explícito.
  RETURN NEW;
END;
$function$;

-- Corrección de datos inconsistentes:
-- Si un trabajador tiene contrato activo y no está archivado,
-- su estado no debe ser "cesado".
UPDATE public.resources r
SET personnel_status = 'activo'
WHERE r.type = 'Personal'
  AND COALESCE(r.archived, false) = false
  AND r.personnel_status = 'cesado'
  AND EXISTS (
    SELECT 1
    FROM public.contract_history ch
    WHERE ch.resource_id = r.id
      AND ch.status = 'activo'
  );
