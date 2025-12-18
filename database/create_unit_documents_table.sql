-- Tabla para almacenar documentos relacionados a las unidades
-- Permite que los clientes descarguen documentos del servicio

CREATE TABLE IF NOT EXISTS unit_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_unit_documents_unit_id ON unit_documents(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_documents_uploaded_at ON unit_documents(uploaded_at DESC);

-- Comentarios
COMMENT ON TABLE unit_documents IS 'Documentos relacionados a las unidades que los clientes pueden descargar';
COMMENT ON COLUMN unit_documents.unit_id IS 'ID de la unidad a la que pertenece el documento';
COMMENT ON COLUMN unit_documents.name IS 'Nombre descriptivo del documento';
COMMENT ON COLUMN unit_documents.file_url IS 'URL del archivo en Supabase Storage';
COMMENT ON COLUMN unit_documents.file_name IS 'Nombre original del archivo';
COMMENT ON COLUMN unit_documents.file_size IS 'Tamaño del archivo en bytes';
COMMENT ON COLUMN unit_documents.mime_type IS 'Tipo MIME del archivo (ej: application/pdf, image/jpeg)';
COMMENT ON COLUMN unit_documents.uploaded_by IS 'ID del usuario que subió el documento';

