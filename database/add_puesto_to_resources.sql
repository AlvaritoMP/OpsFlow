-- Agregar columna 'puesto' a la tabla resources
-- Esta columna almacena el puesto o cargo del trabajador

ALTER TABLE public.resources
ADD COLUMN IF NOT EXISTS puesto TEXT;

-- Comentario para documentar la columna
COMMENT ON COLUMN public.resources.puesto IS 'Puesto o cargo del trabajador (solo para recursos de tipo Personal)';

