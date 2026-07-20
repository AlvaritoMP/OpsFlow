import { supabase } from './supabase';
import { Resource, Unit, ResourceType } from '../types';
import {
  attendanceReportService,
  AttendanceRowWithImportMeta,
  effectiveAttendanceDate,
  filterRowsMatchedActivePersonnel,
  isAttendancePresentForTareo,
  isPersonnelActiveForUnitView,
} from './attendanceReportService';
import { excelService } from './excelService';
import { vacationService } from './vacationService';

/** Columnas del Tareo (paso 2) — no son las claves de novedades. */
export type TareoPayrollField =
  | 'turnos_tm'
  | 'turnos_tt'
  | 'turnos_tn'
  | 'vacaciones'
  | 'faltas'
  | 'descanso_medico'
  | 'licencia_sin_goce'
  | 'licencia_con_goce'
  | 'licencia_maternidad'
  | 'lgc_fallecimiento'
  | 'bono_nocturno'
  | 'descansos_dom_feriado'
  | 'he_d_25'
  | 'he_d_35'
  | 'he_n_25'
  | 'he_n_35'
  | 'ht'
  | 'none';

export type TareoValueKind = 'day' | 'hours' | 'none';

export interface AttendanceTareoKey {
  id: string;
  code: string;
  name: string;
  icon: string;
  color: string;
  valueKind: TareoValueKind;
  /** Valor del icono (típicamente 1 día). */
  valueAmount: number;
  countsAsPresentismo: boolean;
  /** Columna del Tareo (paso 2) donde se acumula. */
  payrollField: TareoPayrollField;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
}

/** Una fila = un día; hasta 2 claves (días + horas). */
export interface AttendanceTareoNovedad {
  id: string;
  unitId: string;
  resourceId: string;
  day: string;
  dayKeyId: string | null;
  hoursKeyId: string | null;
  hoursValue: number | null;
  comment: string | null;
  source: 'manual' | 'suggested';
  updatedBy: string | null;
  dayKey?: AttendanceTareoKey;
  hoursKey?: AttendanceTareoKey;
}

export interface TareoWorkerTotals {
  resourceId: string;
  presentismo: number;
  turnosTm: number;
  turnosTt: number;
  turnosTn: number;
  vacaciones: number;
  faltas: number;
  descansoMedico: number;
  licenciaSinGoce: number;
  licenciaConGoce: number;
  licenciaMaternidad: number;
  lgcFallecimiento: number;
  bonoNocturno: number;
  descansosDomFeriado: number;
  heD25: number;
  heD35: number;
  heN25: number;
  heN35: number;
  ht: number;
}

export const TAREO_PAYROLL_FIELD_OPTIONS: { value: TareoPayrollField; label: string; unit: 'DIAS' | 'HORAS' | '-' }[] = [
  { value: 'turnos_tm', label: 'Turnos TM', unit: 'DIAS' },
  { value: 'turnos_tt', label: 'Turnos TT', unit: 'DIAS' },
  { value: 'turnos_tn', label: 'Turnos TN', unit: 'DIAS' },
  { value: 'vacaciones', label: 'Vacaciones V', unit: 'DIAS' },
  { value: 'faltas', label: 'Faltas F', unit: 'DIAS' },
  { value: 'descanso_medico', label: 'Descansos Médicos DM', unit: 'DIAS' },
  { value: 'licencia_sin_goce', label: 'Licencia sin Goce LSG', unit: 'DIAS' },
  { value: 'licencia_con_goce', label: 'Licencia con goce', unit: 'DIAS' },
  { value: 'licencia_maternidad', label: 'Licencia Maternidad/Paternidad LM', unit: 'DIAS' },
  { value: 'lgc_fallecimiento', label: 'LGC por fallecimiento', unit: 'DIAS' },
  { value: 'bono_nocturno', label: 'Bono nocturno', unit: 'HORAS' },
  { value: 'descansos_dom_feriado', label: 'Descansos Dom/feriados', unit: 'HORAS' },
  { value: 'he_d_25', label: 'HE D 25%', unit: 'HORAS' },
  { value: 'he_d_35', label: 'HE D 35%', unit: 'HORAS' },
  { value: 'he_n_25', label: 'HE N 25%', unit: 'HORAS' },
  { value: 'he_n_35', label: 'HE N 35%', unit: 'HORAS' },
  { value: 'ht', label: 'HT descansos/feriados', unit: 'HORAS' },
  { value: 'none', label: 'Sin columna de Tareo', unit: '-' },
];

