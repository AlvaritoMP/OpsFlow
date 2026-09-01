import { supabase, handleSupabaseError } from './supabase';
import { Resource, Unit, ResourceType } from '../types';
import {
  parseAttendanceExcelFile,
  deriveRowFields,
  guessReportDateFromFilename,
} from './attendanceReportExcelParser';
import { documentNumbersMatch } from '../utils/documentNumber';

export interface AttendanceReportImportDTO {
  id: string;
  unit_id: string;
  report_date: string;
  source_filename: string;
  sheet_used: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  column_mapping: Record<string, string>;
}

export interface AttendanceReportRowDTO {
  id: string;
  import_id: string;
  row_index: number;
  worker_name: string | null;
  dni: string | null;
  normalized_dni: string | null;
  attendance_status: string | null;
  minutes_late: number | null;
  /** Texto proveniente del Excel (observaciones del archivo). */
  notes: string | null;
  /** Comentario añadido en la app tras la importación (explicación de marca, p. ej. incompleta). */
  userComment: string | null;
  matched_resource_id: string | null;
  raw: Record<string, unknown>;
  /** Día de la marca (columna Dia del Excel cuando existe). */
  mark_date: string | null;
  punch_arrival: string | null;
  punch_lunch_out: string | null;
  punch_lunch_in: string | null;
  punch_departure: string | null;
}

/** Fila con metadatos de la importación (para evolución y cruces por fecha). */
export interface AttendanceRowWithImportMeta extends AttendanceReportRowDTO {
  import_report_date: string;
  source_filename: string;
  uploaded_at: string;
}

/** Misma idea de «activos» que la pestaña Personal: no archivado y no cesado/archivado. */
export function isPersonnelActiveForUnitView(r: Resource): boolean {
  if (r.type !== ResourceType.PERSONNEL) return false;
  if (r.archived === true) return false;
  if (r.personnelStatus === 'cesado' || r.personnelStatus === 'archivado') return false;
  return true;
}

export function effectiveAttendanceDate(row: AttendanceReportRowDTO, importReportDate: string): string {
  if (row.mark_date && /^\d{4}-\d{2}-\d{2}$/.test(row.mark_date)) return row.mark_date;
  return importReportDate;
}

export type AttendanceClassification = 'complete' | 'partial' | 'none' | 'other';

export function classifyAttendanceStatus(attendanceStatus: string | null): AttendanceClassification {
  const s = (attendanceStatus || '').toLowerCase();
  if (s.includes('marcación incompleta') || s.includes('marcacion incompleta')) return 'partial';
  if (s.includes('marcación completa') || s.includes('marcacion completa')) return 'complete';
  if (s.includes('sin marcas') || /ausenc|inasist/.test(s)) return 'none';
  return 'other';
}

/** True si hay una marca de ingreso usable (no vacía / "No marco"). */
export function hasArrivalPunch(row: Pick<AttendanceReportRowDTO, 'punch_arrival'>): boolean {
  const raw = String(row.punch_arrival ?? '').trim();
  if (!raw) return false;
  if (/^no\s*marco$/i.test(raw)) return false;
  if (/^sin\s*marca/i.test(raw)) return false;
  return true;
}

/**
 * Para tareo/novedades: marcación completa O al menos ingreso
 * (el ingreso basta para asumir asistencia del turno).
 */
export function isAttendancePresentForTareo(row: AttendanceReportRowDTO): boolean {
  const c = classifyAttendanceStatus(row.attendance_status);
  if (c === 'none') return false;
  if (c === 'complete') return true;
  if (hasArrivalPunch(row)) return true;
  return false;
}

export function workerRangeStats(rows: AttendanceReportRowDTO[]) {
  const n = rows.length;
  let complete = 0;
  let partial = 0;
  let none = 0;
  let other = 0;
  for (const r of rows) {
    const c = classifyAttendanceStatus(r.attendance_status);
    if (c === 'complete') complete++;
    else if (c === 'partial') partial++;
    else if (c === 'none') none++;
    else other++;
  }
  const pct = (x: number) => (n ? Math.round((x / n) * 1000) / 10 : 0);
  return {
    daysWithReport: n,
    complete,
    partial,
    none,
    other,
    pctComplete: pct(complete),
    pctPartial: pct(partial),
    pctNone: pct(none),
  };
}

/** Solo filas cuyo `matched_resource_id` es personal activo en la unidad (estado actual). */
export function filterRowsMatchedActivePersonnel(unit: Unit, rows: AttendanceReportRowDTO[]): AttendanceReportRowDTO[] {
  const byId = new Map((unit.resources || []).filter((x) => x.type === ResourceType.PERSONNEL).map((x) => [x.id, x]));
  return rows.filter((row) => {
    if (!row.matched_resource_id) return false;
    const res = byId.get(row.matched_resource_id);
    return res !== undefined && isPersonnelActiveForUnitView(res);
  });
}

