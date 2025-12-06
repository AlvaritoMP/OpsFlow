-- ============================================
-- SCHEMA PARA GESTIÓN DE CLIENTES
-- ============================================
-- Ejecuta este SQL en Supabase SQL Editor
-- para crear las tablas necesarias para la gestión de clientes

-- Tabla de Clientes
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  ruc TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Representantes de Clientes
CREATE TABLE IF NOT EXISTS client_representatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, name) -- Evitar representantes duplicados por cliente
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_ruc ON clients(ruc);
CREATE INDEX IF NOT EXISTS idx_client_representatives_client_id ON client_representatives(client_id);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at en clients
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Políticas RLS (Row Level Security)
-- Habilitar RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_representatives ENABLE ROW LEVEL SECURITY;

-- Política: Todos los usuarios autenticados pueden ver clientes
CREATE POLICY "Users can view clients"
  ON clients FOR SELECT
  TO authenticated
  USING (true);

-- Política: Solo administradores pueden crear clientes
CREATE POLICY "Admins can create clients"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'ADMIN'
    )
  );

-- Política: Solo administradores pueden actualizar clientes
CREATE POLICY "Admins can update clients"
  ON clients FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'ADMIN'
    )
  );

-- Política: Solo administradores pueden eliminar clientes
CREATE POLICY "Admins can delete clients"
  ON clients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'ADMIN'
    )
  );

-- Políticas para client_representatives
CREATE POLICY "Users can view client representatives"
  ON client_representatives FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage client representatives"
  ON client_representatives FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'ADMIN'
    )
  );

-- Comentarios para documentación
COMMENT ON TABLE clients IS 'Tabla de clientes/empresas que contratan los servicios';
COMMENT ON TABLE client_representatives IS 'Representantes de contacto de cada cliente';
COMMENT ON COLUMN clients.name IS 'Nombre de la empresa/cliente';
COMMENT ON COLUMN clients.ruc IS 'RUC (Registro Único de Contribuyente) del cliente';
COMMENT ON COLUMN client_representatives.name IS 'Nombre completo del representante';
COMMENT ON COLUMN client_representatives.phone IS 'Teléfono de contacto del representante';
COMMENT ON COLUMN client_representatives.email IS 'Email de contacto del representante';

