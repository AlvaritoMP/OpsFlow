-- Clave de descanso en DÍAS (para marcar en novedades qué día descansó el trabajador).
-- DESC_DOM / HT siguen siendo de HORAS (columnas de horas del Excel de nómina).

INSERT INTO public.attendance_tareo_keys
    (code, name, icon, color, value_kind, value_amount, counts_as_presentismo, payroll_field, sort_order, is_system, is_active)
VALUES
    ('DS', 'Descanso semanal', '💤', '#94a3b8', 'day', 1, false, 'none', 35, true, true),
    ('FER', 'Feriado / día no laborable', '📅', '#a8a29e', 'day', 1, false, 'none', 36, true, true)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    value_kind = EXCLUDED.value_kind,
    value_amount = EXCLUDED.value_amount,
    counts_as_presentismo = EXCLUDED.counts_as_presentismo,
    payroll_field = EXCLUDED.payroll_field,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    updated_at = now();
