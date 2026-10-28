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
  /** worker: registro permanente. file: fila del Excel, solo mientras no exista el registro. */
  storedOn: 'worker' | 'file';
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

function derivePunchStatus(status: string | null, arrival: string | null, departure: string | null): string | null {
  if (status !== 'Marcación incompleta' && status !== 'Marcación completa') return status;
  const empty = (value: string | null) => {
    const text = String(value ?? '').trim();
    return !text || /^no\s*marco$/i.test(text);
  };
  return !empty(arrival) && !empty(departure) ? 'Marcación completa' : 'Marcación incompleta';
}

function isoDay(value: unknown): string {
  const text = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function isMissingWorkerMarksTable(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  const msg = String(e?.message || '');
  if (e?.code === '42P01' || e?.code === 'PGRST205') return true;
  return /attendance_worker_marks/i.test(msg) && /schema cache|does not exist|Could not find/i.test(msg);
}

async function fetchAllPages<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>
): Promise<T[]> {
  const pageSize = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return all;
}

function mapStoredRow(r: any): AttendanceReportRowDTO {
  const status = derivePunchStatus(r.attendance_status ?? null, r.punch_arrival ?? null, r.punch_departure ?? null);
  return {
    id: r.id,
    import_id: r.import_id ?? r.source_import_id ?? '',
    row_index: r.row_index ?? 0,
    worker_name: r.worker_name ?? null,
    dni: r.dni ?? null,
    normalized_dni: r.normalized_dni ?? null,
    attendance_status: status,
    minutes_late: r.minutes_late ?? null,
    notes: r.notes ?? null,
    userComment: r.user_comment ?? null,
    matched_resource_id: r.matched_resource_id ?? r.resource_id ?? null,
    raw: r.raw || {},
    mark_date: isoDay(r.mark_date) || null,
    punch_arrival: r.punch_arrival ?? null,
    punch_lunch_out: r.punch_lunch_out ?? null,
    punch_lunch_in: r.punch_lunch_in ?? null,
    punch_departure: r.punch_departure ?? null,
  };
}

function toImportMeta(
  row: AttendanceReportRowDTO,
  reportDate: string,
  filename: string,
  uploadedAt: string,
  storedOn: 'worker' | 'file'
): AttendanceRowWithImportMeta {
  return {
    ...row,
    import_report_date: reportDate,
    source_filename: filename,
    uploaded_at: uploadedAt,
    storedOn,
  };
}

/** Lee cada archivo por separado, página a página. Solo se usa si aún no existe el registro del trabajador. */
async function listMarksFromImportFiles(unitId: string, from?: string, to?: string): Promise<AttendanceRowWithImportMeta[]> {
  const { data: imports, error } = await supabase
    .from('attendance_report_imports')
    .select('id, report_date, source_filename, uploaded_at')
    .eq('unit_id', unitId);
  if (error) throw error;
  const files = (imports || []) as unknown as Array<{ id: string; report_date: string; source_filename: string | null; uploaded_at: string | null }>;
  const out: AttendanceRowWithImportMeta[] = [];
  for (const imp of files) {
    const reportDate = isoDay(imp.report_date);
    const rows = await fetchAllPages<any>((start, end) =>
      supabase
        .from('attendance_report_rows')
        .select('*')
        .eq('import_id', imp.id)
        .order('row_index', { ascending: true })
        .range(start, end)
    );
    for (const raw of rows) {
      const mapped = mapStoredRow(raw);
      const day = isoDay(mapped.mark_date) || reportDate;
      if (from && day && day < from) continue;
      if (to && day && day > to) continue;
      out.push(toImportMeta(mapped, reportDate, imp.source_filename || '', imp.uploaded_at || '', 'file'));
    }
  }
  const latest = new Map<string, AttendanceRowWithImportMeta>();
  for (const row of out) {
    const day = effectiveAttendanceDate(row, row.import_report_date);
    const key = row.matched_resource_id ? `${row.matched_resource_id}|${day}` : `row|${row.id}`;
    const prev = latest.get(key);
    if (!prev || (row.uploaded_at || '').localeCompare(prev.uploaded_at || '') > 0) latest.set(key, row);
  }
  return Array.from(latest.values());
}

