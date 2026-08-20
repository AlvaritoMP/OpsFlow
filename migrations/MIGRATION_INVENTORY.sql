-- Módulo de Inventario (Appinventario integrado en OpsFlow).
-- Ejecutar en SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS public.inv_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inv_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  low_stock_threshold integer NOT NULL DEFAULT 10,
  description text NOT NULL DEFAULT '',
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inv_stock (
  product_id uuid NOT NULL REFERENCES public.inv_products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.inv_warehouses(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS public.inv_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  product_name text NOT NULL,
  sku text NOT NULL DEFAULT '',
  warehouse_name text NOT NULL DEFAULT '',
  type text NOT NULL CHECK (type IN ('ENTRADA', 'SALIDA', 'AJUSTE', 'CREACIÓN')),
  quantity_change numeric NOT NULL DEFAULT 0,
  new_quantity_in_warehouse numeric NOT NULL DEFAULT 0,
  details text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  transaction_id uuid
);

CREATE TABLE IF NOT EXISTS public.inv_warehouse_access (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.inv_warehouses(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS public.inv_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_name text NOT NULL,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inv_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ruc text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  contact_person text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inv_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  supplier_id uuid REFERENCES public.inv_suppliers(id) ON DELETE SET NULL,
  issuing_company_id uuid REFERENCES public.inv_companies(id) ON DELETE SET NULL,
  destination_warehouse_id uuid REFERENCES public.inv_warehouses(id) ON DELETE SET NULL,
  issue_date timestamptz NOT NULL DEFAULT now(),
  delivery_date date,
  status text NOT NULL DEFAULT 'BORRADOR' CHECK (status IN ('BORRADOR', 'EMITIDA', 'RECIBIDA', 'CANCELADA')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  solicitante text NOT NULL DEFAULT '',
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inv_scheduled_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  title text NOT NULL,
  supplier_id uuid REFERENCES public.inv_suppliers(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inv_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  colors jsonb NOT NULL DEFAULT '{
    "inStock": "bg-green-50 text-green-700 border-green-200",
    "lowStock": "bg-amber-50 text-amber-700 border-amber-200",
    "outOfStock": "bg-red-50 text-red-700 border-red-200"
  }'::jsonb,
  alerts jsonb NOT NULL DEFAULT '{"defaultLowStockThreshold": 10}'::jsonb,
  purchase_order_settings jsonb NOT NULL DEFAULT '{"prefix": "OC-OPSFLOW-", "nextNumber": 1}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_products_sku ON public.inv_products(sku);
CREATE INDEX IF NOT EXISTS idx_inv_products_category ON public.inv_products(category);
CREATE INDEX IF NOT EXISTS idx_inv_stock_warehouse ON public.inv_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_timestamp ON public.inv_movements(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_inv_movements_txn ON public.inv_movements(transaction_id);
CREATE INDEX IF NOT EXISTS idx_inv_po_status ON public.inv_purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_inv_scheduled_date ON public.inv_scheduled_purchases(date);

INSERT INTO public.inv_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.inv_warehouses (name, location)
SELECT 'Almacén Principal', 'Sede central'
WHERE NOT EXISTS (SELECT 1 FROM public.inv_warehouses);

INSERT INTO public.inv_companies (profile_name, details)
SELECT 'Ópalo Perú',
  '[
    {"label": "Nombre Comercial", "value": "ÓPALO PERÚ"},
    {"label": "Razón Social", "value": "OPALO PERU SAC"},
    {"label": "RUC", "value": ""},
    {"label": "Dirección Fiscal", "value": ""}
  ]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.inv_companies);

-- OpsFlow usa autenticación propia + clave anónima; políticas permisivas para el cliente web.
ALTER TABLE public.inv_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_warehouse_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_scheduled_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inv_warehouses', 'inv_products', 'inv_stock', 'inv_movements',
    'inv_warehouse_access', 'inv_companies', 'inv_suppliers',
    'inv_purchase_orders', 'inv_scheduled_purchases', 'inv_settings'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS inv_all_access ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY inv_all_access ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t
    );
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated', t);
  END LOOP;
END $$;
