-- ============================================
-- TABLA: standard_assets
-- Descripción: Catálogo de EPPs y activos estándar
-- para estandarizar la nomenclatura al asignar
-- ============================================

-- Crear tabla
CREATE TABLE IF NOT EXISTS standard_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('EPP', 'Uniforme', 'Tecnologia', 'Herramienta', 'Otro')),
  description TEXT,
  default_serial_number_prefix VARCHAR(50), -- Prefijo para números de serie (ej: "BS-", "UNI-")
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255),
  updated_by VARCHAR(255)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_standard_assets_type ON standard_assets(type);
CREATE INDEX IF NOT EXISTS idx_standard_assets_active ON standard_assets(is_active);
CREATE INDEX IF NOT EXISTS idx_standard_assets_name ON standard_assets(name);

-- Comentarios
COMMENT ON TABLE standard_assets IS 'Catálogo de EPPs y activos estándar para estandarizar nomenclatura';
COMMENT ON COLUMN standard_assets.name IS 'Nombre estándar del activo (ej: "Botas de Seguridad", "Casco de Seguridad")';
COMMENT ON COLUMN standard_assets.type IS 'Tipo de activo: EPP, Uniforme, Tecnologia, Herramienta, Otro';
COMMENT ON COLUMN standard_assets.description IS 'Descripción opcional del activo';
COMMENT ON COLUMN standard_assets.default_serial_number_prefix IS 'Prefijo sugerido para números de serie';
COMMENT ON COLUMN standard_assets.is_active IS 'Si el activo está activo y disponible para asignación';

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_standard_assets_updated_at ON standard_assets;
CREATE TRIGGER trigger_update_standard_assets_updated_at
  BEFORE UPDATE ON standard_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Deshabilitar RLS (para apps internas)
ALTER TABLE standard_assets DISABLE ROW LEVEL SECURITY;

-- Datos iniciales (opcional)
INSERT INTO standard_assets (name, type, description, is_active) VALUES
  ('Botas de Seguridad', 'EPP', 'Botas de seguridad con puntera de acero', true),
  ('Casco de Seguridad', 'EPP', 'Casco de seguridad industrial', true),
  ('Lentes de Seguridad', 'EPP', 'Lentes de protección ocular', true),
  ('Guantes de Seguridad', 'EPP', 'Guantes de protección para trabajo', true),
  ('Uniforme de Trabajo', 'Uniforme', 'Uniforme estándar de trabajo', true),
  ('Chaleco Reflectante', 'EPP', 'Chaleco de alta visibilidad', true),
  ('Celular Corporativo', 'Tecnologia', 'Dispositivo móvil para comunicación', true),
  ('Laptop Corporativa', 'Tecnologia', 'Computadora portátil para trabajo', true),
  ('Taladro Eléctrico', 'Herramienta', 'Herramienta eléctrica portátil', true),
  ('Multímetro', 'Herramienta', 'Instrumento de medición eléctrica', true)
ON CONFLICT DO NOTHING;

