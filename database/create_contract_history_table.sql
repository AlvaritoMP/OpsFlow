-- Crear tabla para historial de contratos/renovaciones
CREATE TABLE IF NOT EXISTS contract_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  contract_number INTEGER NOT NULL DEFAULT 1, -- Número de contrato (1 = inicial, 2+ = renovaciones)
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'finalizado', 'renovado')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT contract_dates_check CHECK (end_date >= start_date)
);

-- Índice para búsquedas rápidas por trabajador
CREATE INDEX IF NOT EXISTS idx_contract_history_resource_id ON contract_history(resource_id);

-- Índice para ordenar contratos por fecha
CREATE INDEX IF NOT EXISTS idx_contract_history_dates ON contract_history(start_date DESC, end_date DESC);

-- Comentarios
COMMENT ON TABLE contract_history IS 'Historial de contratos y renovaciones de trabajadores';
COMMENT ON COLUMN contract_history.contract_number IS 'Número secuencial del contrato (1 = inicial, 2+ = renovaciones)';
COMMENT ON COLUMN contract_history.status IS 'Estado del contrato: activo, finalizado, renovado';
COMMENT ON COLUMN contract_history.start_date IS 'Fecha de inicio del contrato';
COMMENT ON COLUMN contract_history.end_date IS 'Fecha de fin del contrato';

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_contract_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear el trigger solo si no existe (evita error si ya existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_update_contract_history_updated_at' 
    AND tgrelid = 'contract_history'::regclass
  ) THEN
    CREATE TRIGGER trigger_update_contract_history_updated_at
      BEFORE UPDATE ON contract_history
      FOR EACH ROW
      EXECUTE FUNCTION update_contract_history_updated_at();
  END IF;
END $$;
