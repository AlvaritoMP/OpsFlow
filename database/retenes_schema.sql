-- ============================================
-- SCHEMA PARA GESTIÓN DE RETENES
-- Descripción: Sistema de administración y coordinación de retenes
-- que cubren faltas de personal en unidades de manera diaria
-- ============================================

-- Tabla de Retenes (Trabajadores disponibles para cobertura)
CREATE TABLE IF NOT EXISTS retenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  dni TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL, -- Teléfono para WhatsApp
  email TEXT,
  status TEXT NOT NULL DEFAULT 'disponible' CHECK (status IN ('disponible', 'asignado', 'no_disponible')),
  notes TEXT, -- Notas adicionales sobre el retén
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

-- Tabla de Asignaciones de Retenes (Coberturas diarias)
CREATE TABLE IF NOT EXISTS reten_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reten_id UUID NOT NULL REFERENCES retenes(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL, -- Referencia a unidad (puede ser de tabla units)
  unit_name TEXT NOT NULL, -- Nombre de la unidad (para evitar joins)
  assignment_date DATE NOT NULL, -- Fecha de la asignación
  start_time TIME NOT NULL, -- Hora aproximada de llegada
  end_time TIME NOT NULL, -- Hora de salida
  assignment_type TEXT NOT NULL DEFAULT 'planificada' CHECK (assignment_type IN ('planificada', 'inmediata')),
  reason TEXT, -- Razón de la cobertura (falta de personal, etc.)
  status TEXT NOT NULL DEFAULT 'programada' CHECK (status IN ('programada', 'en_curso', 'completada', 'cancelada')),
  constancy_code TEXT UNIQUE, -- Código de constancia generada (ej: RET-2024-000001)
  constancy_generated_at TIMESTAMP WITH TIME ZONE, -- Fecha de generación de constancia
  whatsapp_sent BOOLEAN DEFAULT false, -- Si se envió por WhatsApp
  whatsapp_sent_at TIMESTAMP WITH TIME ZONE, -- Fecha de envío por WhatsApp
  notes TEXT, -- Notas adicionales de la asignación
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,
  UNIQUE(reten_id, assignment_date, start_time) -- Evitar asignaciones duplicadas
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_retenes_dni ON retenes(dni);
CREATE INDEX IF NOT EXISTS idx_retenes_status ON retenes(status);
CREATE INDEX IF NOT EXISTS idx_retenes_phone ON retenes(phone);
CREATE INDEX IF NOT EXISTS idx_reten_assignments_reten_id ON reten_assignments(reten_id);
CREATE INDEX IF NOT EXISTS idx_reten_assignments_unit_id ON reten_assignments(unit_id);
CREATE INDEX IF NOT EXISTS idx_reten_assignments_date ON reten_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS idx_reten_assignments_status ON reten_assignments(status);
CREATE INDEX IF NOT EXISTS idx_reten_assignments_type ON reten_assignments(assignment_type);
CREATE INDEX IF NOT EXISTS idx_reten_assignments_constancy_code ON reten_assignments(constancy_code);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_retenes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar updated_at
CREATE TRIGGER update_retenes_updated_at
  BEFORE UPDATE ON retenes
  FOR EACH ROW
  EXECUTE FUNCTION update_retenes_updated_at();

CREATE TRIGGER update_reten_assignments_updated_at
  BEFORE UPDATE ON reten_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_retenes_updated_at();

-- Función para generar código de constancia
CREATE OR REPLACE FUNCTION generate_constancy_code()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  code TEXT;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  
  -- Obtener el siguiente número de secuencia para el año actual
  SELECT COALESCE(MAX(CAST(SUBSTRING(constancy_code FROM '\d+$') AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM reten_assignments
  WHERE constancy_code LIKE 'RET-' || year_part || '-%';
  
  code := 'RET-' || year_part || '-' || LPAD(sequence_num::TEXT, 6, '0');
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Comentarios
COMMENT ON TABLE retenes IS 'Trabajadores disponibles para cubrir faltas de personal (retenes)';
COMMENT ON COLUMN retenes.name IS 'Nombre completo del retén';
COMMENT ON COLUMN retenes.dni IS 'DNI único del retén';
COMMENT ON COLUMN retenes.phone IS 'Teléfono para contacto y envío de constancias por WhatsApp';
COMMENT ON COLUMN retenes.status IS 'Estado del retén: disponible, asignado, no_disponible';
COMMENT ON TABLE reten_assignments IS 'Asignaciones diarias de retenes para cubrir faltas en unidades';
COMMENT ON COLUMN reten_assignments.assignment_date IS 'Fecha de la asignación';
COMMENT ON COLUMN reten_assignments.start_time IS 'Hora aproximada de llegada a la unidad';
COMMENT ON COLUMN reten_assignments.end_time IS 'Hora de salida de la unidad';
COMMENT ON COLUMN reten_assignments.assignment_type IS 'Tipo: planificada o inmediata';
COMMENT ON COLUMN reten_assignments.constancy_code IS 'Código único de constancia generada';
COMMENT ON COLUMN reten_assignments.whatsapp_sent IS 'Indica si la constancia fue enviada por WhatsApp';

-- Deshabilitar RLS (para apps internas)
ALTER TABLE retenes DISABLE ROW LEVEL SECURITY;
ALTER TABLE reten_assignments DISABLE ROW LEVEL SECURITY;

