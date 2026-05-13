/**
 * Parser flexible para reportes de asistencia en Excel (columnas según plantilla del proveedor).
 */

export type AttendanceColumnKey =
  | 'worker_name'
  | 'dni'
  | 'date'
  | 'check_in'
  | 'lunch_out'
  | 'lunch_in'
  | 'check_out'
  | 'status'
  | 'minutes_late'
  | 'zone'
  | 'notes';

const HEADER_SYNONYMS: Record<AttendanceColumnKey, string[]> = {
  worker_name: [
    'pat mat nom',
    'apellidos y nombres',
    'nombres y apellidos',
    'nombre y apellido',
    'nombre completo',
    'trabajador',
    'colaborador',
    'empleado',
    'personal',
    'funcionario',
  ],
  dni: [
    'dni',
    'documento',
    'documento de identidad',
    'cedula',
    'cédula',
    'numero documento',
    'nro documento',
    'n documento',
    'id',
    'codigo',
    'código',
  ],
  date: ['fecha', 'dia', 'día', 'fecha laborable', 'fecha de marcacion'],
  check_in: [
    'llegada',
    'entrada',
    'hora entrada',
    'hora de entrada',
    'marca entrada',
    'ingreso',
    'marcacion entrada',
    'entrada dia',
    'hi',
  ],
  lunch_out: ['salida almuerzo', 'salidaalmuerzo', 'marcacion salida almuerzo'],
  lunch_in: ['regreso almuerzo', 'regresoalmuerzo', 'marcacion regreso almuerzo'],
  check_out: [
    'hora salida',
    'hora de salida',
    'marca salida',
    'salida dia',
    'marcacion salida',
    'salida final',
    'hs',
  ],
  status: ['estado', 'situacion', 'situación', 'tipo', 'incidencia', 'condicion', 'condición', 'tipo asistencia'],
  minutes_late: ['tardanza', 'minutos tarde', 'min retraso', 'atraso', 'minutos de tardanza', 'retraso'],
  zone: ['zona', 'ubicacion', 'ubicación', 'sede', 'local', 'grupo', 'unidad'],
  notes: ['obs', 'observacion', 'observación', 'comentarios', 'glosa', 'detalle'],
};

export interface ParsedAttendanceExcel {
  sheetName: string;
  headerRowIndex: number;
  columnMapping: Record<string, string>;
  rows: ParsedAttendanceRow[];
  rawHeaders: string[];
}

export interface ParsedAttendanceRow {
  rowIndex: number;
  values: Partial<Record<AttendanceColumnKey, string>>;
  rawByHeader: Record<string, string>;
}

