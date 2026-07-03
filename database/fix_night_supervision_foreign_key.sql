-- ============================================
-- FIX: Corregir Foreign Key de supervisor_id
-- ============================================
-- Este script corrige la foreign key de supervisor_id para que referencie users(id)
-- en lugar de management_staff(id), ya que todos los usuarios que pueden crear turnos
-- deberían estar en la tabla users.

-- Paso 1: Eliminar la constraint antigua
ALTER TABLE night_supervision_shifts 
DROP CONSTRAINT IF EXISTS night_supervision_shifts_supervisor_id_fkey;

-- Paso 2: Agregar la nueva constraint que referencia users(id)
ALTER TABLE night_supervision_shifts 
ADD CONSTRAINT night_supervision_shifts_supervisor_id_fkey 
FOREIGN KEY (supervisor_id) 
REFERENCES users(id) 
ON DELETE RESTRICT;

