-- Actualizar el check constraint para incluir 'archivado' como estado válido en resources
ALTER TABLE resources 
DROP CONSTRAINT IF EXISTS resources_personnel_status_check;

ALTER TABLE resources
ADD CONSTRAINT resources_personnel_status_check 
CHECK (personnel_status IS NULL OR personnel_status = ANY (ARRAY['activo'::text, 'cesado'::text, 'archivado'::text]));

-- También actualizar management_staff si tiene el mismo constraint
ALTER TABLE management_staff 
DROP CONSTRAINT IF EXISTS management_staff_status_check;

ALTER TABLE management_staff
ADD CONSTRAINT management_staff_status_check 
CHECK (status IS NULL OR status = ANY (ARRAY['activo'::text, 'cesado'::text, 'archivado'::text]));
