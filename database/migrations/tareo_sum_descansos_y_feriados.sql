-- Cada día marcado como descanso semanal (DS) o feriado / día no laborable (FER)
-- suma 1 en «Descansos Domingos y Días no laborables» al extraer el tareo.
-- No pisa una columna que ya se haya elegido a mano.

UPDATE public.attendance_tareo_keys
SET payroll_field = 'descansos_dom_feriado',
    updated_at = now()
WHERE code IN ('DS', 'FER')
  AND value_kind <> 'hours'
  AND payroll_field = 'none';
