-- Descanso semanal y feriado / día no laborable suman 1 día cada uno
-- en la columna «Descansos Domingos y Días no laborables» del tareo.
-- DESC_DOM / HT siguen siendo de HORAS.

INSERT INTO public.attendance_tareo_keys
    (code, name, icon, color, value_kind, value_amount, counts_as_presentismo, payroll_field, sort_order, is_system, is_active)
VALUES
    ('DS', 'Descanso semanal', '💤', '#94a3b8', 'day', 1, false, 'descansos_dom_feriado', 35, true, true),
    ('FER', 'Feriado / día no laborable', '📅', '#a8a29e', 'day', 1, false, 'descansos_dom_feriado', 36, true, true)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    value_kind = EXCLUDED.value_kind,
    value_amount = EXCLUDED.value_amount,
    counts_as_presentismo = EXCLUDED.counts_as_presentismo,
    payroll_field = CASE
        WHEN public.attendance_tareo_keys.payroll_field = 'none' THEN EXCLUDED.payroll_field
        ELSE public.attendance_tareo_keys.payroll_field
    END,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    updated_at = now();
