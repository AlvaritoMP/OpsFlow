-- Migración: Añadir campos de salario a la tabla resources
-- Descripción: Añade campos para salario bruto mensual y condición de trabajo

-- Añadir columna de salario bruto mensual
ALTER TABLE public.resources
ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(10, 2) NULL;

-- Añadir comentario a la columna monthly_salary
COMMENT ON COLUMN public.resources.monthly_salary IS 'Salario bruto mensual del trabajador (solo para recursos de tipo Personal)';

-- Añadir columna de monto por condición de trabajo
ALTER TABLE public.resources
ADD COLUMN IF NOT EXISTS work_condition_amount NUMERIC(10, 2) NULL;

-- Añadir comentario a la columna work_condition_amount
COMMENT ON COLUMN public.resources.work_condition_amount IS 'Monto adicional por condición de trabajo del trabajador (solo para recursos de tipo Personal)';