function matchResourceIdForRow(unit: Unit, normalizedDni: string): string | null {
  if (!normalizedDni || !unit.resources?.length) return null;
  const r = unit.resources.find(
    (res) =>
      res.type === ResourceType.PERSONNEL &&
      documentNumbersMatch(res.dni, normalizedDni)
  );
  return r?.id || null;
}

export const attendanceReportService = {
  async listImports(unitId: string): Promise<AttendanceReportImportDTO[]> {
    const { data, error } = await supabase
      .from('attendance_report_imports')
      .select('*')
      .eq('unit_id', unitId)
      .order('report_date', { ascending: false })
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((r: any) => ({
      id: r.id,
      unit_id: r.unit_id,
      report_date: r.report_date,
      source_filename: r.source_filename,
      sheet_used: r.sheet_used,
      uploaded_at: r.uploaded_at,
      uploaded_by: r.uploaded_by,
      column_mapping: (r.column_mapping || {}) as Record<string, string>,
    }));
  },

  /**
   * Todas las filas de asistencia de la unidad con metadatos de importación.
   * Útil para la vista de evolución (varios días / archivos).
   */
  async getUnitAttendanceRowsWithMeta(unitId: string): Promise<AttendanceRowWithImportMeta[]> {
    const imports = await this.listImports(unitId);
    if (!imports.length) return [];

    const importMeta = new Map(imports.map((i) => [i.id, i]));
    const ids = imports.map((i) => i.id);
    const batchSize = 100;
    const raw: any[] = [];

    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from('attendance_report_rows')
        .select('*')
        .in('import_id', chunk)
        .order('row_index', { ascending: true });
      if (error) throw error;
      raw.push(...(data || []));
    }

    return raw.map((r: any) => {
      const imp = importMeta.get(r.import_id as string);
      
      let dynamicStatus = r.attendance_status;
      if (dynamicStatus === 'Marcación incompleta' || dynamicStatus === 'Marcación completa') {
        const arrivalEmpty = !r.punch_arrival || String(r.punch_arrival).trim() === '' || /^no\s*marco$/i.test(String(r.punch_arrival).trim());
        const departureEmpty = !r.punch_departure || String(r.punch_departure).trim() === '' || /^no\s*marco$/i.test(String(r.punch_departure).trim());
        
        if (!arrivalEmpty && !departureEmpty) {
          dynamicStatus = 'Marcación completa';
        } else {
          dynamicStatus = 'Marcación incompleta';
        }
      }

      const base: AttendanceReportRowDTO = {
        id: r.id,
        import_id: r.import_id,
        row_index: r.row_index,
        worker_name: r.worker_name,
        dni: r.dni,
        normalized_dni: r.normalized_dni,
        attendance_status: dynamicStatus,
        minutes_late: r.minutes_late,
        notes: r.notes,
        userComment: r.user_comment ?? null,
        matched_resource_id: r.matched_resource_id,
        raw: r.raw || {},
        mark_date: r.mark_date ?? null,
        punch_arrival: r.punch_arrival ?? null,
        punch_lunch_out: r.punch_lunch_out ?? null,
        punch_lunch_in: r.punch_lunch_in ?? null,
        punch_departure: r.punch_departure ?? null,
      };
      return {
        ...base,
        import_report_date: imp?.report_date ?? '',
        source_filename: imp?.source_filename ?? '',
        uploaded_at: imp?.uploaded_at ?? '',
      };
    });
  },

  async getRows(importId: string): Promise<AttendanceReportRowDTO[]> {
    const { data, error } = await supabase
      .from('attendance_report_rows')
      .select('*')
      .eq('import_id', importId)
      .order('row_index', { ascending: true });

    if (error) throw error;
    return (data || []).map((r: any) => {
      let dynamicStatus = r.attendance_status;
      if (dynamicStatus === 'Marcación incompleta' || dynamicStatus === 'Marcación completa') {
        const arrivalEmpty = !r.punch_arrival || String(r.punch_arrival).trim() === '' || /^no\s*marco$/i.test(String(r.punch_arrival).trim());
        const departureEmpty = !r.punch_departure || String(r.punch_departure).trim() === '' || /^no\s*marco$/i.test(String(r.punch_departure).trim());
        
        if (!arrivalEmpty && !departureEmpty) {
          dynamicStatus = 'Marcación completa';
        } else {
          dynamicStatus = 'Marcación incompleta';
        }
      }

      return {
        id: r.id,
        import_id: r.import_id,
        row_index: r.row_index,
        worker_name: r.worker_name,
        dni: r.dni,
        normalized_dni: r.normalized_dni,
        attendance_status: dynamicStatus,
        minutes_late: r.minutes_late,
        notes: r.notes,
        userComment: r.user_comment ?? null,
        matched_resource_id: r.matched_resource_id,
        raw: r.raw || {},
        mark_date: r.mark_date ?? null,
        punch_arrival: r.punch_arrival ?? null,
        punch_lunch_out: r.punch_lunch_out ?? null,
        punch_lunch_in: r.punch_lunch_in ?? null,
        punch_departure: r.punch_departure ?? null,
      };
    });
  },

  async updateRowUserComment(rowId: string, userComment: string | null): Promise<void> {
    const { error } = await supabase
      .from('attendance_report_rows')
      .update({ user_comment: userComment })
      .eq('id', rowId);
    if (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async deleteImport(importId: string): Promise<void> {
    const { error } = await supabase.from('attendance_report_imports').delete().eq('id', importId);
    if (error) throw error;
  },

  /** Parsea archivo, inserta cabecera y filas, intenta enlazar trabajadores por DNI dentro de la unidad. */
  async uploadAndSave(
    unit: Unit,
    file: File,
    reportDateOverride: string | null,
    uploadedByUserId: string | null
  ): Promise<{ importId: string; rowCount: number }> {
    const parsed = await parseAttendanceExcelFile(file);
    const reportDate =
      reportDateOverride?.trim() ||
      guessReportDateFromFilename(file.name) ||
      new Date().toISOString().slice(0, 10);

    const header = {
      unit_id: unit.id,
      report_date: reportDate,
      source_filename: file.name.slice(0, 240),
      sheet_used: parsed.sheetName,
      uploaded_by: uploadedByUserId,
      column_mapping: parsed.columnMapping,
    };

    let { data: imp, error: e1 } = await supabase
      .from('attendance_report_imports')
      .insert(header)
      .select('id')
      .single();

    // La FK de uploaded_by puede apuntar a auth.users; en OpsFlow el login usa
    // public.users, así que el ID del operador a menudo no existe ahí.
    if (e1 && uploadedByUserId && String(e1.message || '').includes('uploaded_by_fkey')) {
      const retry = await supabase
        .from('attendance_report_imports')
        .insert({ ...header, uploaded_by: null })
        .select('id')
        .single();
      imp = retry.data;
      e1 = retry.error;
    }

    if (e1) {
      handleSupabaseError(e1);
      throw e1;
    }

    const importId = imp!.id as string;

    const rowPayloads = parsed.rows.map((row, idx) => {
      const f = deriveRowFields(row);
      const matched = matchResourceIdForRow(unit, f.normalizedDni);
      return {
        import_id: importId,
        row_index: idx + 1,
        worker_name: f.workerName || null,
        dni: f.dni || null,
        normalized_dni: f.normalizedDni || null,
        attendance_status: f.attendanceStatus || null,
        minutes_late: f.minutesLate,
        notes: f.notes || null,
        matched_resource_id: matched,
        raw: row.rawByHeader as Record<string, unknown>,
        mark_date: f.markDate,
        punch_arrival: f.punchArrival,
        punch_lunch_out: f.punchLunchOut,
        punch_lunch_in: f.punchLunchIn,
        punch_departure: f.punchDeparture,
      };
    });

    const batchSize = 200;
    for (let i = 0; i < rowPayloads.length; i += batchSize) {
      const chunk = rowPayloads.slice(i, i + batchSize);
      const { error: e2 } = await supabase.from('attendance_report_rows').insert(chunk);
      if (e2) {
        await supabase.from('attendance_report_imports').delete().eq('id', importId);
        handleSupabaseError(e2);
        throw e2;
      }
    }

    return { importId, rowCount: rowPayloads.length };
  },

  summarize(rows: AttendanceReportRowDTO[]) {
    let present = 0;
    let absent = 0;
    let late = 0;
    let partial = 0;
    let other = 0;
    let matched = 0;
    for (const r of rows) {
      const s = (r.attendance_status || '').toLowerCase();
      if (s.includes('marcación incompleta') || s.includes('marcacion incompleta')) partial++;
      else if (s.includes('marcación completa') || s.includes('marcacion completa')) present++;
      else if (s.includes('sin marcas') || /ausenc|inasist/.test(s)) absent++;
      else if (/tardan|retraso/.test(s)) late++;
      else if (s && s !== '—') other++;
      else other++;
      if (r.matched_resource_id) matched++;
    }
    return { total: rows.length, present, absent, late, partial, other, matched };
  },
};
