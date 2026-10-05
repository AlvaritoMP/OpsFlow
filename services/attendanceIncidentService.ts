import { supabase, handleSupabaseError } from './supabase';
import type {
  PayrollAttendanceCoverage,
  PayrollAttendanceIncident,
  PayrollAttendanceIncidentAttachment,
  PayrollAttendanceIncidentReason,
  PayrollAttendanceIncidentStatus,
  PayrollAttendanceIncidentType,
} from '../types';

export const PAYROLL_INCIDENT_TYPE_LABELS: Record<PayrollAttendanceIncidentType, string> = {
  INASISTENCIA: 'Inasistencia a turno',
  TARDANZA: 'Tardanza',
  DESCANSO_MEDICO_INICIAL: 'Avisó descanso médico / emergencia',
  PERMISO_LICENCIA: 'Solicitud de permiso/licencia',
};

export const PAYROLL_INCIDENT_REASON_LABELS: Record<PayrollAttendanceIncidentReason, string> = {
  SALUD_EMERGENCIA: 'Salud / Emergencia Médica',
  PROBLEMA_PERSONAL: 'Problema Personal / Familiar',
  TRAMITE_DOCUMENTARIO: 'Trámite Documentario / Cita Externa',
  SIN_COMUNICACION: 'Sin comunicación / Abandono de puesto',
  OPERATIVO_TRASLADO: 'Operativo / Traslado',
};

export const PAYROLL_COVERAGE_LABELS: Record<PayrollAttendanceCoverage, string> = {
  CON_COBERTURA: '🟢 Cubierto',
  SIN_COBERTURA: '🔴 Sin cobertura',
  NO_APLICA: '⚪ No aplica',
};

export const PAYROLL_INCIDENT_STATUS_LABELS: Record<PayrollAttendanceIncidentStatus, string> = {
  PENDING_JUSTIFICATION: 'Pendiente de justificación',
  MEDICAL_REST: 'Descanso médico',
  LEAVE_OR_PERMIT: 'Licencia / permiso',
  UNJUSTIFIED_ABSENCE: 'Inasistencia injustificada',
};

function mapAttachments(raw: unknown): PayrollAttendanceIncidentAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: PayrollAttendanceIncidentAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const url = String(row.public_url || '');
    if (!url) continue;
    out.push({
      id: row.id ? String(row.id) : undefined,
      mattermost_file_id: row.mattermost_file_id ? String(row.mattermost_file_id) : undefined,
      mattermost_post_id: row.mattermost_post_id ? String(row.mattermost_post_id) : undefined,
      file_name: String(row.file_name || 'archivo'),
      mime_type: row.mime_type ? String(row.mime_type) : null,
      storage_path: row.storage_path ? String(row.storage_path) : undefined,
      public_url: url,
      uploaded_at: row.uploaded_at ? String(row.uploaded_at) : undefined,
    });
  }
  return out;
}

function mapIncident(row: Record<string, any>): PayrollAttendanceIncident {
  const resourceRaw = row.resources || row.employee || null;
  const resource = Array.isArray(resourceRaw) ? resourceRaw[0] : resourceRaw;
  const unitRaw = row.units || row.unit || null;
  const unit = Array.isArray(unitRaw) ? unitRaw[0] : unitRaw;
  return {
    id: row.id,
    unitId: row.unit_id,
    employeeId: row.employee_id,
    incidentType: row.incident_type,
    incidentReason: row.incident_reason,
    hasCoverage: row.has_coverage,
    status: row.status,
    incidentDate: row.incident_date,
    observations: row.observations ?? null,
    reportedBy: row.reported_by ?? null,
    mattermostPostId: row.mattermost_post_id ?? null,
    mattermostPermalink: row.mattermost_permalink ?? null,
    attachments: mapAttachments(row.attachments),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    employeeName: resource?.name || undefined,
    employeeDni: resource?.dni || undefined,
    unitName: unit?.name || undefined,
  };
}

function mattermostAttendanceTag(incidentId: string) {
  return `[mm:${incidentId}]`;
}

function attendanceKeyCode(status: string, incidentType: string) {
  if (status === 'MEDICAL_REST') return 'DM';
  if (status === 'LEAVE_OR_PERMIT') return 'LSG';
  if (status === 'UNJUSTIFIED_ABSENCE') return 'F';
  if (incidentType === 'DESCANSO_MEDICO_INICIAL') return 'DM';
  if (incidentType === 'PERMISO_LICENCIA') return 'LSG';
  return 'F';
}

function attendanceComment(row: Record<string, any>) {
  const typeLabel = PAYROLL_INCIDENT_TYPE_LABELS[row.incident_type as PayrollAttendanceIncidentType] || 'Falta';
  const status = String(row.status || '');
  const statusLabel =
    status && status !== 'PENDING_JUSTIFICATION'
      ? PAYROLL_INCIDENT_STATUS_LABELS[status as PayrollAttendanceIncidentStatus] || ''
      : '';
  const detail = statusLabel ? `${typeLabel} · ${statusLabel}` : typeLabel;
  return `Mattermost: ${detail} ${mattermostAttendanceTag(row.id)}`.slice(0, 500);
}

