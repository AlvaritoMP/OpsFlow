-- Migración: Agregar campo on_rest a night_supervision_calls
-- Este campo indica si el trabajador está en descanso ese día

ALTER TABLE night_supervision_calls
ADD COLUMN IF NOT EXISTS on_rest BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN night_supervision_calls.on_rest IS 'Indica si el trabajador está en descanso ese día y no requiere supervisión';

