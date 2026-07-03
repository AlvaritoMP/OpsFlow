-- ============================================
-- MIGRACIÓN: Agregar campo birth_date a resources
-- ============================================
-- Descripción: Añade campo de fecha de nacimiento para personal
-- Fecha: 2026-01-XX

-- Agregar columna birth_date como DATE
-- Almacena la fecha de nacimiento del trabajador (YYYY-MM-DD)
ALTER TABLE public.resources
ADD COLUMN IF NOT EXISTS birth_date DATE NULL;

-- Comentario para documentar la columna
COMMENT ON COLUMN public.resources.birth_date IS 'Fecha de nacimiento del trabajador (solo para recursos de tipo Personal). Formato: YYYY-MM-DD';

-- Crear índice para búsquedas rápidas por fecha de nacimiento (útil para alertas de cumpleaños)
CREATE INDEX IF NOT EXISTS idx_resources_birth_date ON public.resources(birth_date) 
WHERE type = 'Personal' AND birth_date IS NOT NULL;
