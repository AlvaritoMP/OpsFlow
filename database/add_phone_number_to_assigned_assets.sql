-- Agregar número telefónico para activos asignados (celular corporativo)
ALTER TABLE public.assigned_assets
ADD COLUMN IF NOT EXISTS phone_number TEXT;

COMMENT ON COLUMN public.assigned_assets.phone_number IS
'Número telefónico del activo cuando aplica (ej: celular corporativo)';
