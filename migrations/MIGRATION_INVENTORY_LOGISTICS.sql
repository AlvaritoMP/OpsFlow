-- Logística de inventario: empresa adquiriente, stock por empresa y pedidos de unidad.
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de
-- MIGRATION_INVENTORY.sql y MIGRATION_INVENTORY_CONSUMPTION.sql.

ALTER TABLE public.inv_movements
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.inv_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_name text;

CREATE TABLE IF NOT EXISTS public.inv_company_stock (
  product_id uuid NOT NULL REFERENCES public.inv_products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.inv_warehouses(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.inv_companies(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, warehouse_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_company_stock_company ON public.inv_company_stock(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_company_stock_warehouse ON public.inv_company_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_company ON public.inv_movements(company_id);

CREATE TABLE IF NOT EXISTS public.inv_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  unit_id text NOT NULL,
  unit_name text NOT NULL,
  status text NOT NULL DEFAULT 'SOLICITADO'
    CHECK (status IN ('SOLICITADO', 'DESPACHADO', 'PARCIAL', 'RECHAZADO', 'CANCELADO')),
  notes text NOT NULL DEFAULT '',
  requested_by text NOT NULL DEFAULT '',
  requested_by_user_id uuid,
  decided_by text,
  decision_note text NOT NULL DEFAULT '',
  source_warehouse_id uuid REFERENCES public.inv_warehouses(id) ON DELETE SET NULL,
  destination_warehouse_id uuid REFERENCES public.inv_warehouses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.inv_requisition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.inv_requisitions(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.inv_products(id) ON DELETE SET NULL,
  sku text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  quantity_requested numeric NOT NULL DEFAULT 0,
  quantity_approved numeric NOT NULL DEFAULT 0,
  company_id uuid REFERENCES public.inv_companies(id) ON DELETE SET NULL,
  company_name text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_inv_requisitions_unit ON public.inv_requisitions(unit_id);
CREATE INDEX IF NOT EXISTS idx_inv_requisitions_status ON public.inv_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_inv_requisition_items_req ON public.inv_requisition_items(requisition_id);

-- Rol de administrador de almacén.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'OPERATIONS', 'OPERATIONS_SUPERVISOR', 'WAREHOUSE_ADMIN', 'COMMERCIAL', 'CLIENT'));

ALTER TABLE public.inv_company_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_requisition_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inv_company_stock', 'inv_requisitions', 'inv_requisition_items']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS inv_all_access ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY inv_all_access ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t
    );
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated', t);
  END LOOP;
END $$;
