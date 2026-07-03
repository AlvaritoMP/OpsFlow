-- Migración: Crear tabla para historial de incrementos salariales
-- Descripción: Almacena el historial de incrementos salariales de los trabajadores

CREATE TABLE IF NOT EXISTS public.salary_increments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL,
    previous_salary NUMERIC(10, 2) NOT NULL,
    new_salary NUMERIC(10, 2) NOT NULL,
    increment_date DATE NOT NULL,
    effective_date DATE NOT NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT salary_increments_resource_id_fkey 
        FOREIGN KEY (resource_id) 
        REFERENCES public.resources(id) 
        ON DELETE CASCADE
);

COMMENT ON TABLE public.salary_increments IS 'Historial de incrementos salariales de los trabajadores';
COMMENT ON COLUMN public.salary_increments.resource_id IS 'ID del trabajador (recurso de tipo Personal)';
COMMENT ON COLUMN public.salary_increments.previous_salary IS 'Salario anterior antes del incremento';
COMMENT ON COLUMN public.salary_increments.new_salary IS 'Nuevo salario después del incremento';
COMMENT ON COLUMN public.salary_increments.increment_date IS 'Fecha en que se registró el incremento';
COMMENT ON COLUMN public.salary_increments.effective_date IS 'Fecha de aplicación del incremento';
COMMENT ON COLUMN public.salary_increments.notes IS 'Notas adicionales sobre el incremento';

-- Deshabilitar RLS (consistente con otras tablas del sistema)
ALTER TABLE public.salary_increments DISABLE ROW LEVEL SECURITY;

-- Crear índice para búsquedas por trabajador
CREATE INDEX IF NOT EXISTS idx_salary_increments_resource_id 
    ON public.salary_increments(resource_id);

-- Crear índice para búsquedas por fecha
CREATE INDEX IF NOT EXISTS idx_salary_increments_effective_date 
    ON public.salary_increments(effective_date);
