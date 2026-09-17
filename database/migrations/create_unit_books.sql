-- Unit Book: folleto de incorporación por unidad
-- Contenido editable (objetivo, pisos, fotos, perfiles del equipo) para entregar a candidatos nuevos.

CREATE TABLE IF NOT EXISTS public.unit_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL UNIQUE REFERENCES public.units(id) ON DELETE CASCADE,
  service_objective TEXT,
  floor_count INTEGER,
  welcome_message TEXT,
  work_schedule TEXT,
  dress_code TEXT,
  access_instructions TEXT,
  important_notes TEXT,
  custom_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.unit_book_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.unit_book_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  functions TEXT,
  experience TEXT,
  work_zone TEXT,
  colleague_message TEXT,
  include_in_book BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (unit_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_unit_books_unit_id ON public.unit_books(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_book_photos_unit_id ON public.unit_book_photos(unit_id, display_order);
CREATE INDEX IF NOT EXISTS idx_unit_book_members_unit_id ON public.unit_book_members(unit_id, display_order);
CREATE INDEX IF NOT EXISTS idx_unit_book_members_resource ON public.unit_book_members(resource_id);

COMMENT ON TABLE public.unit_books IS 'Contenido editorial del Unit Book (folleto de incorporación) por unidad';
COMMENT ON TABLE public.unit_book_photos IS 'Fotos de la unidad incluidas en el Unit Book';
COMMENT ON TABLE public.unit_book_members IS 'Perfil de cada colaborador en el Unit Book (funciones, experiencia, mensaje)';
COMMENT ON COLUMN public.unit_books.service_objective IS 'Objetivo del servicio que se presta en la unidad';
COMMENT ON COLUMN public.unit_books.floor_count IS 'Cantidad de pisos o niveles del inmueble';
COMMENT ON COLUMN public.unit_books.custom_sections IS 'Secciones extra editables: [{id, title, body}]';
COMMENT ON COLUMN public.unit_book_members.colleague_message IS 'Mensaje del colaborador a sus colegas / nuevos ingresos';

-- RLS permisivo (misma convención OpsFlow / anon key)
ALTER TABLE public.unit_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_book_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_book_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsflow_allow_ops ON public.unit_books;
CREATE POLICY opsflow_allow_ops ON public.unit_books
  AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS opsflow_allow_ops ON public.unit_book_photos;
CREATE POLICY opsflow_allow_ops ON public.unit_book_photos
  AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS opsflow_allow_ops ON public.unit_book_members;
CREATE POLICY opsflow_allow_ops ON public.unit_book_members
  AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
