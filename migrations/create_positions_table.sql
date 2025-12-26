-- ============================================
-- MIGRACIÓN: Crear tabla de puestos predefinidos
-- ============================================

-- Crear tabla positions
CREATE TABLE IF NOT EXISTS positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- Crear índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_positions_name ON positions(name);
CREATE INDEX IF NOT EXISTS idx_positions_is_active ON positions(is_active);

-- Habilitar RLS (Row Level Security)
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

-- Política: Todos los usuarios autenticados pueden ver puestos activos
CREATE POLICY "Users can view active positions"
    ON positions FOR SELECT
    USING (auth.role() = 'authenticated' AND is_active = true);

-- Política: Solo ADMIN y SUPER_ADMIN pueden ver todos los puestos (incluidos inactivos)
CREATE POLICY "Admins can view all positions"
    ON positions FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('ADMIN', 'SUPER_ADMIN')
        )
    );

-- Política: Solo ADMIN y SUPER_ADMIN pueden insertar puestos
CREATE POLICY "Admins can insert positions"
    ON positions FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('ADMIN', 'SUPER_ADMIN')
        )
    );

-- Política: Solo ADMIN y SUPER_ADMIN pueden actualizar puestos
CREATE POLICY "Admins can update positions"
    ON positions FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('ADMIN', 'SUPER_ADMIN')
        )
    );

-- Política: Solo ADMIN y SUPER_ADMIN pueden eliminar puestos
CREATE POLICY "Admins can delete positions"
    ON positions FOR DELETE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('ADMIN', 'SUPER_ADMIN')
        )
    );

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_positions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
CREATE TRIGGER update_positions_updated_at
    BEFORE UPDATE ON positions
    FOR EACH ROW
    EXECUTE FUNCTION update_positions_updated_at();

-- Insertar algunos puestos de ejemplo (opcional)
INSERT INTO positions (name, description, is_active) VALUES
    ('Supervisor', 'Supervisor de operaciones', true),
    ('Operario de Limpieza', 'Personal de limpieza y mantenimiento', true),
    ('Seguridad', 'Personal de seguridad y vigilancia', true),
    ('Jefe de Turno', 'Jefe responsable del turno', true),
    ('Auxiliar', 'Personal auxiliar de apoyo', true)
ON CONFLICT DO NOTHING;

