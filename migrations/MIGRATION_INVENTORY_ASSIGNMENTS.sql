-- Productos que se asignan a un trabajador (equipo de cómputo, herramienta, bien de uso personal)
-- y la custodia registrada después de que el almacén despacha el pedido a la unidad.
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de MIGRATION_INVENTORY_LOGISTICS.sql.

ALTER TABLE public.inv_products
  ADD COLUMN IF NOT EXISTS assign_to_worker boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.inv_worker_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.inv_products(id) ON DELETE SET NULL,
  sku text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  unit_id text NOT NULL,
  unit_name text NOT NULL DEFAULT '',
  warehouse_id uuid REFERENCES public.inv_warehouses(id) ON DELETE SET NULL,
  requisition_id uuid REFERENCES public.inv_requisitions(id) ON DELETE SET NULL,
  requisition_code text NOT NULL DEFAULT '',
  requisition_item_id uuid REFERENCES public.inv_requisition_items(id) ON DELETE SET NULL,
  worker_id text NOT NULL,
  worker_name text NOT NULL,
  worker_document text NOT NULL DEFAULT '',
  quantity numeric NOT NULL CHECK (quantity > 0),
  item_label text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ASIGNADO' CHECK (status IN ('ASIGNADO', 'DEVUELTO')),
  company_id uuid REFERENCES public.inv_companies(id) ON DELETE SET NULL,
  company_name text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  assigned_by text NOT NULL DEFAULT '',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  returned_by text,
  returned_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_inv_worker_assignments_unit ON public.inv_worker_assignments(unit_id);
CREATE INDEX IF NOT EXISTS idx_inv_worker_assignments_item ON public.inv_worker_assignments(requisition_item_id);
CREATE INDEX IF NOT EXISTS idx_inv_worker_assignments_status ON public.inv_worker_assignments(status);

ALTER TABLE public.inv_worker_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS inv_all_access ON public.inv_worker_assignments';
  EXECUTE 'CREATE POLICY inv_all_access ON public.inv_worker_assignments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'GRANT ALL ON TABLE public.inv_worker_assignments TO anon, authenticated';
END $$;