/** Sin acentos, minúsculas, recorta */
export function normalizeHeaderCell(v: unknown): string {
  return String(v ?? '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\.$/, '');
}

/** Igualdad por sinónimo evitando que "Salida" del Excel final coincida con "SalidaAlmuerzo". */
function headerSynonymHit(canonical: AttendanceColumnKey, syn: string, norm: string): boolean {
  if (!norm || !syn) return false;
  const nn = norm.replace(/\s+/g, '');
  const sn = syn.replace(/\s+/g, '');
  if (norm === syn || nn === sn) return true;

  if (canonical === 'lunch_out') {
    return nn === 'salidaalmuerzo' || (norm.includes('salida') && norm.includes('almuerzo'));
  }
  if (canonical === 'lunch_in') {
    return nn === 'regresoalmuerzo' || (norm.includes('regreso') && norm.includes('almuerzo'));
  }
  if (canonical === 'check_out') {
    if (norm.includes('almuerzo')) return false;
    return norm.includes(syn) || (syn.length >= 3 && syn.includes(norm));
  }
  if (canonical === 'worker_name' && syn === 'pat mat nom') {
    return norm.includes('pat mat nom');
  }
  return norm.includes(syn) || (syn.length >= 3 && syn.includes(norm));
}

function scoreHeaderRow(headers: string[]): { score: number; mapping: Record<string, string> } {
  const mapping: Record<string, string> = {};
  let score = 0;
  const normHeaders = headers.map((h, i) => ({ raw: h, norm: normalizeHeaderCell(h), i }));

  (Object.entries(HEADER_SYNONYMS) as [AttendanceColumnKey, string[]][]).forEach(([key, synonyms]) => {
    for (const syn of synonyms) {
      const hit = normHeaders.find((h) => headerSynonymHit(key, syn, h.norm));
      if (hit && hit.raw.trim()) {
        mapping[key] = hit.raw.trim();
        score += synonyms.length === 1 ? 2 : 1;
        break;
      }
    }
  });

  if (!mapping.check_out) {
    const exactSalida = normHeaders.find((h) => h.norm === 'salida');
    if (exactSalida?.raw.trim()) {
      mapping.check_out = exactSalida.raw.trim();
      score += 1;
    }
  }

  return { score, mapping };
}

/** Intenta yyyy-mm-dd desde nombre de archivo (dd.mm.yy) como en "(13.05.26)". */
export function guessReportDateFromFilename(name: string): string | null {
  const m = name.match(/\((\d{1,2})\.(\d{1,2})\.(\d{2,4})\)/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += y >= 70 ? 1900 : 2000;
  if (!d || mo < 1 || mo > 12) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export async function parseAttendanceExcelFile(file: File): Promise<ParsedAttendanceExcel> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) => /^repo\s*asistencia$/i.test(n.trim())) ||
    wb.SheetNames.find((n) => /asistencia/i.test(n) && !/nomarco|no\s*marco/i.test(n)) ||
    wb.SheetNames.find((n) => /marcacion|marcación/i.test(n)) ||
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('No hay hojas en el archivo Excel');

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];

  if (matrix.length < 3) throw new Error('El archivo debe tener cabeceras y filas de datos');

  let best = { score: -1, rowIdx: -1, mapping: {} as Record<string, string>, headers: [] as string[] };

  for (let r = 0; r < Math.min(25, matrix.length); r++) {
    const row = matrix[r] || [];
    const headers = row.map((c) => String(c ?? '').trim());
    if (headers.every((h) => !h)) continue;
    const { score, mapping } = scoreHeaderRow(headers);
    const nonEmpty = headers.filter(Boolean).length;
    const weighted = score + nonEmpty * 0.05;
    if (weighted > best.score) {
      best = { score: weighted, rowIdx: r, mapping, headers };
    }
  }

  if (best.rowIdx < 0 || Object.keys(best.mapping).length < 2) {
    throw new Error(
      'No se pudieron reconocer columnas del reporte (se esperan campos tipo DNI, nombre, entrada/salida, etc.). Pegue aquí una fila de cabeceras para ajustar el mapeo.'
    );
  }

  const canonicalToExcelHeader = best.mapping as Record<string, string>;
  const rawHeaders = best.headers;
  const headerIndex: Record<string, number> = {};
  rawHeaders.forEach((h, i) => {
    const t = h.trim();
    if (t) headerIndex[t] = i;
  });

  const rows: ParsedAttendanceRow[] = [];
  for (let r = best.rowIdx + 1; r < matrix.length; r++) {
    const line = matrix[r] || [];
    const rawByHeader: Record<string, string> = {};
    rawHeaders.forEach((key, ci) => {
      if (!key.trim()) return;
      const v = line[ci];
      rawByHeader[key] = v === undefined || v === null ? '' : String(v).trim();
    });

    const anyVal = Object.values(rawByHeader).some((v) => v.length > 0);
    if (!anyVal) continue;

    const values: Partial<Record<AttendanceColumnKey, string>> = {};
    (Object.entries(canonicalToExcelHeader) as [AttendanceColumnKey, string][]).forEach(([ck, excelH]) => {
      const ix = rawHeaders.indexOf(excelH);
      if (ix >= 0 && line[ix] !== undefined && line[ix] !== null && String(line[ix]).trim() !== '') {
        values[ck] = String(line[ix]).trim();
      }
    });

    rows.push({ rowIndex: r + 1, values, rawByHeader });
  }

  if (rows.length === 0) throw new Error('No se encontraron filas de datos debajo de la cabecera detectada');

  return {
    sheetName,
    headerRowIndex: best.rowIdx,
    columnMapping: canonicalToExcelHeader,
    rows,
    rawHeaders,
  };
}

/** Normaliza dígito único por cruce con personal */
export function normalizeDniDigits(dni?: string): string {
  return (dni || '').replace(/\D/g, '');
}

