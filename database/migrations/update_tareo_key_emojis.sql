-- Actualiza iconos de claves a emoticones (y agrega DS/FER si faltan).

UPDATE public.attendance_tareo_keys SET icon = '☀️', updated_at = now() WHERE code = 'OK_TM';
UPDATE public.attendance_tareo_keys SET icon = '🌤️', updated_at = now() WHERE code = 'OK_TT';
UPDATE public.attendance_tareo_keys SET icon = '🌙', updated_at = now() WHERE code = 'OK_TN';
UPDATE public.attendance_tareo_keys SET icon = '💤', updated_at = now() WHERE code = 'DS';
UPDATE public.attendance_tareo_keys SET icon = '📅', updated_at = now() WHERE code = 'FER';
UPDATE public.attendance_tareo_keys SET icon = '🏖️', updated_at = now() WHERE code = 'V';
UPDATE public.attendance_tareo_keys SET icon = '🏥', updated_at = now() WHERE code = 'DM';
UPDATE public.attendance_tareo_keys SET icon = '❌', updated_at = now() WHERE code = 'F';
UPDATE public.attendance_tareo_keys SET icon = '📄', updated_at = now() WHERE code = 'LCG';
UPDATE public.attendance_tareo_keys SET icon = '📭', updated_at = now() WHERE code = 'LSG';
UPDATE public.attendance_tareo_keys SET icon = '👶', updated_at = now() WHERE code = 'LM';
UPDATE public.attendance_tareo_keys SET icon = '🖤', updated_at = now() WHERE code = 'LGC_F';
UPDATE public.attendance_tareo_keys SET icon = '⏰', updated_at = now() WHERE code = 'DESC_DOM';
UPDATE public.attendance_tareo_keys SET icon = '🌃', updated_at = now() WHERE code = 'BONO_N';
UPDATE public.attendance_tareo_keys SET icon = '⚡', updated_at = now() WHERE code = 'HE_D_25';
UPDATE public.attendance_tareo_keys SET icon = '💥', updated_at = now() WHERE code = 'HE_D_35';
UPDATE public.attendance_tareo_keys SET icon = '🔦', updated_at = now() WHERE code = 'HE_N_25';
UPDATE public.attendance_tareo_keys SET icon = '✨', updated_at = now() WHERE code = 'HE_N_35';
UPDATE public.attendance_tareo_keys SET icon = '🕐', updated_at = now() WHERE code = 'HT';

INSERT INTO public.attendance_tareo_keys
    (code, name, icon, color, value_kind, value_amount, counts_as_presentismo, payroll_field, sort_order, is_system, is_active)
VALUES
    ('DS', 'Descanso semanal', '💤', '#94a3b8', 'day', 1, false, 'none', 35, true, true),
    ('FER', 'Feriado / día no laborable', '📅', '#a8a29e', 'day', 1, false, 'none', 36, true, true)
ON CONFLICT (code) DO UPDATE SET
    icon = EXCLUDED.icon,
    name = EXCLUDED.name,
    value_kind = EXCLUDED.value_kind,
    value_amount = EXCLUDED.value_amount,
    is_active = true,
    updated_at = now();
