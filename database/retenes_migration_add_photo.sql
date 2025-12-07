-- ============================================
-- MIGRACIÓN: Agregar campo photo a tabla retenes
-- ============================================
-- Este script agrega el campo photo a la tabla retenes si ya existe
-- Ejecutar solo si la tabla retenes ya fue creada sin el campo photo

-- Agregar columna photo si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'retenes' 
    AND column_name = 'photo'
  ) THEN
    ALTER TABLE retenes ADD COLUMN photo TEXT;
    COMMENT ON COLUMN retenes.photo IS 'URL de la foto del retén';
    RAISE NOTICE 'Columna photo agregada exitosamente a la tabla retenes';
  ELSE
    RAISE NOTICE 'La columna photo ya existe en la tabla retenes';
  END IF;
END $$;