async function releaseOwnedAttendanceCells(incidentId: string, unitId: string, resourceId: string, day: string) {
  const tag = mattermostAttendanceTag(incidentId);
  const { data, error } = await supabase
    .from('attendance_tareo_novedades')
    .select('id, unit_id, resource_id, day, hours_key_id')
    .ilike('comment', `%${tag}%`);
  if (error) throw error;
  for (const row of data || []) {
    const same =
      row.unit_id === unitId &&
      row.resource_id === resourceId &&
      String(row.day || '').slice(0, 10) === day;
    if (same) continue;
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

/** Misma regla que server/mattermostAttendance/attendanceSync.js */
async function syncIncidentRowToAttendance(row: Record<string, any>) {
  const day = String(row.incident_date || '').slice(0, 10);
  if (!row.id || !row.unit_id || !row.employee_id || !day) return;
  const code = attendanceKeyCode(String(row.status || ''), String(row.incident_type || ''));
  const { data: key, error: keyError } = await supabase
    .from('attendance_tareo_keys')
    .select('id')
    .eq('code', code)
    .maybeSingle();
  if (keyError) throw keyError;
  if (!key?.id) return;

  await releaseOwnedAttendanceCells(row.id, row.unit_id, row.employee_id, day);

  const { data: existing, error: readError } = await supabase
    .from('attendance_tareo_novedades')
    .select('hours_key_id, hours_value')
    .eq('unit_id', row.unit_id)
    .eq('resource_id', row.employee_id)
    .eq('day', day)
    .maybeSingle();
  if (readError) throw readError;

  const { error } = await supabase.from('attendance_tareo_novedades').upsert(
    {
      unit_id: row.unit_id,
      resource_id: row.employee_id,
      day,
      day_key_id: key.id,
      hours_key_id: existing?.hours_key_id || null,
      hours_value: existing?.hours_key_id ? existing.hours_value : null,
      comment: attendanceComment(row),
      source: 'manual',
      updated_by: row.reported_by || 'mattermost',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'unit_id,resource_id,day' }
  );
  if (error) throw error;
}

async function clearIncidentAttendance(incidentId: string) {
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

export const attendanceIncidentService = {
  async listByUnit(unitId: string, limit = 80): Promise<PayrollAttendanceIncident[]> {
    try {
      const { data, error } = await supabase
        .from('payroll_attendance_incidents')
        .select('*, resources!employee_id(id, name, dni), units!unit_id(id, name)')
        .eq('unit_id', unitId)
        .order('incident_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []).map(mapIncident);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async listAll(limit = 500): Promise<PayrollAttendanceIncident[]> {
    try {
      const pageSize = 200;
      const rows: Record<string, any>[] = [];
      let from = 0;
      while (rows.length < limit) {
        const to = Math.min(from + pageSize - 1, limit - 1);
        const { data, error } = await supabase
          .from('payroll_attendance_incidents')
          .select('*, resources!employee_id(id, name, dni), units!unit_id(id, name)')
          .order('created_at', { ascending: false })
          .range(from, to);
        if (error) throw error;
        const chunk = data || [];
        rows.push(...chunk);
        if (chunk.length < pageSize) break;
        from += pageSize;
      }
      return rows.map(mapIncident);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async updateStatus(id: string, status: PayrollAttendanceIncidentStatus): Promise<void> {
    const { error } = await supabase
      .from('payroll_attendance_incidents')
      .update({ status })
      .eq('id', id);
    if (error) handleSupabaseError(error);
    const { data, error: readError } = await supabase
      .from('payroll_attendance_incidents')
      .select('id, unit_id, employee_id, incident_type, status, incident_date, reported_by')
      .eq('id', id)
      .maybeSingle();
    if (readError) handleSupabaseError(readError);
    if (data) {
      try {
        await syncIncidentRowToAttendance(data);
      } catch (syncError) {
        console.warn('No se reflejó la falta en la asistencia', syncError);
        throw new Error('El estado se guardó, pero no se actualizó la asistencia del trabajador.');
      }
    }
  },

  async deleteById(id: string): Promise<void> {
    const { data: files, error: filesError } = await supabase
      .from('payroll_attendance_incident_attachments')
      .select('storage_path')
      .eq('incident_id', id);
    if (filesError && filesError.code !== 'PGRST205' && filesError.code !== '42P01') {
      handleSupabaseError(filesError);
    }
    const paths = (files || [])
      .map((row: { storage_path?: string }) => row.storage_path)
      .filter((path): path is string => Boolean(path));
    if (paths.length) {
      const { error: storageError } = await supabase.storage
        .from('attendance-incident-attachments')
        .remove(paths);
      if (storageError) {
        console.warn('No se pudieron borrar archivos de storage de la falta:', storageError.message);
      }
    }
    await clearIncidentAttendance(id);
    const { error } = await supabase.from('payroll_attendance_incidents').delete().eq('id', id);
    if (error) handleSupabaseError(error);
  },
};
