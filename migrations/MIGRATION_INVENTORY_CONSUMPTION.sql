-- Descarga de stock: almacenes de unidad, consumo y entrega.
-- Ejecutar en SQL Editor de Supabase DESPUÉS de MIGRATION_INVENTORY.sql.

ALTER TABLE public.inv_warehouses
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'CENTRAL',
  ADD COLUMN IF NOT EXISTS unit_id text,
  ADD COLUMN IF NOT EXISTS unit_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inv_warehouses_kind_check'
  ) THEN
    ALTER TABLE public.inv_warehouses
      ADD CONSTRAINT inv_warehouses_kind_check CHECK (kind IN ('CENTRAL', 'UNIT'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inv_warehouses_kind ON public.inv_warehouses(kind);
CREATE INDEX IF NOT EXISTS idx_inv_warehouses_unit ON public.inv_warehouses(unit_id);

ALTER TABLE public.inv_movements
  ADD COLUMN IF NOT EXISTS recipient text,
  ADD COLUMN IF NOT EXISTS consumption_reason text,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid;

ALTER TABLE public.inv_movements DROP CONSTRAINT IF EXISTS inv_movements_type_check;
ALTER TABLE public.inv_movements
  ADD CONSTRAINT inv_movements_type_check
  CHECK (type IN ('ENTRADA', 'SALIDA', 'AJUSTE', 'CREACIÓN', 'CONSUMO', 'ENTREGA'));
