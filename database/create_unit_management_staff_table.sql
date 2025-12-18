-- Tabla de relación many-to-many entre unidades y management staff
-- Permite asignar múltiples miembros del equipo de gestión a cada unidad

CREATE TABLE IF NOT EXISTS unit_management_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  management_staff_id UUID NOT NULL REFERENCES management_staff(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(unit_id, management_staff_id)
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_unit_management_staff_unit_id ON unit_management_staff(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_management_staff_staff_id ON unit_management_staff(management_staff_id);

-- Comentarios
COMMENT ON TABLE unit_management_staff IS 'Relación many-to-many entre unidades y miembros del equipo de gestión';
COMMENT ON COLUMN unit_management_staff.unit_id IS 'ID de la unidad';
COMMENT ON COLUMN unit_management_staff.management_staff_id IS 'ID del miembro del equipo de gestión';