export const TAREO_EXPORT_HEADERS = [
  'EMPRESA',
  'UNIDAD',
  'TIPO DE TAREO',
  'FECHA INGRESO',
  'FECHA DE CESE',
  'TIPO DOC.',
  'NRO DOC.',
  'APELLIDOS Y NOMBRES',
  'BONO NOCTURNO',
  'Presentismo Consolidado',
  'Turnos TM',
  'Turnos TT',
  'Turnos TN',
  'Descansos Domingos y Días no laborables',
  'Licencia Maternidad/Paternidad LM',
  'Vacaciones V',
  'Licencia sin Goce LSG',
  'HE D 25% Horas Extras Diurnas al 25%',
  'HE D 35% Horas Extras Diurnas al 35%',
  'HE N 25% Horas Extras Nocturnas al 25%',
  'HE N 35% Horas Extras Nocturnas al 35%',
  'Faltas F',
  'Descansos Médicos DM',
  'Licencia con goce',
  'LGC por fallecimiento de familiar',
  'Total horas de trabajo en descansos o feriados HT',
] as const;

function mapKey(row: any): AttendanceTareoKey {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    icon: row.icon || 'circle',
    color: row.color || '#64748b',
    valueKind: (row.value_kind || 'day') as TareoValueKind,
    valueAmount: Number(row.value_amount ?? 1),
    countsAsPresentismo: !!row.counts_as_presentismo,
    payrollField: (row.payroll_field || 'none') as TareoPayrollField,
    sortOrder: Number(row.sort_order ?? 100),
    isActive: row.is_active !== false,
    isSystem: !!row.is_system,
  };
}

function mapNovedad(row: any, keyById?: Map<string, AttendanceTareoKey>): AttendanceTareoNovedad {
  const dayKeyId = (row.day_key_id as string) || null;
  const hoursKeyId = (row.hours_key_id as string) || null;
  return {
    id: row.id,
    unitId: row.unit_id,
    resourceId: row.resource_id,
    day: row.day,
    dayKeyId,
    hoursKeyId,
    hoursValue: row.hours_value != null ? Number(row.hours_value) : null,
    comment: row.comment ?? null,
    source: row.source === 'suggested' ? 'suggested' : 'manual',
    updatedBy: row.updated_by ?? null,
    dayKey: dayKeyId ? keyById?.get(dayKeyId) : undefined,
    hoursKey: hoursKeyId ? keyById?.get(hoursKeyId) : undefined,
  };
}

function emptyTotals(resourceId: string): TareoWorkerTotals {
  return {
    resourceId,
    presentismo: 0,
    turnosTm: 0,
    turnosTt: 0,
    turnosTn: 0,
    vacaciones: 0,
    faltas: 0,
    descansoMedico: 0,
    licenciaSinGoce: 0,
    licenciaConGoce: 0,
    licenciaMaternidad: 0,
    lgcFallecimiento: 0,
    bonoNocturno: 0,
    descansosDomFeriado: 0,
    heD25: 0,
    heD35: 0,
    heN25: 0,
    heN35: 0,
    ht: 0,
  };
}

