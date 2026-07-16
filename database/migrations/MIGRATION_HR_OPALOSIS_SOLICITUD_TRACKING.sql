-- Extiende ítems de paquete con seguimiento de solicitud Opalosis
-- (IngresoCod, Estado, Etapa del workflow RRHH).
-- Ejecutar después de MIGRATION_HR_OPALOSIS_INTEGRATION.sql

ALTER TABLE public.hr_outbound_ingreso_package_items
  ADD COLUMN IF NOT EXISTS ingreso_cod TEXT NULL;

ALTER TABLE public.hr_outbound_ingreso_package_items
  ADD COLUMN IF NOT EXISTS opalosis_estado TEXT NULL;

ALTER TABLE public.hr_outbound_ingreso_package_items
  ADD COLUMN IF NOT EXISTS opalosis_etapa TEXT NULL;

-- Ampliar estados de ítem para reflejar "Recibido" en Opalosis
ALTER TABLE public.hr_outbound_ingreso_package_items
  DROP CONSTRAINT IF EXISTS hr_outbound_ingreso_package_items_item_status_check;

ALTER TABLE public.hr_outbound_ingreso_package_items
  ADD CONSTRAINT hr_outbound_ingreso_package_items_item_status_check
    CHECK (item_status IN ('pendiente', 'recibido', 'procesado', 'observado', 'rechazado'));

CREATE INDEX IF NOT EXISTS idx_hr_outbound_package_items_ingreso_cod
  ON public.hr_outbound_ingreso_package_items (ingreso_cod)
  WHERE ingreso_cod IS NOT NULL;

COMMENT ON COLUMN public.hr_outbound_ingreso_package_items.ingreso_cod IS
  'Código de seguimiento Opalosis (ej. ING-150726-02)';
COMMENT ON COLUMN public.hr_outbound_ingreso_package_items.opalosis_estado IS
  'Estado solicitud: Recibido | Observado | Procesado | Rechazado';
COMMENT ON COLUMN public.hr_outbound_ingreso_package_items.opalosis_etapa IS
  'Etapa workflow: Nuevo | Empleado Registrado | Contrato Generado | En Aprobación | Contrato Aprobado';
