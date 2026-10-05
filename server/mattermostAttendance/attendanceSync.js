import { INCIDENT_STATUSES, INCIDENT_TYPES, labelOf } from './catalogs.js';
import { getSupabaseAdmin } from './config.js';

/** Marca en el comentario para encontrar y mover la celda si cambia el operario o el día. */
export function mattermostAttendanceTag(incidentId) {
  return `[mm:${incidentId}]`;
}

/** Clave del tareo que debe verse en la asistencia del trabajador. */
export function attendanceKeyCodeForIncident(incident) {
  const status = String(incident?.status || '');
  if (status === 'MEDICAL_REST') return 'DM';
  if (status === 'LEAVE_OR_PERMIT') return 'LSG';
  if (status === 'UNJUSTIFIED_ABSENCE') return 'F';
  const type = String(incident?.incident_type || '');
  if (type === 'DESCANSO_MEDICO_INICIAL') return 'DM';
  if (type === 'PERMISO_LICENCIA') return 'LSG';
  return 'F';
}

function incidentDay(incident) {
  return String(incident?.incident_date || '').slice(0, 10);
}

function attendanceComment(incident) {
  const typeLabel = labelOf(INCIDENT_TYPES, incident.incident_type, 'Falta');
  const status = String(incident.status || '');
  const statusLabel =
    status && status !== 'PENDING_JUSTIFICATION' ? labelOf(INCIDENT_STATUSES, status, '') : '';
  const detail = statusLabel ? `${typeLabel} · ${statusLabel}` : typeLabel;
  return `Mattermost: ${detail} ${mattermostAttendanceTag(incident.id)}`.slice(0, 500);
}

let keyIds = null;

async function keyIdByCode(code) {
  if (!keyIds) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('attendance_tareo_keys').select('id, code');
    if (error) throw error;
    keyIds = new Map((data || []).map((row) => [row.code, row.id]));
  }
  return keyIds.get(code) || null;
}

async function releaseOwnedCells(supabase, incident, day) {
  const tag = mattermostAttendanceTag(incident.id);
  const { data, error } = await supabase
    .from('attendance_tareo_novedades')
    .select('id, unit_id, resource_id, day, hours_key_id')
    .ilike('comment', `%${tag}%`);
  if (error) throw error;

  for (const row of data || []) {
    const sameCell =
      row.unit_id === incident.unit_id &&
      row.resource_id === incident.employee_id &&
      String(row.day || '').slice(0, 10) === day;
    if (sameCell) continue;
    if (row.hours_key_id) {
      const { error: updateError } = await supabase
        .from('attendance_tareo_novedades')
        .update({ day_key_id: null, comment: null, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updateError) throw updateError;
    } else {
      const { error: deleteError } = await supabase.from('attendance_tareo_novedades').delete().eq('id', row.id);
      if (deleteError) throw deleteError;
    }
  }
}

/**
 * Escribe la falta en la asistencia diaria (tareo) del trabajador.
 * overwrite=false no pisa una marca manual ya cargada en esa celda.
 */
export async function syncIncidentToAttendance(incident, { overwrite = true } = {}) {
  if (!incident?.id || !incident.unit_id || !incident.employee_id) return;
  const day = incidentDay(incident);
  if (!day) return;

  const code = attendanceKeyCodeForIncident(incident);
  const dayKeyId = await keyIdByCode(code);
  if (!dayKeyId) {
    console.warn('⚠️  No existe la clave de asistencia', code);
    return;
  }

  const supabase = getSupabaseAdmin();
  await releaseOwnedCells(supabase, incident, day);

  const { data: existing, error: readError } = await supabase
    .from('attendance_tareo_novedades')
    .select('id, day_key_id, hours_key_id, hours_value, comment, source')
    .eq('unit_id', incident.unit_id)
    .eq('resource_id', incident.employee_id)
    .eq('day', day)
    .maybeSingle();
  if (readError) throw readError;

  const tag = mattermostAttendanceTag(incident.id);
  const ours = String(existing?.comment || '').includes(tag);
  if (!overwrite && existing?.day_key_id && !ours && existing.source !== 'suggested') return;

  const payload = {
    unit_id: incident.unit_id,
    resource_id: incident.employee_id,
    day,
    day_key_id: dayKeyId,
    hours_key_id: existing?.hours_key_id || null,
    hours_value: existing?.hours_key_id ? existing.hours_value : null,
    comment: attendanceComment(incident),
    source: 'manual',
    updated_by: incident.reported_by || 'mattermost',
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('attendance_tareo_novedades')
    .upsert(payload, { onConflict: 'unit_id,resource_id,day' });
  if (error) throw error;
}

export async function clearIncidentFromAttendance(incidentId) {
  if (!incidentId) return;
  const supabase = getSupabaseAdmin();
  const tag = mattermostAttendanceTag(incidentId);
  const { data, error } = await supabase
    .from('attendance_tareo_novedades')
    .select('id, hours_key_id')
    .ilike('comment', `%${tag}%`);
  if (error) throw error;
  for (const row of data || []) {
    if (row.hours_key_id) {
      const { error: updateError } = await supabase
        .from('attendance_tareo_novedades')
        .update({ day_key_id: null, comment: null, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updateError) throw updateError;
    } else {
      const { error: deleteError } = await supabase.from('attendance_tareo_novedades').delete().eq('id', row.id);
      if (deleteError) throw deleteError;
    }
  }
}

/** Completa celdas vacías (o sugeridas) con faltas ya registradas. No pisa marcas manuales. */
export async function backfillIncidentsToAttendance() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('payroll_attendance_incidents')
    .select('id, unit_id, employee_id, incident_type, status, incident_date, reported_by')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data || [];
  for (const incident of rows) {
    try {
      await syncIncidentToAttendance(incident, { overwrite: false });
    } catch (err) {
      console.warn(
        '⚠️  Asistencia /falta',
        incident.id,
        err instanceof Error ? err.message : err,
      );
    }
  }
  if (rows.length) console.log(`📅 Faltas de Mattermost revisadas en asistencia: ${rows.length}`);
}
