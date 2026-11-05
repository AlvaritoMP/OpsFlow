-- Plantillas de pedido por unidad y pedido mensual consolidado.
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de MIGRATION_INVENTORY_LOGISTICS.sql.
-- Si esa migración aún no se ejecutó, puede correrse este archivo igual: solo crea tablas nuevas.

CREATE TABLE IF NOT EXISTS public.inv_order_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id text NOT NULL,
  unit_name text NOT NULL DEFAULT '',
  name text NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inv_order_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.inv_order_templates(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.inv_products(id) ON DELETE SET NULL,
  sku text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_inv_order_templates_unit ON public.inv_order_templates(unit_id);
CREATE INDEX IF NOT EXISTS idx_inv_order_template_items_tpl ON public.inv_order_template_items(template_id);

CREATE TABLE IF NOT EXISTS public.inv_monthly_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  period text NOT NULL,
  title text NOT NULL,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'BORRADOR' CHECK (status IN ('BORRADOR', 'CONFIRMADO')),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inv_monthly_order_sources (
  monthly_order_id uuid NOT NULL REFERENCES public.inv_monthly_orders(id) ON DELETE CASCADE,
  requisition_id uuid NOT NULL REFERENCES public.inv_requisitions(id) ON DELETE CASCADE,
  PRIMARY KEY (monthly_order_id, requisition_id)
);

CREATE TABLE IF NOT EXISTS public.inv_monthly_order_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_order_id uuid NOT NULL REFERENCES public.inv_monthly_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.inv_products(id) ON DELETE SET NULL,
  sku text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit_id text,
  unit_name text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_inv_monthly_orders_period ON public.inv_monthly_orders(period);
CREATE INDEX IF NOT EXISTS idx_inv_monthly_extras_order ON public.inv_monthly_order_extras(monthly_order_id);

ALTER TABLE public.inv_order_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_order_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_monthly_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_monthly_order_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_monthly_order_extras ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inv_order_templates', 'inv_order_template_items',
    'inv_monthly_orders', 'inv_monthly_order_sources', 'inv_monthly_order_extras'
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
