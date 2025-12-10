-- ============================================
-- ESQUEMA DE BASE DE DATOS: SUPERVISIÓN NOCTURNA
-- ============================================

-- Tabla: night_supervision_shifts
-- Almacena los turnos de supervisión nocturna
CREATE TABLE IF NOT EXISTS night_supervision_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  unit_name TEXT NOT NULL,
  supervisor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  supervisor_name TEXT NOT NULL,
  shift_start TIME NOT NULL, -- Hora de inicio del turno (HH:mm)
  shift_end TIME NOT NULL, -- Hora de fin del turno (HH:mm)
  status TEXT NOT NULL DEFAULT 'en_curso' CHECK (status IN ('en_curso', 'completada', 'incompleta', 'cancelada')),
  completion_percentage INTEGER NOT NULL DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  UNIQUE(date, unit_id, supervisor_id) -- Un supervisor por unidad por día
);

-- Tabla: night_supervision_calls
-- Almacena las llamadas realizadas a trabajadores nocturnos
CREATE TABLE IF NOT EXISTS night_supervision_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES night_supervision_shifts(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL, -- ID del trabajador (resource de tipo PERSONNEL)
  worker_name TEXT NOT NULL,
  worker_phone TEXT NOT NULL,
  call_number INTEGER NOT NULL CHECK (call_number IN (1, 2, 3)), -- Primera, segunda o tercera llamada
  scheduled_time TIME NOT NULL, -- Hora programada de la llamada (HH:mm)
  actual_time TIME, -- Hora real en que se hizo la llamada (HH:mm)
  answered BOOLEAN NOT NULL DEFAULT false, -- Si el trabajador contestó
  photo_received BOOLEAN NOT NULL DEFAULT false, -- Si se recibió la foto del trabajador
  photo_url TEXT, -- URL de la foto recibida
  photo_timestamp TIMESTAMP WITH TIME ZONE, -- Fecha y hora de la foto (extraída de la foto)
  notes TEXT, -- Novedades o observaciones del supervisor
  non_conformity BOOLEAN NOT NULL DEFAULT false, -- Si hay alguna no conformidad
  non_conformity_description TEXT, -- Descripción de la no conformidad
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  UNIQUE(shift_id, worker_id, call_number) -- Una llamada por número por trabajador por turno
);

-- Tabla: night_supervision_camera_reviews
-- Almacena las revisiones de cámaras realizadas
CREATE TABLE IF NOT EXISTS night_supervision_camera_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES night_supervision_shifts(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  unit_name TEXT NOT NULL,
  review_number INTEGER NOT NULL CHECK (review_number IN (1, 2, 3)), -- Primera, segunda o tercera revisión
  scheduled_time TIME NOT NULL, -- Hora programada de la revisión (HH:mm)
  actual_time TIME, -- Hora real en que se hizo la revisión (HH:mm)
  screenshot_url TEXT NOT NULL, -- URL del screenshot de las cámaras
  screenshot_timestamp TIMESTAMP WITH TIME ZONE, -- Fecha y hora que muestra el screenshot
  cameras_reviewed JSONB DEFAULT '[]'::jsonb, -- Array de IDs o nombres de las cámaras revisadas
  notes TEXT, -- Observaciones del supervisor
  non_conformity BOOLEAN NOT NULL DEFAULT false, -- Si hay alguna no conformidad
  non_conformity_description TEXT, -- Descripción de la no conformidad
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  UNIQUE(shift_id, review_number) -- Una revisión por número por turno
);

-- Tabla: night_supervision_alerts
-- Almacena las alertas y no conformidades
CREATE TABLE IF NOT EXISTS night_supervision_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES night_supervision_shifts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('missing_call', 'missing_photo', 'missing_camera_review', 'non_conformity', 'critical_event')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  related_entity_type TEXT CHECK (related_entity_type IN ('call', 'camera_review', 'shift')),
  related_entity_id UUID, -- ID de la entidad relacionada (call, camera_review, o shift)
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_night_supervision_shifts_date ON night_supervision_shifts(date);
CREATE INDEX IF NOT EXISTS idx_night_supervision_shifts_unit_id ON night_supervision_shifts(unit_id);
CREATE INDEX IF NOT EXISTS idx_night_supervision_shifts_supervisor_id ON night_supervision_shifts(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_night_supervision_shifts_status ON night_supervision_shifts(status);

CREATE INDEX IF NOT EXISTS idx_night_supervision_calls_shift_id ON night_supervision_calls(shift_id);
CREATE INDEX IF NOT EXISTS idx_night_supervision_calls_worker_id ON night_supervision_calls(worker_id);
CREATE INDEX IF NOT EXISTS idx_night_supervision_calls_answered ON night_supervision_calls(answered);
CREATE INDEX IF NOT EXISTS idx_night_supervision_calls_non_conformity ON night_supervision_calls(non_conformity);

CREATE INDEX IF NOT EXISTS idx_night_supervision_camera_reviews_shift_id ON night_supervision_camera_reviews(shift_id);
CREATE INDEX IF NOT EXISTS idx_night_supervision_camera_reviews_unit_id ON night_supervision_camera_reviews(unit_id);
CREATE INDEX IF NOT EXISTS idx_night_supervision_camera_reviews_non_conformity ON night_supervision_camera_reviews(non_conformity);

CREATE INDEX IF NOT EXISTS idx_night_supervision_alerts_shift_id ON night_supervision_alerts(shift_id);
CREATE INDEX IF NOT EXISTS idx_night_supervision_alerts_resolved ON night_supervision_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_night_supervision_alerts_severity ON night_supervision_alerts(severity);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_night_supervision_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar updated_at
CREATE TRIGGER update_night_supervision_shifts_updated_at
  BEFORE UPDATE ON night_supervision_shifts
  FOR EACH ROW
  EXECUTE FUNCTION update_night_supervision_updated_at();

CREATE TRIGGER update_night_supervision_calls_updated_at
  BEFORE UPDATE ON night_supervision_calls
  FOR EACH ROW
  EXECUTE FUNCTION update_night_supervision_updated_at();

CREATE TRIGGER update_night_supervision_camera_reviews_updated_at
  BEFORE UPDATE ON night_supervision_camera_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_night_supervision_updated_at();

CREATE TRIGGER update_night_supervision_alerts_updated_at
  BEFORE UPDATE ON night_supervision_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_night_supervision_updated_at();

-- Comentarios en las tablas
COMMENT ON TABLE night_supervision_shifts IS 'Turnos de supervisión nocturna';
COMMENT ON TABLE night_supervision_calls IS 'Llamadas realizadas a trabajadores nocturnos durante la supervisión';
COMMENT ON TABLE night_supervision_camera_reviews IS 'Revisiones de cámaras realizadas durante la supervisión nocturna';
COMMENT ON TABLE night_supervision_alerts IS 'Alertas y no conformidades detectadas durante la supervisión nocturna';

