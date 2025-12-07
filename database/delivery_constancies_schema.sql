-- Esquema para tabla de constancias de entrega
-- Esta tabla almacena todas las constancias generadas

CREATE TABLE IF NOT EXISTS public.delivery_constancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE, -- Código correlativo único (ej: CONST-2024-000001)
    type TEXT NOT NULL CHECK (type IN ('ASSET', 'EQUIPMENT')), -- Tipo de constancia
    worker_id UUID, -- ID del trabajador (opcional, puede ser null para equipos de unidad)
    worker_name TEXT NOT NULL, -- Nombre del trabajador
    worker_dni TEXT NOT NULL, -- DNI del trabajador
    unit_id UUID NOT NULL, -- ID de la unidad
    unit_name TEXT NOT NULL, -- Nombre de la unidad
    items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array de items entregados
    date DATE NOT NULL, -- Fecha de entrega
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), -- Fecha de generación
    generated_by TEXT, -- Usuario que generó la constancia
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_delivery_constancies_code ON public.delivery_constancies(code);
CREATE INDEX IF NOT EXISTS idx_delivery_constancies_worker_id ON public.delivery_constancies(worker_id);
CREATE INDEX IF NOT EXISTS idx_delivery_constancies_unit_id ON public.delivery_constancies(unit_id);
CREATE INDEX IF NOT EXISTS idx_delivery_constancies_date ON public.delivery_constancies(date);
CREATE INDEX IF NOT EXISTS idx_delivery_constancies_type ON public.delivery_constancies(type);

-- Comentarios
COMMENT ON TABLE public.delivery_constancies IS 'Constancias de entrega de EPPs, activos y maquinarias';
COMMENT ON COLUMN public.delivery_constancies.code IS 'Código correlativo único de la constancia (formato: CONST-YYYY-000001)';
COMMENT ON COLUMN public.delivery_constancies.type IS 'Tipo de constancia: ASSET (activos/EPPs) o EQUIPMENT (maquinarias)';
COMMENT ON COLUMN public.delivery_constancies.items IS 'Array JSON con los items entregados: [{name, type, serialNumber, quantity, condition}]';

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_delivery_constancies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Eliminar trigger si existe antes de crearlo
DROP TRIGGER IF EXISTS trigger_update_delivery_constancies_updated_at ON public.delivery_constancies;

CREATE TRIGGER trigger_update_delivery_constancies_updated_at
    BEFORE UPDATE ON public.delivery_constancies
    FOR EACH ROW
    EXECUTE FUNCTION update_delivery_constancies_updated_at();

-- Deshabilitar RLS (si es necesario para apps internas)
ALTER TABLE public.delivery_constancies DISABLE ROW LEVEL SECURITY;

