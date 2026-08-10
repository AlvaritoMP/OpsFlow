-- Campos internos OpsFlow en presentaciones (salario, días, horario, turno, jornada, régimen, bono, asignación familiar)
-- y columnas en resources para autocompletar Personal de unidad.

ALTER TABLE public.inbound_worker_handoff_items
  ADD COLUMN IF NOT EXISTS opsflow_intake JSONB NULL;

COMMENT ON COLUMN public.inbound_worker_handoff_items.opsflow_intake IS
  'Datos definidos por OpsFlow antes de asignar unidad: monthlySalary, workDays, entryTime, exitTime, shift, jornadaType, laborRegime, mobilityBonus, familyAllowance';

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS work_days TEXT[] NULL,
  ADD COLUMN IF NOT EXISTS entry_time TEXT NULL,
  ADD COLUMN IF NOT EXISTS exit_time TEXT NULL,
  ADD COLUMN IF NOT EXISTS jornada_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS labor_regime TEXT NULL,
  ADD COLUMN IF NOT EXISTS mobility_bonus NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS family_allowance BOOLEAN NULL;

COMMENT ON COLUMN public.resources.work_days IS
  'Días de trabajo habituales (ej. Lunes, Martes, ...)';
COMMENT ON COLUMN public.resources.entry_time IS
  'Hora de entrada habitual HH:mm';
COMMENT ON COLUMN public.resources.exit_time IS
  'Hora de salida habitual HH:mm';
COMMENT ON COLUMN public.resources.jornada_type IS
  'Tipo de jornada: Full Time, Part Time, 12 horas';
COMMENT ON COLUMN public.resources.labor_regime IS
  'Régimen laboral: General, Pyme, Mype';
COMMENT ON COLUMN public.resources.mobility_bonus IS
  'Bono de movilidad mensual (S/)';
COMMENT ON COLUMN public.resources.family_allowance IS
  'Si corresponde asignación familiar (true/false)';
