-- Migración para crear la tabla user_visible_units
-- Esta tabla permite restringir qué unidades puede ver un usuario CLIENT específico

CREATE TABLE IF NOT EXISTS public.user_visible_units (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, unit_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_user_visible_units_user_id ON public.user_visible_units(user_id);
CREATE INDEX IF NOT EXISTS idx_user_visible_units_unit_id ON public.user_visible_units(unit_id);

-- Deshabilitar Row Level Security
-- NOTA: Este sistema usa autenticación personalizada (no Supabase Auth),
-- por lo que las políticas RLS basadas en auth.uid() no funcionan.
-- La verificación de permisos se hace en el frontend/aplicación.
-- Esto es consistente con otras tablas del sistema (users, units, etc.)
ALTER TABLE public.user_visible_units DISABLE ROW LEVEL SECURITY;

-- Nota: Si ya existe la tabla client_visible_units, puedes eliminarla con:
-- DROP TABLE IF EXISTS public.client_visible_units CASCADE;
