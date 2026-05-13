import { supabase, handleSupabaseError } from './supabase';
import { Unit, ResourceType } from '../types';
import {
  parseAttendanceExcelFile,
  deriveRowFields,
  guessReportDateFromFilename,
} from './attendanceReportExcelParser';

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
  notes: string | null;
  matched_resource_id: string | null;
  raw: Record<string, unknown>;
  /** Día de la marca (columna Dia del Excel cuando existe). */
  mark_date: string | null;
  punch_arrival: string | null;
  punch_lunch_out: string | null;
  punch_lunch_in: string | null;
  punch_departure: string | null;
}

function matchResourceIdForRow(unit: Unit, normalizedDni: string): string | null {
  if (!normalizedDni || !unit.resources?.length) return null;
  const r = unit.resources.find(
    (res) =>
      res.type === ResourceType.PERSONNEL &&
      (res.dni || '').replace(/\D/g, '') === normalizedDni
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

  async getRows(importId: string): Promise<AttendanceReportRowDTO[]> {
    const { data, error } = await supabase
      .from('attendance_report_rows')
      .select('*')
      .eq('import_id', importId)
      .order('row_index', { ascending: true });

    if (error) throw error;
    return (data || []).map((r: any) => ({
      id: r.id,
      import_id: r.import_id,
      row_index: r.row_index,
      worker_name: r.worker_name,
      dni: r.dni,
      normalized_dni: r.normalized_dni,
      attendance_status: r.attendance_status,
      minutes_late: r.minutes_late,
      notes: r.notes,
      matched_resource_id: r.matched_resource_id,
      raw: r.raw || {},
      mark_date: r.mark_date ?? null,
      punch_arrival: r.punch_arrival ?? null,
      punch_lunch_out: r.punch_lunch_out ?? null,
      punch_lunch_in: r.punch_lunch_in ?? null,
      punch_departure: r.punch_departure ?? null,
    }));
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

    const { data: imp, error: e1 } = await supabase
      .from('attendance_report_imports')
      .insert({
        unit_id: unit.id,
        report_date: reportDate,
        source_filename: file.name.slice(0, 240),
        sheet_used: parsed.sheetName,
        uploaded_by: uploadedByUserId,
        column_mapping: parsed.columnMapping,
      })
      .select('id')
      .single();

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
