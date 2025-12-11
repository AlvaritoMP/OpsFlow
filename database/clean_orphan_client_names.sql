-- Script para limpiar nombres de clientes "fantasma" en unidades
-- Estos son nombres de clientes que fueron escritos manualmente pero no existen en la tabla clients

-- Paso 1: Identificar unidades con clientes "fantasma"
-- (Unidades cuyo client_name no existe en la tabla clients)
SELECT 
    u.id,
    u.name as unit_name,
    u.client_name as orphan_client_name
FROM units u
LEFT JOIN clients c ON u.client_name = c.name
WHERE u.client_name IS NOT NULL 
  AND u.client_name != ''
  AND c.id IS NULL
ORDER BY u.client_name;

-- Paso 2: Opción A - Limpiar clientes "fantasma" estableciendo client_name a NULL
-- (Descomentar la siguiente línea para ejecutar)
-- UPDATE units
-- SET client_name = NULL
-- WHERE client_name IS NOT NULL 
--   AND client_name != ''
--   AND NOT EXISTS (
--     SELECT 1 FROM clients WHERE clients.name = units.client_name
--   );

-- Paso 3: Opción B - Asignar un cliente válido por defecto
-- Si quieres asignar un cliente específico a todas las unidades con clientes "fantasma",
-- primero crea ese cliente en la tabla clients, luego ejecuta:
-- UPDATE units
-- SET client_name = 'Nombre del Cliente Válido'
-- WHERE client_name IS NOT NULL 
--   AND client_name != ''
--   AND NOT EXISTS (
--     SELECT 1 FROM clients WHERE clients.name = units.client_name
--   );

-- NOTA: Ejecuta primero el SELECT para ver qué unidades se verán afectadas
-- Luego, si estás seguro, ejecuta la opción A o B según prefieras

