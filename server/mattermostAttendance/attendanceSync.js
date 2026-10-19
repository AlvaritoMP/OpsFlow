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
let attendanceTail = Promise.resolve();
let backfillActive = false;

function enqueueAttendance(task) {
  const run = attendanceTail.then(task, task);
  attendanceTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function incidentIdFromComment(comment) {
  const match = String(comment || '').match(/\[mm:([^\]]+)\]/);
  return match ? match[1] : '';
}

function sameCell(row, incident, day) {
  return (
    row.unit_id === incident.unit_id &&
    row.resource_id === incident.employee_id &&
    String(row.day || '').slice(0, 10) === day
  );
}

async function keyIdByCode(code) {
  if (!keyIds) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('attendance_tareo_keys').select('id, code');
    if (error) throw error;
    keyIds = new Map((data || []).map((row) => [row.code, row.id]));
  }
  return keyIds.get(code) || null;
}

async function fetchPaged(makeQuery) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    if (rows.length >= 20000) {
      console.warn('⚠️  Corte de paginación en asistencia/faltas (20000 filas)');
      break;
    }
  }
  return rows;
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
export function syncIncidentToAttendance(incident, options) {
  return enqueueAttendance(() => applyIncidentToAttendance(incident, options));
}

async function applyIncidentToAttendance(incident, { overwrite = true } = {}) {
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

  const comment = attendanceComment(incident);
  const tag = mattermostAttendanceTag(incident.id);
  const ours = String(existing?.comment || '').includes(tag);
  if (!overwrite && existing?.day_key_id && !ours && existing.source !== 'suggested') return;

  const unchanged =
    existing &&
    existing.day_key_id === dayKeyId &&
    existing.comment === comment &&
    (existing.source === 'manual' || existing.source === 'suggested' || ours);
  if (unchanged) return;

  const payload = {
    unit_id: incident.unit_id,
    resource_id: incident.employee_id,
    day,
    day_key_id: dayKeyId,
    hours_key_id: existing?.hours_key_id || null,
    hours_value: existing?.hours_key_id ? existing.hours_value : null,
    comment,
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

/**
 * Completa celdas vacías (o sugeridas) con faltas ya registradas. No pisa marcas manuales.
 * Una sola pasada a la vez. Si la celda ya tiene la misma falta, no vuelve a hacer upsert.
 */
export function backfillIncidentsToAttendance() {
  if (backfillActive) {
    console.log('📅 Backfill de asistencia ya en curso; se omite esta pasada');
    return Promise.resolve();
  }
  backfillActive = true;
  return enqueueAttendance(() => backfillIncidentsNow()).finally(() => {
    backfillActive = false;
  });
}

async function backfillIncidentsNow() {
  const supabase = getSupabaseAdmin();
  const incidents = await fetchPaged(() =>
    supabase
      .from('payroll_attendance_incidents')
      .select('id, unit_id, employee_id, incident_type, status, incident_date, reported_by')
      .order('created_at', { ascending: true }),
  );
  if (!incidents.length) return;

  const owned = await fetchPaged(() =>
    supabase
      .from('attendance_tareo_novedades')
      .select('id, unit_id, resource_id, day, hours_key_id, hours_value, day_key_id, comment, source')
      .ilike('comment', '%[mm:%'),
  );

  const ownedByIncident = new Map();
  for (const row of owned) {
    const incidentId = incidentIdFromComment(row.comment);
    if (!incidentId) continue;
    const list = ownedByIncident.get(incidentId) || [];
    list.push(row);
    ownedByIncident.set(incidentId, list);
  }

  const pending = [];
  const stale = [];
  for (const incident of incidents) {
    if (!incident?.id || !incident.unit_id || !incident.employee_id) continue;
    const day = incidentDay(incident);
    if (!day) continue;
    const code = attendanceKeyCodeForIncident(incident);
    const dayKeyId = await keyIdByCode(code);
    if (!dayKeyId) continue;
    const comment = attendanceComment(incident);
    const ownedRows = ownedByIncident.get(incident.id) || [];
    const target = ownedRows.find((row) => sameCell(row, incident, day));
    const others = ownedRows.filter((row) => row !== target);
    const targetOk = Boolean(target && target.day_key_id === dayKeyId && target.comment === comment);
    if (others.length) stale.push(...others);
    if (targetOk) continue;
    pending.push({ incident, day, dayKeyId, comment });
  }

  const cellByKey = new Map();
  if (pending.length) {
    const resourceIds = [...new Set(pending.map((item) => item.incident.employee_id))];
    const days = [...new Set(pending.map((item) => item.day))];
    for (const idChunk of chunk(resourceIds, 80)) {
      for (const dayChunk of chunk(days, 40)) {
        const found = await fetchPaged(() =>
          supabase
            .from('attendance_tareo_novedades')
            .select('id, unit_id, resource_id, day, hours_key_id, hours_value, day_key_id, comment, source')
            .in('resource_id', idChunk)
            .in('day', dayChunk),
        );
        for (const row of found) {
          cellByKey.set(`${row.unit_id}|${row.resource_id}|${String(row.day || '').slice(0, 10)}`, row);
        }
      }
    }
  }

  const payloads = [];
  let skippedManual = 0;
  for (const item of pending) {
    const { incident, day, dayKeyId, comment } = item;
    const existing = cellByKey.get(`${incident.unit_id}|${incident.employee_id}|${day}`);
    const tag = mattermostAttendanceTag(incident.id);
    const ours = String(existing?.comment || '').includes(tag);
    if (existing?.day_key_id && !ours && existing.source !== 'suggested') {
      skippedManual += 1;
      continue;
    }
    if (existing && existing.day_key_id === dayKeyId && existing.comment === comment) continue;
    payloads.push({
      unit_id: incident.unit_id,
      resource_id: incident.employee_id,
      day,
      day_key_id: dayKeyId,
      hours_key_id: existing?.hours_key_id || null,
      hours_value: existing?.hours_key_id ? existing.hours_value : null,
      comment,
      source: 'manual',
      updated_by: incident.reported_by || 'mattermost',
      updated_at: new Date().toISOString(),
    });
  }

  const now = new Date().toISOString();
  const deleteIds = [...new Set(stale.filter((row) => !row.hours_key_id).map((row) => row.id))];
  const clearIds = [...new Set(stale.filter((row) => row.hours_key_id).map((row) => row.id))];

  for (const ids of chunk(deleteIds, 80)) {
    const { error } = await supabase.from('attendance_tareo_novedades').delete().in('id', ids);
    if (error) throw error;
    await sleep(300);
  }
  for (const ids of chunk(clearIds, 80)) {
    const { error } = await supabase
      .from('attendance_tareo_novedades')
      .update({ day_key_id: null, comment: null, updated_at: now })
      .in('id', ids);
    if (error) throw error;
    await sleep(300);
  }
  for (const rows of chunk(payloads, 80)) {
    const { error } = await supabase
      .from('attendance_tareo_novedades')
      .upsert(rows, { onConflict: 'unit_id,resource_id,day' });
    if (error) throw error;
    await sleep(300);
  }

  console.log(
    `📅 Faltas Mattermost: ${incidents.length} revisadas, ${payloads.length} escritas, ${incidents.length - payloads.length - skippedManual} ya estaban al día` +
      (skippedManual ? `, ${skippedManual} con marca manual` : ''),
  );
}