function addToPayrollField(totals: TareoWorkerTotals, field: TareoPayrollField, amount: number) {
  if (!amount) return;
  switch (field) {
    case 'turnos_tm':
      totals.turnosTm += amount;
      break;
    case 'turnos_tt':
      totals.turnosTt += amount;
      break;
    case 'turnos_tn':
      totals.turnosTn += amount;
      break;
    case 'vacaciones':
      totals.vacaciones += amount;
      break;
    case 'faltas':
      totals.faltas += amount;
      break;
    case 'descanso_medico':
      totals.descansoMedico += amount;
      break;
    case 'licencia_sin_goce':
      totals.licenciaSinGoce += amount;
      break;
    case 'licencia_con_goce':
      totals.licenciaConGoce += amount;
      break;
    case 'licencia_maternidad':
      totals.licenciaMaternidad += amount;
      break;
    case 'lgc_fallecimiento':
      totals.lgcFallecimiento += amount;
      break;
    case 'bono_nocturno':
      totals.bonoNocturno += amount;
      break;
    case 'descansos_dom_feriado':
      totals.descansosDomFeriado += amount;
      break;
    case 'he_d_25':
      totals.heD25 += amount;
      break;
    case 'he_d_35':
      totals.heD35 += amount;
      break;
    case 'he_n_25':
      totals.heN25 += amount;
      break;
    case 'he_n_35':
      totals.heN35 += amount;
      break;
    case 'ht':
      totals.ht += amount;
      break;
    default:
      break;
  }
}

function applyKeyToTotals(totals: TareoWorkerTotals, key: AttendanceTareoKey, hoursValue: number | null) {
  if (key.valueKind === 'hours') {
    addToPayrollField(totals, key.payrollField, Number(hoursValue || 0));
    return;
  }
  const amount = Number(key.valueAmount || 0);
  if (key.countsAsPresentismo) totals.presentismo += amount;
  addToPayrollField(totals, key.payrollField, amount);
}

export function activePersonnelSorted(unit: Unit): Resource[] {
  return (unit.resources || [])
    .filter((r) => isPersonnelActiveForUnitView(r))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
}