/** dd/mm/yyyy o yyyy-mm-dd → yyyy-mm-dd */
export function parseMarkDayToIso(dayCell: string | undefined): string | null {
  if (!dayCell?.trim()) return null;
  const t = dayCell.trim();
  const slash = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const d = Number(slash[1]);
    const mo = Number(slash[2]);
    const y = Number(slash[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 1900)
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return null;
}

const NO_MARCO_RE = /^no\s*marco$/i;

function isEmptyOrNoMarco(v: string | undefined): boolean {
  if (v === undefined || v === null) return true;
  const s = String(v).trim();
  return s === '' || NO_MARCO_RE.test(s);
}

/** Estado según las 4 marcas características OPALO. */
export function inferPunchAttendanceStatus(
  llegada?: string,
  salidaAlm?: string,
  regresoAlm?: string,
  salida?: string,
  textualStatusHint?: string
): string {
  const hlow = normalizeHeaderCell(textualStatusHint || '');
  if (/ausent|inasist|justif|vacac|lisenc|permis|suspend|descanso sin goce/i.test(hlow))
    return 'Ausencia / incidencia';
  if (/tardan|retraso|late/i.test(hlow)) return 'Tardanza';

  const p = [llegada, salidaAlm, regresoAlm, salida];
  const allEmpty = p.every(isEmptyOrNoMarco);
  if (allEmpty) return 'Sin marcas';
  const someEmpty = p.some(isEmptyOrNoMarco);
  if (!someEmpty) return 'Marcación completa';
  return 'Marcación incompleta';
}

export function punchDisplay(raw: string | undefined | null): string {
  if (raw === undefined || raw === null || String(raw).trim() === '') return 'Sin marca';
  const s = String(raw).trim();
  if (NO_MARCO_RE.test(s)) return 'No marco';
  return s;
}

function inferAttendanceStatus(vals: ParsedAttendanceRow['values'], rawCombined: string): string {
  const fromPunches = inferPunchAttendanceStatus(
    vals.check_in,
    vals.lunch_out,
    vals.lunch_in,
    vals.check_out,
    vals.status
  );
  if (fromPunches !== 'Sin marcas') return fromPunches;

  const s = normalizeHeaderCell(vals.status || '') + ' ' + rawCombined.slice(0, 200);
  const t = s.toLowerCase();
  if (/ausent|inasist|justif|vacac|lisenc|permis|ff\.?aa|suspens|descanso sin goce/i.test(t)) return 'Ausencia / incidencia';
  if (/tardan|retraso|late/i.test(t)) return 'Tardanza';
  if (/normal|presen|asist|^ok\b|marc/i.test(t)) return 'Presente';
  return vals.status?.trim() || fromPunches;
}

export function deriveRowFields(row: ParsedAttendanceRow): {
  workerName: string;
  dni: string;
  normalizedDni: string;
  attendanceStatus: string;
  minutesLate: number | null;
  notes: string;
  markDate: string | null;
  punchArrival: string | null;
  punchLunchOut: string | null;
  punchLunchIn: string | null;
  punchDeparture: string | null;
} {
  const name =
    row.values.worker_name?.trim() ||
    Object.entries(row.rawByHeader)
      .filter(([k]) => /nombre|apellido|trab|pat\s*mat/i.test(normalizeHeaderCell(k)))
      .map(([, v]) => v)
      .find(Boolean)
      ?.trim() ||
    '';

  let dni = row.values.dni?.trim() || '';
  if (!dni) {
    const dniKey = Object.keys(row.rawByHeader).find((k) =>
      /\bdni\b|documento\b|cedula|c[eé]dula/i.test(normalizeHeaderCell(k))
    );
    if (dniKey) dni = row.rawByHeader[dniKey] || '';
  }

  const rawCombined = Object.values(row.rawByHeader).join(' ');
  const markDate =
    parseMarkDayToIso(row.values.date) ||
    parseMarkDayToIso(Object.entries(row.rawByHeader).find(([k]) => normalizeHeaderCell(k) === 'dia')?.[1]) ||
    null;

  const punchArrival = row.values.check_in?.trim() || null;
  const punchLunchOut = row.values.lunch_out?.trim() || null;
  const punchLunchIn = row.values.lunch_in?.trim() || null;
  const punchDeparture = row.values.check_out?.trim() || null;

  let minutesLate: number | null = null;
  const ml = row.values.minutes_late;
  if (ml != null && String(ml).trim()) {
    const n = parseInt(String(ml).replace(/\D/g, ''), 10);
    minutesLate = Number.isFinite(n) ? n : null;
  }

  const attendanceStatus =
    punchArrival || punchLunchOut || punchLunchIn || punchDeparture
      ? inferPunchAttendanceStatus(punchArrival || undefined, punchLunchOut || undefined, punchLunchIn || undefined, punchDeparture || undefined, row.values.status)
      : inferAttendanceStatus(row.values, rawCombined);

  const notes =
    [
      row.values.notes?.trim(),
      row.values.zone?.trim(),
      valsExtraNote(row.values),
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 2000) || null;

  return {
    workerName: name,
    dni: dni.trim(),
    normalizedDni: normalizeDniDigits(dni.trim()),
    attendanceStatus,
    minutesLate,
    notes: notes || null,
    markDate,
    punchArrival,
    punchLunchOut,
    punchLunchIn,
    punchDeparture,
  };
}

function valsExtraNote(vals: ParsedAttendanceRow['values']): string | null {
  const parts = [
    vals.date && vals.date.trim() ? `Día archivo: ${vals.date.trim()}` : '',
    vals.status?.trim(),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
