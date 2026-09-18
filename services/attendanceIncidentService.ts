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
    const { error } = await supabase.from('payroll_attendance_incidents').delete().eq('id', id);
    if (error) handleSupabaseError(error);
  },
};