export function eachDateInRange(dateFrom: string, dateTo: string): string[] {
  if (!dateFrom || !dateTo || dateFrom > dateTo) return [];
  const out: string[] = [];
  const cur = new Date(`${dateFrom}T12:00:00`);
  const end = new Date(`${dateTo}T12:00:00`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function suggestOkKeyCodeForShift(assignedShift?: string): string {
  const s = (assignedShift || '').toLowerCase();
  if (s.includes('noc') || s.includes('night')) return 'OK_TN';
  if (s.includes('tar') || s.includes('aft') || s.includes('afternoon')) return 'OK_TT';
  return 'OK_TM';
}

function formatDateDdMmYyyy(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function totalsToExportRow(
  w: Resource,
  t: TareoWorkerTotals,
  meta: { empresa: string; unidad: string; tipoTareo: string }
): Record<string, string | number> {
  return {
    EMPRESA: meta.empresa,
    UNIDAD: meta.unidad,
    'TIPO DE TAREO': meta.tipoTareo,
    'FECHA INGRESO': formatDateDdMmYyyy(w.startDate),
    'FECHA DE CESE': formatDateDdMmYyyy(w.endDate),
    'TIPO DOC.': 'DNI',
    'NRO DOC.': w.dni || '',
    'APELLIDOS Y NOMBRES': w.name || '',
    'BONO NOCTURNO': t.bonoNocturno,
    'Presentismo Consolidado': t.presentismo,
    'Turnos TM': t.turnosTm,
    'Turnos TT': t.turnosTt,
    'Turnos TN': t.turnosTn,
    'Descansos Domingos y Días no laborables': t.descansosDomFeriado,
    'Licencia Maternidad/Paternidad LM': t.licenciaMaternidad,
    'Vacaciones V': t.vacaciones,
    'Licencia sin Goce LSG': t.licenciaSinGoce,
    'HE D 25% Horas Extras Diurnas al 25%': t.heD25,
    'HE D 35% Horas Extras Diurnas al 35%': t.heD35,
    'HE N 25% Horas Extras Nocturnas al 25%': t.heN25,
    'HE N 35% Horas Extras Nocturnas al 35%': t.heN35,
    'Faltas F': t.faltas,
    'Descansos Médicos DM': t.descansoMedico,
    'Licencia con goce': t.licenciaConGoce,
    'LGC por fallecimiento de familiar': t.lgcFallecimiento,
    'Total horas de trabajo en descansos o feriados HT': t.ht,
  };
}

export const attendanceTareoService = {
  async listKeys(includeInactive = false): Promise<AttendanceTareoKey[]> {
    let q = supabase.from('attendance_tareo_keys').select('*').order('sort_order', { ascending: true });
    if (!includeInactive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return ((data || []) as any[]).map(mapKey);
  },

  async createKey(input: {
    code: string;
    name: string;
    icon?: string;
    color?: string;
    valueKind?: TareoValueKind;
    valueAmount?: number;
    countsAsPresentismo?: boolean;
    payrollField?: TareoPayrollField;
    sortOrder?: number;
  }): Promise<AttendanceTareoKey> {
    const code = input.code.trim().toUpperCase().replace(/\s+/g, '_');
    const { data, error } = await supabase
      .from('attendance_tareo_keys')
      .insert({
        code,
        name: input.name.trim(),
        icon: input.icon || 'circle',
        color: input.color || '#64748b',
        value_kind: input.valueKind || 'day',
        value_amount: input.valueAmount ?? 1,
        counts_as_presentismo: !!input.countsAsPresentismo,
        payroll_field: input.payrollField || 'none',
        sort_order: input.sortOrder ?? 200,
        is_active: true,
        is_system: false,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapKey(data as any);
  },

  async updateKey(
    id: string,
    patch: Partial<{
      name: string;
      icon: string;
      color: string;
      valueKind: TareoValueKind;
      valueAmount: number;
      countsAsPresentismo: boolean;
      payrollField: TareoPayrollField;
      sortOrder: number;
      isActive: boolean;
    }>
  ): Promise<AttendanceTareoKey> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.icon !== undefined) row.icon = patch.icon;
    if (patch.color !== undefined) row.color = patch.color;
    if (patch.valueKind !== undefined) row.value_kind = patch.valueKind;
    if (patch.valueAmount !== undefined) row.value_amount = patch.valueAmount;
    if (patch.countsAsPresentismo !== undefined) row.counts_as_presentismo = patch.countsAsPresentismo;
    if (patch.payrollField !== undefined) row.payroll_field = patch.payrollField;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    if (patch.isActive !== undefined) row.is_active = patch.isActive;

    const { data, error } = await supabase
      .from('attendance_tareo_keys')
      .update(row)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return mapKey(data as any);
  },

  async deleteKey(id: string): Promise<void> {
    const { data: existing, error: readErr } = await supabase
      .from('attendance_tareo_keys')
      .select('is_system')
      .eq('id', id)
      .single();
    if (readErr) throw readErr;
    if ((existing as { is_system?: boolean } | null)?.is_system) {
      throw new Error('Las claves de sistema no se eliminan; desactívalas si no las usas.');
    }
    const { error } = await supabase.from('attendance_tareo_keys').delete().eq('id', id);
    if (error) throw error;
  },

  async listNovedades(unitId: string, dateFrom: string, dateTo: string): Promise<AttendanceTareoNovedad[]> {
    const keys = await this.listKeys(true);
    const keyById = new Map<string, AttendanceTareoKey>(keys.map((k) => [k.id, k]));
    const { data, error } = await supabase
      .from('attendance_tareo_novedades')
      .select('*')
      .eq('unit_id', unitId)
      .gte('day', dateFrom)
      .lte('day', dateTo)
      .order('day', { ascending: true });
    if (error) throw error;
    return ((data || []) as any[]).map((r) => mapNovedad(r, keyById));
  },

  async upsertNovedad(input: {
    unitId: string;
    resourceId: string;
    day: string;
    dayKeyId?: string | null;
    hoursKeyId?: string | null;
    hoursValue?: number | null;
    comment?: string | null;
    source?: 'manual' | 'suggested';
    updatedBy?: string | null;
  }): Promise<AttendanceTareoNovedad> {
    const dayKeyId = input.dayKeyId || null;
    const hoursKeyId = input.hoursKeyId || null;
    const hoursValue = hoursKeyId != null ? (input.hoursValue ?? 0) : null;

    if (!dayKeyId && !hoursKeyId) {
      await this.clearNovedad(input.unitId, input.resourceId, input.day);
      return {
        id: '',
        unitId: input.unitId,
        resourceId: input.resourceId,
        day: input.day,
        dayKeyId: null,
        hoursKeyId: null,
        hoursValue: null,
        comment: null,
        source: 'manual',
        updatedBy: null,
      };
    }

    const payload = {
      unit_id: input.unitId,
      resource_id: input.resourceId,
      day: input.day,
      day_key_id: dayKeyId,
      hours_key_id: hoursKeyId,
      hours_value: hoursValue,
      comment: input.comment?.trim() || null,
      source: input.source || 'manual',
      updated_by: input.updatedBy || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('attendance_tareo_novedades')
      .upsert(payload, { onConflict: 'unit_id,resource_id,day' })
      .select('*')
      .single();
    if (error) throw error;
    const keys = await this.listKeys(true);
    const keyById = new Map<string, AttendanceTareoKey>(keys.map((k) => [k.id, k]));
    return mapNovedad(data as any, keyById);
  },

  async clearNovedad(unitId: string, resourceId: string, day: string): Promise<void> {
    const { error } = await supabase
      .from('attendance_tareo_novedades')
      .delete()
      .eq('unit_id', unitId)
      .eq('resource_id', resourceId)
      .eq('day', day);
    if (error) throw error;
  },

  async suggestFromConsolidated(
    unit: Unit,
    dateFrom: string,
    dateTo: string,
    updatedBy?: string | null
  ): Promise<number> {
    const [keys, existing, history, papeletas, dayEntries] = await Promise.all([
      this.listKeys(false),
      this.listNovedades(unit.id, dateFrom, dateTo),
      attendanceReportService.getUnitAttendanceRowsWithMeta(unit.id),
      vacationService.getPapeletas(undefined, unit.id),
      vacationService.getDayEntries(undefined, unit.id),
    ]);

    const keyByCode = new Map<string, AttendanceTareoKey>(keys.map((k) => [k.code, k]));
    const vacationKey = keyByCode.get('V');
    const existingByCell = new Map<string, AttendanceTareoNovedad>(
      existing.map((n) => [`${n.resourceId}|${n.day}`, n])
    );
    const existingDay = new Set(existing.filter((n) => n.dayKeyId).map((n) => `${n.resourceId}|${n.day}`));

    const workers = new Map<string, Resource>(
      (unit.resources || []).filter((r) => r.type === ResourceType.PERSONNEL).map((r) => [r.id, r])
    );
    const activeIds = new Set(workers.keys());

    /** Vacaciones otorgadas: papeletas emitidas + días a cuenta no anulados. */
    const vacationDays = new Set<string>();
    for (const p of papeletas) {
      if (p.status === 'cancelled' || p.status === 'draft') continue;
      if (!activeIds.has(p.resourceId)) continue;
      for (const day of eachDateInRange(p.startDate, p.endDate)) {
        if (day < dateFrom || day > dateTo) continue;
        vacationDays.add(`${p.resourceId}|${day}`);
      }
    }
    for (const d of dayEntries) {
      if (d.status === 'cancelled') continue;
      if (!activeIds.has(d.resourceId)) continue;
      if (d.vacationDate < dateFrom || d.vacationDate > dateTo) continue;
      vacationDays.add(`${d.resourceId}|${d.vacationDate}`);
    }

    const matched = filterRowsMatchedActivePersonnel(unit, history) as AttendanceRowWithImportMeta[];
    const latestByWorkerDay = new Map<string, AttendanceRowWithImportMeta>();
    for (const r of matched) {
      if (!r.matched_resource_id) continue;
      const d = effectiveAttendanceDate(r, r.import_report_date);
      if (d < dateFrom || d > dateTo) continue;
      const k = `${r.matched_resource_id}|${d}`;
      const prev = latestByWorkerDay.get(k);
      if (!prev || (r.uploaded_at || '').localeCompare(prev.uploaded_at || '') > 0) {
        latestByWorkerDay.set(k, r);
      }
    }

    const upsertSuggested = async (resourceId: string, day: string, dayKeyId: string) => {
      const cell = `${resourceId}|${day}`;
      if (existingDay.has(cell)) return false;
      const prev = existingByCell.get(cell);
      await this.upsertNovedad({
        unitId: unit.id,
        resourceId,
        day,
        dayKeyId,
        hoursKeyId: prev?.hoursKeyId || null,
        hoursValue: prev?.hoursValue ?? null,
        comment: prev?.comment || null,
        source: 'suggested',
        updatedBy: updatedBy || null,
      });
      existingDay.add(cell);
      return true;
    };

    let created = 0;

    // 1) Vacaciones otorgadas tienen prioridad
    if (vacationKey) {
      for (const cell of vacationDays) {
        const [resourceId, day] = cell.split('|');
        if (await upsertSuggested(resourceId, day, vacationKey.id)) created += 1;
      }
    }

    // 2) Asistencia: marcación completa O al menos ingreso → OK del turno
    for (const [cell, row] of latestByWorkerDay) {
      if (existingDay.has(cell)) continue;
      if (vacationDays.has(cell)) continue;
      if (!isAttendancePresentForTareo(row)) continue;
      const [resourceId, day] = cell.split('|');
      const worker = workers.get(resourceId);
      const code = suggestOkKeyCodeForShift(worker?.assignedShift);
      const key = keyByCode.get(code) || keyByCode.get('OK_TM');
      if (!key) continue;
      if (await upsertSuggested(resourceId, day, key.id)) created += 1;
    }

    return created;
  },

  aggregateTotals(
    workers: Resource[],
    novedades: AttendanceTareoNovedad[],
    keys: AttendanceTareoKey[]
  ): Map<string, TareoWorkerTotals> {
    const keyById = new Map(keys.map((k) => [k.id, k]));
    const map = new Map<string, TareoWorkerTotals>();
    for (const w of workers) map.set(w.id, emptyTotals(w.id));

    for (const n of novedades) {
      let totals = map.get(n.resourceId);
      if (!totals) {
        totals = emptyTotals(n.resourceId);
        map.set(n.resourceId, totals);
      }
      const dayKey = n.dayKey || (n.dayKeyId ? keyById.get(n.dayKeyId) : undefined);
      const hoursKey = n.hoursKey || (n.hoursKeyId ? keyById.get(n.hoursKeyId) : undefined);
      if (dayKey) applyKeyToTotals(totals, dayKey, null);
      if (hoursKey) applyKeyToTotals(totals, hoursKey, n.hoursValue);
    }
    return map;
  },

  async exportNominaTareo(options: {
    unit: Unit;
    dateFrom: string;
    dateTo: string;
    tipoTareo?: string;
    empresaOverride?: string;
  }): Promise<void> {
    const { unit, dateFrom, dateTo } = options;
    const tipoTareo = (options.tipoTareo || 'MENSUAL').trim() || 'MENSUAL';
    const empresa = (options.empresaOverride || unit.clientName || '').trim();

    const [keys, novedades] = await Promise.all([
      this.listKeys(true),
      this.listNovedades(unit.id, dateFrom, dateTo),
    ]);
    const workers = activePersonnelSorted(unit);
    const totalsMap = this.aggregateTotals(workers, novedades, keys);

    const rows = workers.map((w) =>
      totalsToExportRow(w, totalsMap.get(w.id) || emptyTotals(w.id), {
        empresa,
        unidad: unit.name,
        tipoTareo,
      })
    );

    const safeUnit = (unit.name || 'unidad').replace(/[^\w\-]+/g, '_').slice(0, 40);
    await excelService.exportToExcel(rows, [...TAREO_EXPORT_HEADERS], {
      filename: `tareo_nomina_${safeUnit}_${dateFrom}_${dateTo}.xlsx`,
      sheetName: 'Tareo',
    });
  },
};
