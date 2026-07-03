-- ============================================
-- Agregar salario y condición de trabajo al historial de contratos
-- ============================================
ALTER TABLE public.contract_history
ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS work_condition_amount NUMERIC(10,2);

COMMENT ON COLUMN public.contract_history.monthly_salary IS 'Salario bruto mensual vigente para este contrato';
COMMENT ON COLUMN public.contract_history.work_condition_amount IS 'Monto por condición de trabajo vigente para este contrato';
