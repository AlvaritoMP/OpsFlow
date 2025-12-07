-- Agregar campos de constancia a la tabla assigned_assets
-- Este script agrega los campos necesarios para almacenar códigos de constancia

-- Agregar columna constancy_code si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'assigned_assets' 
        AND column_name = 'constancy_code'
    ) THEN
        ALTER TABLE public.assigned_assets 
        ADD COLUMN constancy_code TEXT;
        
        COMMENT ON COLUMN public.assigned_assets.constancy_code IS 'Código correlativo de la constancia de entrega (formato: CONST-YYYY-000001)';
    END IF;
END $$;

-- Agregar columna constancy_generated_at si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'assigned_assets' 
        AND column_name = 'constancy_generated_at'
    ) THEN
        ALTER TABLE public.assigned_assets 
        ADD COLUMN constancy_generated_at TIMESTAMP WITH TIME ZONE;
        
        COMMENT ON COLUMN public.assigned_assets.constancy_generated_at IS 'Fecha y hora de generación de la constancia';
    END IF;
END $$;

-- Crear índice para búsquedas por código de constancia
CREATE INDEX IF NOT EXISTS idx_assigned_assets_constancy_code 
ON public.assigned_assets(constancy_code);

-- Verificar que las columnas se agregaron correctamente
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'assigned_assets'
  AND column_name IN ('constancy_code', 'constancy_generated_at')
ORDER BY column_name;

