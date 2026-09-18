-- Autonomía para borrar expedientes /falta.
-- SUPER_ADMIN siempre puede borrar en la app; este flag se usa para designar a otros usuarios.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS can_delete_attendance_incidents BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.can_delete_attendance_incidents IS
  'Si true, el usuario puede eliminar registros de payroll_attendance_incidents (además del rol SUPER_ADMIN).';
