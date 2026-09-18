import { getSupabaseAdmin } from './config.js';
import {
  ATTACHMENTS_BUCKET,
  formatApellidosNombres,
  formatWorkerLabel,
  isActivePersonnelRow,
  isOperationalUnit,
  limaTodayIso,
} from './catalogs.js';

async function fetchAllPages(buildQuery, pageSize = 1000) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export async function listActiveUnits() {
  const supabase = getSupabaseAdmin();
  const rows = await fetchAllPages(() =>
    supabase.from('units').select('id, name, status').order('name', { ascending: true }),
  );
  return rows.filter(isOperationalUnit);
}

export async function listActiveWorkers(unitId) {
  const supabase = getSupabaseAdmin();
  const rows = await fetchAllPages(() => {
    let q = supabase
      .from('resources')
      .select('id, name, dni, unit_id, type, archived, personnel_status, inbound_source_data, is_shared')
      .eq('type', 'Personal')
      .or('archived.is.null,archived.eq.false')
      .order('name', { ascending: true });
    if (unitId) q = q.eq('unit_id', unitId);
    return q;
  });
  return rows.filter(isActivePersonnelRow);
}

export function workerSelectOptions(workers) {
  return workers
    .map((row) => ({ text: formatWorkerLabel(row), value: row.id }))
    .filter((o) => o.value);
}

export async function getUnitById(id) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('units').select('id, name, status').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getWorkerById(id) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('resources')
    .select('id, name, dni, unit_id, type, archived, personnel_status, inbound_source_data, is_shared')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createIncident(row) {
  const supabase = getSupabaseAdmin();
  const payload = {
    unit_id: row.unitId,
    employee_id: row.employeeId,
    incident_type: row.incidentType,
    incident_reason: row.incidentReason,
    has_coverage: row.hasCoverage,
    status: 'PENDING_JUSTIFICATION',
    incident_date: row.incidentDate || limaTodayIso(),
    observations: row.observations,
    reported_by: row.reportedBy || null,
    reported_by_user_id: row.reportedByUserId || null,
    mattermost_channel_id: row.channelId || null,
    mattermost_team_id: row.teamId || null,
    attachments: [],
  };
  const { data, error } = await supabase
    .from('payroll_attendance_incidents')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateIncidentPost(id, fields) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('payroll_attendance_incidents')
    .update({
      mattermost_post_id: fields.postId,
      mattermost_permalink: fields.permalink || null,
      mattermost_channel_id: fields.channelId || null,
      mattermost_team_id: fields.teamId || null,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function findIncidentByPostId(postId) {
  if (!postId) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('payroll_attendance_incidents')
    .select('*')
    .eq('mattermost_post_id', postId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listOpenIncidentsForPolling(maxAgeDays = 7) {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('payroll_attendance_incidents')
    .select('id, mattermost_post_id, attachments')
    .not('mattermost_post_id', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export async function attachmentExists(mattermostFileId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('payroll_attendance_incident_attachments')
    .select('id')
    .eq('mattermost_file_id', mattermostFileId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function saveAttachment({
  incidentId,
  mattermostFileId,
  mattermostPostId,
  fileName,
  mimeType,
  buffer,
  uploadedByUsername,
}) {
  const supabase = getSupabaseAdmin();
  const safeName = String(fileName || 'archivo')
    .replace(/[^\w.\-áéíóúÁÉÍÓÚñÑ ]+/g, '_')
    .slice(0, 120);
  const extFromName = safeName.includes('.') ? safeName.split('.').pop() : '';
  const ext = (extFromName || mimeToExt(mimeType) || 'bin').toLowerCase();
  const storagePath = `${incidentId}/${mattermostFileId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType || 'application/octet-stream',
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(storagePath);
  const publicUrl = publicData?.publicUrl || '';

  const { data: inserted, error: insertError } = await supabase
    .from('payroll_attendance_incident_attachments')
    .insert({
      incident_id: incidentId,
      mattermost_file_id: mattermostFileId,
      mattermost_post_id: mattermostPostId || null,
      file_name: safeName,
      mime_type: mimeType || null,
      storage_path: storagePath,
      public_url: publicUrl,
      uploaded_by_username: uploadedByUsername || null,
    })
    .select('*')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return { duplicate: true };
    }
    throw insertError;
  }

  const { data: incident } = await supabase
    .from('payroll_attendance_incidents')
    .select('attachments')
    .eq('id', incidentId)
    .maybeSingle();

  const current = Array.isArray(incident?.attachments) ? incident.attachments : [];
  const next = current.some((a) => a.mattermost_file_id === mattermostFileId)
    ? current
    : [
        ...current,
        {
          id: inserted.id,
          mattermost_file_id: mattermostFileId,
          mattermost_post_id: mattermostPostId || null,
          file_name: safeName,
          mime_type: mimeType || null,
          storage_path: storagePath,
          public_url: publicUrl,
          uploaded_at: inserted.created_at,
        },
      ];

  await supabase.from('payroll_attendance_incidents').update({ attachments: next }).eq('id', incidentId);
  return { duplicate: false, attachment: inserted, publicUrl };
}

function mimeToExt(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('jpeg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('gif')) return 'gif';
  if (m.includes('webp')) return 'webp';
  if (m.includes('pdf')) return 'pdf';
  return '';
}

export function workerCardName(row) {
  const dni = String(row?.dni || '').trim() || 'S/DNI';
  return `${formatApellidosNombres(row)} (${dni})`;
}