type MarkWrite = {
  unit_id: string;
  resource_id: string;
  mark_date: string;
  attendance_status: string | null;
  minutes_late: number | null;
  notes: string | null;
  user_comment: string | null;
  punch_arrival: string | null;
  punch_lunch_out: string | null;
  punch_lunch_in: string | null;
  punch_departure: string | null;
  dni: string | null;
  normalized_dni: string | null;
  worker_name: string | null;
  source_import_id: string;
  source_row_id: string | null;
  source_filename: string;
  uploaded_at: string;
};

/** Deja en el registro del trabajador la marca de esta carga. Una carga más nueva del mismo día reemplaza la anterior. */
async function settleWorkerMarks(
  unitId: string,
  importId: string,
  filename: string,
  uploadedAt: string,
  reportDate: string,
  rows: Array<{
    row_index: number;
    worker_name: string | null;
    dni: string | null;
    normalized_dni: string | null;
    attendance_status: string | null;
    minutes_late: number | null;
    notes: string | null;
    matched_resource_id: string | null;
    mark_date: string | null;
    punch_arrival: string | null;
    punch_lunch_out: string | null;
    punch_lunch_in: string | null;
    punch_departure: string | null;
  }>,
  rowIdByIndex: Map<number, string>
): Promise<number | null> {
  const byWorkerDay = new Map<string, { rowIndex: number; mark: MarkWrite }>();
  for (const row of rows) {
    if (!row.matched_resource_id) continue;
    const day = isoDay(row.mark_date) || isoDay(reportDate);
    if (!day) continue;
    const key = `${row.matched_resource_id}|${day}`;
    const prev = byWorkerDay.get(key);
    if (prev && prev.rowIndex > row.row_index) continue;
    byWorkerDay.set(key, {
      rowIndex: row.row_index,
      mark: {
      unit_id: unitId,
      resource_id: row.matched_resource_id,
      mark_date: day,
      attendance_status: row.attendance_status,
      minutes_late: row.minutes_late,
      notes: row.notes,
      user_comment: null,
      punch_arrival: row.punch_arrival,
      punch_lunch_out: row.punch_lunch_out,
      punch_lunch_in: row.punch_lunch_in,
      punch_departure: row.punch_departure,
      dni: row.dni,
      normalized_dni: row.normalized_dni,
      worker_name: row.worker_name,
      source_import_id: importId,
      source_row_id: rowIdByIndex.get(row.row_index) || null,
      source_filename: filename,
      uploaded_at: uploadedAt,
      },
    });
  }

  const marks = Array.from(byWorkerDay.values()).map((entry) => entry.mark);
  if (!marks.length) return 0;

  const days = marks.map((m) => m.mark_date).sort();
  const existing = await fetchAllPages<any>((start, end) =>
    supabase
      .from('attendance_worker_marks')
      .select('resource_id, mark_date, user_comment')
      .eq('unit_id', unitId)
      .gte('mark_date', days[0])
      .lte('mark_date', days[days.length - 1])
      .range(start, end)
  ).catch((error: unknown) => {
    if (isMissingWorkerMarksTable(error)) return null;
    throw error;
  });
  if (existing === null) return null;

  const commentByKey = new Map<string, string | null>();
  for (const row of existing) {
    const key = `${row.resource_id}|${isoDay(row.mark_date)}`;
    if (row.user_comment) commentByKey.set(key, row.user_comment);
  }
  for (const mark of marks) {
    const kept = commentByKey.get(`${mark.resource_id}|${mark.mark_date}`);
    if (kept) mark.user_comment = kept;
  }

  const batchSize = 200;
  for (let i = 0; i < marks.length; i += batchSize) {
    const chunk = marks.slice(i, i + batchSize);
    const { error } = await supabase.from('attendance_worker_marks').upsert(chunk, {
      onConflict: 'unit_id,resource_id,mark_date',
    });
    if (error) {
      if (isMissingWorkerMarksTable(error)) return null;
      throw error;
    }
  }
  return marks.length;
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
   * Marcas ya guardadas en el registro del trabajador.
   * Si la tabla todavía no existe, lee los archivos importados página a página.
   */
  async listSettledMarks(unitId: string, from?: string, to?: string): Promise<AttendanceRowWithImportMeta[]> {
    const probe = await supabase.from('attendance_worker_marks').select('id').eq('unit_id', unitId).limit(1);
    if (probe.error) {
      if (isMissingWorkerMarksTable(probe.error)) return listMarksFromImportFiles(unitId, from, to);
      throw probe.error;
    }

    const rows = await fetchAllPages<any>((start, end) => {
      let query = supabase.from('attendance_worker_marks').select('*').eq('unit_id', unitId);
      if (from) query = query.gte('mark_date', from);
      if (to) query = query.lte('mark_date', to);
      return query.order('mark_date', { ascending: true }).order('id', { ascending: true }).range(start, end);
    });

    return rows.map((r: any) => {
      const day = isoDay(r.mark_date);
      return toImportMeta(mapStoredRow(r), day, r.source_filename || '', r.uploaded_at || '', 'worker');
    });
  },

  async getUnitAttendanceRowsWithMeta(unitId: string): Promise<AttendanceRowWithImportMeta[]> {
    return this.listSettledMarks(unitId);
  },

  async getRows(importId: string): Promise<AttendanceReportRowDTO[]> {
    const rows = await fetchAllPages<any>((start, end) =>
      supabase
        .from('attendance_report_rows')
        .select('*')
        .eq('import_id', importId)
        .order('row_index', { ascending: true })
        .range(start, end)
    );
    return rows.map((r: any) => mapStoredRow(r));
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
    const sync = await supabase
      .from('attendance_worker_marks')
      .update({ user_comment: userComment, updated_at: new Date().toISOString() })
      .eq('source_row_id', rowId);
    if (sync.error && !isMissingWorkerMarksTable(sync.error)) {
      handleSupabaseError(sync.error);
      throw sync.error;
    }
  },

  async updateWorkerMarkComment(markId: string, userComment: string | null): Promise<void> {
    const { data, error } = await supabase
      .from('attendance_worker_marks')
      .update({ user_comment: userComment, updated_at: new Date().toISOString() })
      .eq('id', markId)
      .select('source_row_id')
      .maybeSingle();
    if (error) {
      handleSupabaseError(error);
      throw error;
    }
    const saved = data as { source_row_id?: string | null } | null;
    if (saved?.source_row_id) {
      await supabase.from('attendance_report_rows').update({ user_comment: userComment }).eq('id', saved.source_row_id);
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
  ): Promise<{ importId: string; rowCount: number; settledCount: number | null }> {
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

    const importId = (imp as unknown as { id: string }).id;

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
    const rowIdByIndex = new Map<number, string>();
    for (let i = 0; i < rowPayloads.length; i += batchSize) {
      const chunk = rowPayloads.slice(i, i + batchSize);
      const { data: inserted, error: e2 } = await supabase
        .from('attendance_report_rows')
        .insert(chunk)
        .select('id, row_index');
      if (e2) {
        await supabase.from('attendance_report_imports').delete().eq('id', importId);
        handleSupabaseError(e2);
        throw e2;
      }
      for (const row of (inserted || []) as unknown as Array<{ id: string; row_index: number }>) {
        rowIdByIndex.set(row.row_index, row.id);
      }
    }

    const { data: savedImportRaw } = await supabase
      .from('attendance_report_imports')
      .select('uploaded_at, source_filename')
      .eq('id', importId)
      .maybeSingle();
    const savedImport = savedImportRaw as { uploaded_at?: string | null; source_filename?: string | null } | null;

    let settledCount: number | null = null;
    try {
      settledCount = await settleWorkerMarks(
        unit.id,
        importId,
        savedImport?.source_filename || file.name.slice(0, 240),
        savedImport?.uploaded_at || new Date().toISOString(),
        reportDate,
        rowPayloads,
        rowIdByIndex
      );
    } catch (settleError) {
      await supabase.from('attendance_report_imports').delete().eq('id', importId);
      handleSupabaseError(settleError);
      throw settleError;
    }

    return { importId, rowCount: rowPayloads.length, settledCount };
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
