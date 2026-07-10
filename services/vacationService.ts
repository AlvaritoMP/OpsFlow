import { supabase, handleSupabaseError } from './supabase';
import {
  VacationBalance,
  VacationDayEntry,
  VacationPapeleta,
  VacationBalanceSummary,
  VacationPeriodBlock,
  Resource,
  Unit,
  ResourceType,
  VacationCalendarEvent,
  DailyShift,
} from '../types';
import { resourcesService } from './resourcesService';
import { vacationAuditService } from './vacationAuditService';
import {
  MAX_VACATION_DAYS_WITHOUT_AUTH,
  requiresVacationAuthorization,
  type VerifiedAuthorizer,
} from './vacationAuthService';

export { MAX_VACATION_DAYS_WITHOUT_AUTH, requiresVacationAuthorization };

/** Régimen general Perú: 30 días calendario / año (= 2.5 por mes completo de 30 días) */
export const DAYS_PER_YEAR = 30;
export const DAYS_PER_MONTH = 2.5;
/** Año comercial de récord vacacional (días de servicio computables / 360 × 30) */
export const SERVICE_DAYS_PER_YEAR = 360;
/** Primer bloque: fraccionable libremente (mín. medio día) */
export const FIRST_BLOCK_DAYS = 15;
/** Segundo bloque: goce en múltiplos de 7 */
export const SECOND_BLOCK_DAYS = 15;
export const MIN_FRACTION_DAYS = 0.5;
export const SECOND_BLOCK_MULTIPLE = 7;
/** @deprecated Usar reglas first15 / second15. Conservado por compatibilidad de imports. */
export const MIN_PAPELETA_DAYS = MIN_FRACTION_DAYS;

const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// ============================================
// UTILIDADES DE FECHA
// ============================================

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetweenInclusive(start: string, end: string): number {
  const s = parseDate(start);
  const e = parseDate(end);
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1;
}

function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function weekdayOf(dateStr: string): number {
  return parseDate(dateStr).getDay();
}

function monthsWorkedSince(hireDate: string, asOf: Date = new Date()): number {
  const hire = parseDate(hireDate);
  let months = (asOf.getFullYear() - hire.getFullYear()) * 12 + (asOf.getMonth() - hire.getMonth());
  if (asOf.getDate() < hire.getDate()) months--;
  return Math.max(0, months);
}

/** Días calendario de servicio desde ingreso hasta la fecha (ambos inclusive). */
export function countServiceDays(startDate: string, asOf: Date = new Date()): number {
  const hire = parseDate(startDate);
  const end = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  if (end < hire) return 0;
  return daysBetweenInclusive(startDate, formatDate(end));
}

/** Tasa diaria: 30 días vacaciones / 360 días de servicio (≈ 0.0833/día). */
export function dailyVacationAccrualRate(annualEntitlement: number = DAYS_PER_YEAR): number {
  return annualEntitlement / SERVICE_DAYS_PER_YEAR;
}

function normalizeAsOfDate(asOf: Date): Date {
  return new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function isMultipleOf(value: number, multiple: number, epsilon = 0.01): boolean {
  if (value <= 0) return false;
  const q = value / multiple;
  return Math.abs(q - Math.round(q)) < epsilon;
}

// ============================================
// DESCANSO SEMANAL
// ============================================

/**
 * Infiere el día de descanso semanal desde el roster (OFF más frecuente).
 * Por defecto domingo (0) — jornada típica 6×1.
 */
export function inferWeeklyRestDay(workSchedule?: DailyShift[]): number {
  if (!workSchedule?.length) return 0;
  const counts = [0, 0, 0, 0, 0, 0, 0];
  workSchedule.forEach(s => {
    if (s.type === 'OFF') counts[weekdayOf(s.date)]++;
  });
  let best = 0;
  let bestCount = -1;
  counts.forEach((c, i) => {
    if (c > bestCount) {
      bestCount = c;
      best = i;
    }
  });
  return bestCount > 0 ? best : 0;
}

export function weeklyRestDayLabel(day: number): string {
  return WEEKDAY_LABELS[((day % 7) + 7) % 7];
}

/**
 * Expande un goce solicitado en días laborales hasta completar el periodo
 * calendario incluyendo el descanso semanal (p. ej. 6 días laborales → 7 calendario).
 */
export function expandVacationWithRestDays(
  startDate: string,
  requestedWorkDays: number,
  weeklyRestDay: number = 0
): { endDate: string; returnDate: string; calendarDays: number; includedRestDates: string[]; workDays: number } {
  if (requestedWorkDays <= 0) {
    throw new Error('Los días solicitados deben ser mayores a 0');
  }

  let workCounted = 0;
  let current = startDate;
  let endDate = startDate;
  const includedRestDates: string[] = [];

  // Cubrir N días laborales; los descansos intercalados entran en el periodo
  while (workCounted < requestedWorkDays) {
    endDate = current;
    if (weekdayOf(current) === weeklyRestDay) {
      includedRestDates.push(current);
    } else {
      workCounted += 1;
    }
    current = addDays(current, 1);
    // Seguridad: no bucles infinitos
    if (daysBetweenInclusive(startDate, current) > 400) break;
  }

  // Extender hacia adelante mientras el siguiente día sea descanso semanal
  // (semana laboral de 6 + domingo = 7 calendario)
  while (weekdayOf(addDays(endDate, 1)) === weeklyRestDay) {
    endDate = addDays(endDate, 1);
    includedRestDates.push(endDate);
  }

  const calendarDays = daysBetweenInclusive(startDate, endDate);
  let returnDate = addDays(endDate, 1);
  while (weekdayOf(returnDate) === weeklyRestDay) {
    returnDate = addDays(returnDate, 1);
  }

  return {
    endDate,
    returnDate,
    calendarDays,
    includedRestDates: [...new Set(includedRestDates)],
    workDays: workCounted,
  };
}

/** Si el usuario elige salida/término, asegura incluir descansos al final del tramo. */
export function finalizeVacationPeriod(
  startDate: string,
  endDate: string,
  weeklyRestDay: number = 0
): { endDate: string; returnDate: string; calendarDays: number; includedRestDates: string[] } {
  if (endDate < startDate) {
    throw new Error('La fecha de término no puede ser anterior a la salida');
  }

  let finalEnd = endDate;
  const includedRestDates: string[] = [];

  for (let d = startDate; d <= finalEnd; d = addDays(d, 1)) {
    if (weekdayOf(d) === weeklyRestDay) includedRestDates.push(d);
  }

  while (weekdayOf(addDays(finalEnd, 1)) === weeklyRestDay) {
    finalEnd = addDays(finalEnd, 1);
    includedRestDates.push(finalEnd);
  }

  let returnDate = addDays(finalEnd, 1);
  while (weekdayOf(returnDate) === weeklyRestDay) {
    returnDate = addDays(returnDate, 1);
  }

  return {
    endDate: finalEnd,
    returnDate,
    calendarDays: daysBetweenInclusive(startDate, finalEnd),
    includedRestDates: [...new Set(includedRestDates)],
  };
}

// ============================================
// ACUMULACIÓN Y BLOQUES 15 + 15
// ============================================

export function calculateAccruedDays(
  startDate: string,
  annualEntitlement: number = DAYS_PER_YEAR,
  asOf: Date = new Date()
): {
  accruedDays: number;
  fullYears: number;
  monthsInCurrentPeriod: number;
  serviceDays: number;
  daysInCurrentPeriod: number;
} {
  const end = normalizeAsOfDate(asOf);
  const hire = parseDate(startDate);
  const serviceDays = countServiceDays(startDate, end);

  if (end < hire) {
    return {
      accruedDays: 0,
      fullYears: 0,
      monthsInCurrentPeriod: 0,
      serviceDays: 0,
      daysInCurrentPeriod: 0,
    };
  }

  const periods = buildPeriodAccruals(startDate, annualEntitlement, end);
  const accruedDays = round1(periods.reduce((sum, p) => sum + p.accruedInPeriod, 0));

  // Aniversarios de ingreso completos
  let fullYears = 0;
  let periodStart = new Date(hire);
  while (true) {
    const nextAnniversary = new Date(periodStart);
    nextAnniversary.setFullYear(nextAnniversary.getFullYear() + 1);
    if (nextAnniversary <= end) {
      fullYears++;
      periodStart = nextAnniversary;
    } else {
      break;
    }
  }

  const daysInCurrentPeriod = daysBetweenInclusive(formatDate(periodStart), formatDate(end));
  const monthsInCurrentPeriod = round1(daysInCurrentPeriod / 30);

  return {
    accruedDays,
    fullYears,
    monthsInCurrentPeriod,
    serviceDays,
    daysInCurrentPeriod,
  };
}

function buildPeriodAccruals(
  hireDate: string,
  annualEntitlement: number,
  asOf: Date = new Date()
): Array<{ periodIndex: number; periodStart: string; periodEnd: string; accruedInPeriod: number; serviceDaysInPeriod: number }> {
  const hire = parseDate(hireDate);
  const end = normalizeAsOfDate(asOf);
  if (end < hire) return [];

  const dailyRate = dailyVacationAccrualRate(annualEntitlement);
  const periods: Array<{
    periodIndex: number;
    periodStart: string;
    periodEnd: string;
    accruedInPeriod: number;
    serviceDaysInPeriod: number;
  }> = [];

  let periodStart = new Date(hire);
  let periodIndex = 1;

  while (periodStart <= end) {
    const theoreticalEnd = new Date(periodStart);
    theoreticalEnd.setFullYear(theoreticalEnd.getFullYear() + 1);
    theoreticalEnd.setDate(theoreticalEnd.getDate() - 1);

    const actualEnd = theoreticalEnd > end ? end : theoreticalEnd;
    const from = formatDate(periodStart);
    const to = formatDate(actualEnd);
    const serviceDaysInPeriod = daysBetweenInclusive(from, to);
    const accruedInPeriod = round1(
      Math.min(annualEntitlement, serviceDaysInPeriod * dailyRate)
    );

    periods.push({
      periodIndex,
      periodStart: from,
      periodEnd: formatDate(theoreticalEnd),
      accruedInPeriod,
      serviceDaysInPeriod,
    });

    periodIndex++;
    if (theoreticalEnd >= end) break;
    periodStart = new Date(theoreticalEnd);
    periodStart.setDate(periodStart.getDate() + 1);
  }

  return periods;
}

function allocateUsageToBlocks(
  periodAccruals: Array<{ periodIndex: number; periodStart: string; periodEnd: string; accruedInPeriod: number }>,
  totalUsed: number
): VacationPeriodBlock[] {
  let remaining = Math.max(0, totalUsed);

  return periodAccruals.map(p => {
    const firstBlockEarned = round1(Math.min(FIRST_BLOCK_DAYS, p.accruedInPeriod));
    const secondBlockEarned = round1(Math.max(0, p.accruedInPeriod - FIRST_BLOCK_DAYS));

    const firstBlockUsed = round1(Math.min(firstBlockEarned, remaining));
    remaining = round1(remaining - firstBlockUsed);
    const secondBlockUsed = round1(Math.min(secondBlockEarned, remaining));
    remaining = round1(remaining - secondBlockUsed);

    return {
      periodIndex: p.periodIndex,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      accruedInPeriod: p.accruedInPeriod,
      firstBlockEarned,
      secondBlockEarned,
      firstBlockUsed,
      secondBlockUsed,
      firstBlockAvailable: round1(firstBlockEarned - firstBlockUsed),
      secondBlockAvailable: round1(secondBlockEarned - secondBlockUsed),
    };
  });
}

export interface PapeletaAllocation {
  fromFirst15: number;
  fromSecond15: number;
  valid: boolean;
  error?: string;
}

/**
 * Valida e imputa días de una papeleta contra saldos first15 / second15.
 * - Primeros 15: fraccionables desde 0.5
 * - Segundos 15: múltiplos de 7 (o remanente final < 7 para cerrar el bloque)
 */
export function allocatePapeletaDays(
  requestedDays: number,
  first15Available: number,
  second15Available: number
): PapeletaAllocation {
  const days = round1(requestedDays);
  if (days < MIN_FRACTION_DAYS) {
    return {
      fromFirst15: 0,
      fromSecond15: 0,
      valid: false,
      error: `El goce mínimo es ${MIN_FRACTION_DAYS} día(s) (medio día).`,
    };
  }

  const fromFirst15 = round1(Math.min(days, Math.max(0, first15Available)));
  const fromSecond15 = round1(days - fromFirst15);

  if (fromSecond15 > second15Available + 0.01) {
    return {
      fromFirst15,
      fromSecond15,
      valid: false,
      error: `Saldo insuficiente. Disponibles: ${round1(first15Available)} (primeros 15) + ${round1(second15Available)} (segundos 15).`,
    };
  }

  if (fromSecond15 > 0) {
    const isMultiple = isMultipleOf(fromSecond15, SECOND_BLOCK_MULTIPLE);
    const isResidualClose =
      Math.abs(fromSecond15 - second15Available) < 0.01 &&
      fromSecond15 < SECOND_BLOCK_MULTIPLE;
    if (!isMultiple && !isResidualClose) {
      return {
        fromFirst15,
        fromSecond15,
        valid: false,
        error:
          `Los días imputados a los segundos 15 deben ser múltiplos de ${SECOND_BLOCK_MULTIPLE} ` +
          `(solicitados al 2.º bloque: ${fromSecond15}). ` +
          `Ajuste el goce o consuma primero el saldo de los primeros 15 días.`,
      };
    }
  }

  if (fromFirst15 > 0 && fromFirst15 < MIN_FRACTION_DAYS) {
    return {
      fromFirst15,
      fromSecond15,
      valid: false,
      error: `En los primeros 15 días el fraccionamiento mínimo es ${MIN_FRACTION_DAYS} día.`,
    };
  }

  return { fromFirst15, fromSecond15, valid: true };
}

export function buildBalanceSummary(
  resource: Resource,
  unit: Unit,
  balance: VacationBalance | null,
  papeletas: VacationPapeleta[],
  dayEntries: VacationDayEntry[]
): VacationBalanceSummary | null {
  if (!resource.startDate) return null;

  const annualEntitlement = balance?.annualEntitlement ?? DAYS_PER_YEAR;
  const { accruedDays, fullYears, monthsInCurrentPeriod, serviceDays, daysInCurrentPeriod } =
    calculateAccruedDays(resource.startDate, annualEntitlement);

  const activePapeletas = papeletas.filter(p => p.status !== 'cancelled');
  const papeletaDays = round1(activePapeletas.reduce((s, p) => s + Number(p.calendarDays), 0));

  const pendingEntries = dayEntries.filter(d => d.status === 'pending_batch');
  const pendingIndividualDays = round1(
    pendingEntries.reduce((s, d) => s + Number(d.daysCount ?? 1), 0)
  );
  const pendingDayDates = pendingEntries.map(d => d.vacationDate).sort();

  const historicalTakenDays = balance?.historicalTakenDays ?? 0;
  const totalUsedDays = round1(historicalTakenDays + papeletaDays + pendingIndividualDays);
  const availableDays = round1(accruedDays - totalUsedDays);

  const periodAccruals = buildPeriodAccruals(resource.startDate, annualEntitlement);
  const periodBlocks = allocateUsageToBlocks(periodAccruals, totalUsedDays);
  const first15Available = round1(periodBlocks.reduce((s, b) => s + b.firstBlockAvailable, 0));
  const second15Available = round1(periodBlocks.reduce((s, b) => s + b.secondBlockAvailable, 0));

  const weeklyRestDay = inferWeeklyRestDay(resource.workSchedule);
  const canIssueFromFirst = first15Available >= MIN_FRACTION_DAYS;
  const canIssueFromSecond =
    second15Available >= SECOND_BLOCK_MULTIPLE ||
    (second15Available > 0 && second15Available < SECOND_BLOCK_MULTIPLE);
  const canIssuePapeleta = availableDays >= MIN_FRACTION_DAYS && (canIssueFromFirst || canIssueFromSecond);

  return {
    resourceId: resource.id,
    workerName: resource.name,
    workerDni: resource.dni,
    unitId: unit.id,
    unitName: unit.name,
    startDate: resource.startDate,
    puesto: resource.puesto,
    accruedDays,
    historicalTakenDays,
    papeletaDays,
    pendingIndividualDays,
    totalUsedDays,
    availableDays,
    fullYears,
    monthsInCurrentPeriod,
    serviceDays,
    daysInCurrentPeriod,
    canIssuePapeleta,
    pendingDayDates,
    periodBlocks,
    first15Available,
    second15Available,
    weeklyRestDay,
    weeklyRestDayLabel: weeklyRestDayLabel(weeklyRestDay),
  };
}

// ============================================
// TRANSFORMACIONES DB
// ============================================

function transformBalanceFromDB(data: any): VacationBalance {
  return {
    id: data.id,
    resourceId: data.resource_id,
    historicalTakenDays: Number(data.historical_taken_days),
    annualEntitlement: data.annual_entitlement ?? DAYS_PER_YEAR,
    notes: data.notes,
    updatedAt: data.updated_at,
    updatedBy: data.updated_by,
  };
}

function transformDayEntryFromDB(data: any): VacationDayEntry {
  return {
    id: data.id,
    resourceId: data.resource_id,
    unitId: data.unit_id,
    vacationDate: data.vacation_date,
    daysCount: data.days_count != null ? Number(data.days_count) : 1,
    status: data.status,
    papeletaId: data.papeleta_id,
    notes: data.notes,
    createdAt: data.created_at,
    createdBy: data.created_by,
    cancelledBy: data.cancelled_by,
    cancelledAt: data.cancelled_at,
    updatedBy: data.updated_by,
    updatedAt: data.updated_at,
  };
}

function transformPapeletaFromDB(data: any): VacationPapeleta {
  return {
    id: data.id,
    resourceId: data.resource_id,
    unitId: data.unit_id,
    code: data.code,
    workerName: data.worker_name,
    workerDni: data.worker_dni,
    unitName: data.unit_name,
    startDate: data.start_date,
    endDate: data.end_date,
    returnDate: data.return_date,
    calendarDays: Number(data.calendar_days),
    sourceType: data.source_type,
    status: data.status,
    notes: data.notes,
    issuedAt: data.issued_at,
    issuedBy: data.issued_by,
    authorizedBy: data.authorized_by,
    cancelledBy: data.cancelled_by,
    cancelledAt: data.cancelled_at,
    updatedBy: data.updated_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function papeletaSnapshot(p: VacationPapeleta) {
  return {
    code: p.code,
    workerName: p.workerName,
    startDate: p.startDate,
    endDate: p.endDate,
    returnDate: p.returnDate,
    calendarDays: p.calendarDays,
    status: p.status,
    notes: p.notes,
  };
}

function dayEntrySnapshot(d: VacationDayEntry) {
  return {
    vacationDate: d.vacationDate,
    daysCount: d.daysCount ?? 1,
    status: d.status,
    notes: d.notes,
  };
}

async function revertShiftsToOff(resourceId: string, start: string, end: string): Promise<void> {
  for (const date of dateRange(start, end)) {
    await resourcesService.upsertDailyShift(resourceId, {
      date,
      type: 'OFF',
      hours: 0,
    });
  }
}

async function syncVacationShifts(resourceId: string, dates: string[]): Promise<void> {
  for (const date of dates) {
    await resourcesService.upsertDailyShift(resourceId, {
      date,
      type: 'Vacation',
      hours: 0,
    });
  }
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let current = start;
  while (current <= end) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

async function getSummaryForValidation(
  resourceId: string,
  unitId: string,
  unitName: string,
  workerName: string,
  workerDni?: string
): Promise<VacationBalanceSummary | null> {
  const { data: resourceRow } = await supabase
    .from('resources')
    .select('*')
    .eq('id', resourceId)
    .maybeSingle();

  const row = resourceRow as any;
  if (!row) return null;

  // Cargar roster para inferir descanso
  const { data: shifts } = await supabase
    .from('daily_shifts')
    .select('date, type, hours')
    .eq('resource_id', resourceId)
    .eq('type', 'OFF')
    .limit(90);

  const resource = {
    id: resourceId,
    name: workerName,
    dni: workerDni || row.dni,
    startDate: row.start_date,
    puesto: row.puesto,
    type: ResourceType.PERSONNEL,
    workSchedule: ((shifts as any[]) || []).map((s: any) => ({
      date: s.date,
      type: s.type,
      hours: Number(s.hours) || 0,
    })),
  } as Resource;

  const unit = { id: unitId, name: unitName, resources: [] } as Unit;
  const [balance, papeletas, dayEntries] = await Promise.all([
    vacationService.getBalance(resourceId),
    vacationService.getPapeletas(resourceId),
    vacationService.getDayEntries(resourceId),
  ]);

  return buildBalanceSummary(resource, unit, balance, papeletas, dayEntries);
}

// ============================================
// SERVICIO
// ============================================

export const vacationService = {
  DAYS_PER_YEAR,
  DAYS_PER_MONTH,
  SERVICE_DAYS_PER_YEAR,
  FIRST_BLOCK_DAYS,
  SECOND_BLOCK_DAYS,
  MIN_FRACTION_DAYS,
  SECOND_BLOCK_MULTIPLE,
  MIN_PAPELETA_DAYS,
  calculateAccruedDays,
  countServiceDays,
  dailyVacationAccrualRate,
  buildBalanceSummary,
  allocatePapeletaDays,
  expandVacationWithRestDays,
  finalizeVacationPeriod,
  inferWeeklyRestDay,
  weeklyRestDayLabel,

  async generatePapeletaCode(): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('vacation_papeletas')
        .select('code')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      let nextNumber = 1;
      if (data?.code) {
        const match = data.code.match(/-(\d+)$/);
        if (match) nextNumber = parseInt(match[1], 10) + 1;
      }

      const year = new Date().getFullYear();
      return `PAP-${year}-${nextNumber.toString().padStart(6, '0')}`;
    } catch {
      const year = new Date().getFullYear();
      return `PAP-${year}-${Date.now().toString().slice(-6)}`;
    }
  },

  // --- Balances ---

  async getBalance(resourceId: string): Promise<VacationBalance | null> {
    try {
      const { data, error } = await supabase
        .from('vacation_balances')
        .select('*')
        .eq('resource_id', resourceId)
        .maybeSingle();
      if (error) throw error;
      return data ? transformBalanceFromDB(data) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  async upsertBalance(
    resourceId: string,
    historicalTakenDays: number,
    notes?: string,
    updatedBy?: string,
    annualEntitlement: number = DAYS_PER_YEAR,
    workerName?: string
  ): Promise<VacationBalance> {
    const previous = await this.getBalance(resourceId);
    const { data, error } = await supabase
      .from('vacation_balances')
      .upsert(
        {
          resource_id: resourceId,
          historical_taken_days: historicalTakenDays,
          annual_entitlement: annualEntitlement,
          notes,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'resource_id' }
      )
      .select()
      .single();

    if (error) {
      handleSupabaseError(error);
      throw error;
    }
    const balance = transformBalanceFromDB(data);
    await vacationAuditService.logChange({
      actionType: previous ? 'UPDATE' : 'CREATE',
      entityType: 'VACATION_BALANCE',
      entityId: resourceId,
      entityName: workerName || resourceId,
      description: `Saldo histórico actualizado: ${historicalTakenDays} días`,
      before: previous
        ? { historicalTakenDays: previous.historicalTakenDays, notes: previous.notes }
        : undefined,
      after: { historicalTakenDays: balance.historicalTakenDays, notes: balance.notes },
      fields: ['historicalTakenDays', 'notes'],
    });
    return balance;
  },

  // --- Day entries ---

  async getDayEntries(resourceId?: string, unitId?: string): Promise<VacationDayEntry[]> {
    try {
      let query = supabase.from('vacation_day_entries').select('*').order('vacation_date', { ascending: false });
      if (resourceId) query = query.eq('resource_id', resourceId);
      if (unitId) query = query.eq('unit_id', unitId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(transformDayEntryFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async addDayEntry(
    resourceId: string,
    unitId: string,
    vacationDate: string,
    notes?: string,
    createdBy?: string,
    daysCount: number = 1
  ): Promise<VacationDayEntry> {
    const count = round1(daysCount);
    if (count !== 0.5 && count !== 1) {
      throw new Error('El día a cuenta debe ser 1 día completo o 0.5 (medio día)');
    }

    const summaryHint = await getSummaryForValidation(resourceId, unitId, '', '');
    if (summaryHint) {
      const allocation = allocatePapeletaDays(
        count,
        summaryHint.first15Available,
        summaryHint.second15Available
      );
      if (!allocation.valid) {
        throw new Error(allocation.error || 'No se puede registrar el día a cuenta con el saldo actual');
      }
    }

    const { data, error } = await supabase
      .from('vacation_day_entries')
      .insert({
        resource_id: resourceId,
        unit_id: unitId,
        vacation_date: vacationDate,
        days_count: count,
        status: 'pending_batch',
        notes,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      // Compatibilidad si aún no se corrió la migración days_count
      if (String(error.message || '').toLowerCase().includes('days_count')) {
        const fallback = await supabase
          .from('vacation_day_entries')
          .insert({
            resource_id: resourceId,
            unit_id: unitId,
            vacation_date: vacationDate,
            status: 'pending_batch',
            notes: count === 0.5 ? `${notes || ''} [medio día]`.trim() : notes,
            created_by: createdBy,
          })
          .select()
          .single();
        if (fallback.error) {
          handleSupabaseError(fallback.error);
          throw fallback.error;
        }
        await syncVacationShifts(resourceId, [vacationDate]);
        return transformDayEntryFromDB({ ...fallback.data, days_count: count });
      }
      handleSupabaseError(error);
      throw error;
    }

    await syncVacationShifts(resourceId, [vacationDate]);
    const entry = transformDayEntryFromDB(data);
    await vacationAuditService.logChange({
      actionType: 'CREATE',
      entityType: 'VACATION_DAY_ENTRY',
      entityId: entry.id,
      entityName: `${entry.vacationDate} (${entry.daysCount ?? 1} d)`,
      description: `Día a cuenta registrado para ${vacationDate}`,
      after: dayEntrySnapshot(entry),
    });
    return entry;
  },

  async updateDayEntry(
    id: string,
    updates: { vacationDate?: string; daysCount?: number; notes?: string },
    updatedBy: string
  ): Promise<VacationDayEntry> {
    const { data: current, error: fetchError } = await supabase
      .from('vacation_day_entries')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !current) throw new Error('Día a cuenta no encontrado');
    if (current.status !== 'pending_batch') {
      throw new Error('Solo se pueden editar días pendientes de agrupar');
    }

    const before = transformDayEntryFromDB(current);
    const newDate = updates.vacationDate ?? before.vacationDate;
    const newCount = round1(updates.daysCount ?? before.daysCount ?? 1);
    if (newCount !== 0.5 && newCount !== 1) {
      throw new Error('El día a cuenta debe ser 1 día completo o 0.5 (medio día)');
    }

    const { data, error } = await supabase
      .from('vacation_day_entries')
      .update({
        vacation_date: newDate,
        days_count: newCount,
        notes: updates.notes ?? before.notes,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      handleSupabaseError(error);
      throw error;
    }

    if (before.vacationDate !== newDate) {
      await revertShiftsToOff(before.resourceId, before.vacationDate, before.vacationDate);
      await syncVacationShifts(before.resourceId, [newDate]);
    }

    const entry = transformDayEntryFromDB(data);
    await vacationAuditService.logChange({
      actionType: 'UPDATE',
      entityType: 'VACATION_DAY_ENTRY',
      entityId: entry.id,
      entityName: `${entry.vacationDate} (${entry.daysCount ?? 1} d)`,
      description: `Día a cuenta actualizado`,
      before: dayEntrySnapshot(before),
      after: dayEntrySnapshot(entry),
      fields: ['vacationDate', 'daysCount', 'notes'].filter(
        f =>
          (f === 'vacationDate' && before.vacationDate !== entry.vacationDate) ||
          (f === 'daysCount' && (before.daysCount ?? 1) !== (entry.daysCount ?? 1)) ||
          (f === 'notes' && before.notes !== entry.notes)
      ),
    });
    return entry;
  },

  async cancelDayEntry(
    id: string,
    resourceId: string,
    cancelledBy: string,
    authorizedBy: VerifiedAuthorizer,
    reason?: string
  ): Promise<void> {
    const { data: entry } = await supabase
      .from('vacation_day_entries')
      .select('*')
      .eq('id', id)
      .single();

    if (!entry || entry.status !== 'pending_batch') {
      throw new Error('Solo se pueden anular días pendientes de agrupar');
    }

    const before = transformDayEntryFromDB(entry);
    const { error } = await supabase
      .from('vacation_day_entries')
      .update({
        status: 'cancelled',
        cancelled_by: cancelledBy,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      handleSupabaseError(error);
      throw error;
    }

    await resourcesService.upsertDailyShift(resourceId, {
      date: entry.vacation_date,
      type: 'OFF',
      hours: 0,
    });

    await vacationAuditService.logChange({
      actionType: 'DELETE',
      entityType: 'VACATION_DAY_ENTRY',
      entityId: id,
      entityName: `${before.vacationDate} (${before.daysCount ?? 1} d)`,
      description: reason || `Día a cuenta anulado (${before.vacationDate})`,
      before: dayEntrySnapshot(before),
      authorizedBy: { id: authorizedBy.id, name: authorizedBy.name, email: authorizedBy.email },
    });
  },

  // --- Papeletas ---

  async getPapeletas(resourceId?: string, unitId?: string): Promise<VacationPapeleta[]> {
    try {
      let query = supabase.from('vacation_papeletas').select('*').order('start_date', { ascending: false });
      if (resourceId) query = query.eq('resource_id', resourceId);
      if (unitId) query = query.eq('unit_id', unitId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(transformPapeletaFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async getPapeletaWithDays(id: string): Promise<VacationPapeleta | null> {
    const { data: papeleta, error } = await supabase
      .from('vacation_papeletas')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !papeleta) return null;

    const { data: days } = await supabase
      .from('vacation_day_entries')
      .select('*')
      .eq('papeleta_id', id)
      .order('vacation_date', { ascending: true });

    const result = transformPapeletaFromDB(papeleta);
    if (days?.length) {
      result.accumulatedDays = days.map(transformDayEntryFromDB);
    }
    return result;
  },

  async createDirectPapeleta(params: {
    resourceId: string;
    unitId: string;
    unitName: string;
    workerName: string;
    workerDni?: string;
    startDate: string;
    endDate: string;
    returnDate: string;
    notes?: string;
    issuedBy?: string;
    authorizedBy?: VerifiedAuthorizer;
    justification?: string;
    /** Si se indica, se expanden fechas con descanso semanal a partir de días laborales */
    requestedWorkDays?: number;
    weeklyRestDay?: number;
  }): Promise<VacationPapeleta> {
    const summary = await getSummaryForValidation(
      params.resourceId,
      params.unitId,
      params.unitName,
      params.workerName,
      params.workerDni
    );
    const restDay = params.weeklyRestDay ?? summary?.weeklyRestDay ?? 0;

    let startDate = params.startDate;
    let endDate = params.endDate;
    let returnDate = params.returnDate;
    let calendarDays: number;
    let restNote = '';

    if (params.requestedWorkDays && params.requestedWorkDays > 0) {
      const expanded = expandVacationWithRestDays(startDate, params.requestedWorkDays, restDay);
      endDate = expanded.endDate;
      returnDate = params.returnDate || expanded.returnDate;
      calendarDays = expanded.calendarDays;
      if (expanded.includedRestDates.length) {
        restNote = `Incluye descanso semanal (${weeklyRestDayLabel(restDay)}): ${expanded.includedRestDates.join(', ')}.`;
      }
    } else {
      const finalized = finalizeVacationPeriod(startDate, endDate, restDay);
      endDate = finalized.endDate;
      returnDate = params.returnDate || finalized.returnDate;
      calendarDays = finalized.calendarDays;
      if (finalized.includedRestDates.length) {
        restNote = `Incluye descanso semanal (${weeklyRestDayLabel(restDay)}): ${finalized.includedRestDates.join(', ')}.`;
      }
    }

    calendarDays = round1(calendarDays);
    const firstAvail = summary?.first15Available ?? 0;
    const secondAvail = summary?.second15Available ?? 0;
    const allocation = allocatePapeletaDays(calendarDays, firstAvail, secondAvail);
    if (!allocation.valid) {
      throw new Error(allocation.error || 'Goce no permitido según reglas de fraccionamiento');
    }

    if (requiresVacationAuthorization(calendarDays) && !params.authorizedBy) {
      throw new Error(
        `Goce mayor a ${MAX_VACATION_DAYS_WITHOUT_AUTH} días requiere autorización de otro usuario`
      );
    }
    if (requiresVacationAuthorization(calendarDays) && !params.justification?.trim()) {
      throw new Error(
        `Debe registrar la justificación del goce mayor a ${MAX_VACATION_DAYS_WITHOUT_AUTH} días`
      );
    }

    const justificationNote = params.justification?.trim()
      ? `Justificación (>7 días): ${params.justification.trim()}`
      : '';
    const allocNote =
      `Imputación: ${allocation.fromFirst15} día(s) a primeros 15` +
      (allocation.fromSecond15 > 0 ? ` + ${allocation.fromSecond15} a segundos 15 (múltiplos de 7)` : '') +
      '.';
    const notes = [params.notes, justificationNote, restNote, allocNote].filter(Boolean).join(' ');

    const code = await this.generatePapeletaCode();

    const { data, error } = await supabase
      .from('vacation_papeletas')
      .insert({
        resource_id: params.resourceId,
        unit_id: params.unitId,
        code,
        worker_name: params.workerName,
        worker_dni: params.workerDni,
        unit_name: params.unitName,
        start_date: startDate,
        end_date: endDate,
        return_date: returnDate,
        calendar_days: calendarDays,
        source_type: 'direct',
        status: 'issued',
        notes,
        issued_by: params.issuedBy,
        authorized_by: params.authorizedBy?.id ?? null,
      })
      .select()
      .single();

    if (error) {
      handleSupabaseError(error);
      throw error;
    }

    const dates = dateRange(startDate, endDate);
    await syncVacationShifts(params.resourceId, dates);

    const result = transformPapeletaFromDB(data);
    await vacationAuditService.logChange({
      actionType: 'CREATE',
      entityType: 'VACATION_PAPELETA',
      entityId: result.id,
      entityName: result.code,
      description: `Papeleta ${result.code} emitida (${calendarDays} días) — ${params.workerName}`,
      after: papeletaSnapshot(result),
      authorizedBy: params.authorizedBy
        ? { id: params.authorizedBy.id, name: params.authorizedBy.name, email: params.authorizedBy.email }
        : undefined,
      justification: params.justification?.trim() || undefined,
    });
    return result;
  },

  async createPapeletaFromAccumulated(params: {
    resourceId: string;
    unitId: string;
    unitName: string;
    workerName: string;
    workerDni?: string;
    startDate: string;
    endDate: string;
    returnDate: string;
    dayEntryIds: string[];
    notes?: string;
    issuedBy?: string;
    authorizedBy?: VerifiedAuthorizer;
    justification?: string;
    weeklyRestDay?: number;
  }): Promise<VacationPapeleta> {
    const { data: entries, error: entriesError } = await supabase
      .from('vacation_day_entries')
      .select('*')
      .in('id', params.dayEntryIds)
      .eq('resource_id', params.resourceId)
      .eq('status', 'pending_batch');

    if (entriesError) throw entriesError;
    if (!entries?.length) {
      throw new Error('Los días seleccionados no están disponibles');
    }

    const daysFromEntries = round1(
      entries.reduce((s, e) => s + Number((e as any).days_count ?? 1), 0)
    );

    const summary = await getSummaryForValidation(
      params.resourceId,
      params.unitId,
      params.unitName,
      params.workerName,
      params.workerDni
    );
    const restDay = params.weeklyRestDay ?? summary?.weeklyRestDay ?? 0;

    // Periodo formal de la papeleta: ampliar con descansos del tramo
    const finalized = finalizeVacationPeriod(params.startDate, params.endDate, restDay);
    // Los días descontados del saldo son los acumulados seleccionados (ya gozados),
    // no necesariamente el largo del tramo formal.
    const calendarDays = daysFromEntries;
    // Ajusta endDate formal al menos al tramo, pero el descuento sigue siendo daysFromEntries
    const endDate = finalized.endDate;
    const returnDate = params.returnDate || finalized.returnDate;

    // Los días seleccionados ya están en pending y reducen el summary; reabrir ese cupo al validar.
    const pendingSelected = daysFromEntries;
    let firstForValidation = summary?.first15Available ?? 0;
    let secondForValidation = summary?.second15Available ?? 0;
    if (summary?.startDate) {
      const periodAccruals = buildPeriodAccruals(summary.startDate, DAYS_PER_YEAR);
      const withoutPending = allocateUsageToBlocks(
        periodAccruals,
        round1(Math.max(0, (summary.totalUsedDays || 0) - pendingSelected))
      );
      firstForValidation = round1(withoutPending.reduce((s, b) => s + b.firstBlockAvailable, 0));
      secondForValidation = round1(withoutPending.reduce((s, b) => s + b.secondBlockAvailable, 0));
    } else {
      firstForValidation = round1(firstForValidation + pendingSelected);
    }

    const allocation = allocatePapeletaDays(calendarDays, firstForValidation, secondForValidation);
    if (!allocation.valid) {
      throw new Error(allocation.error || 'Goce no permitido según reglas de fraccionamiento');
    }

    if (requiresVacationAuthorization(calendarDays) && !params.authorizedBy) {
      throw new Error(
        `Goce mayor a ${MAX_VACATION_DAYS_WITHOUT_AUTH} días requiere autorización de otro usuario`
      );
    }
    if (requiresVacationAuthorization(calendarDays) && !params.justification?.trim()) {
      throw new Error(
        `Debe registrar la justificación del goce mayor a ${MAX_VACATION_DAYS_WITHOUT_AUTH} días`
      );
    }

    const justificationNote = params.justification?.trim()
      ? `Justificación (>7 días): ${params.justification.trim()}`
      : '';
    const restNote = finalized.includedRestDates.length
      ? `Incluye descanso semanal (${weeklyRestDayLabel(restDay)}): ${finalized.includedRestDates.join(', ')}.`
      : '';
    const allocNote =
      `Imputación: ${allocation.fromFirst15} día(s) a primeros 15` +
      (allocation.fromSecond15 > 0 ? ` + ${allocation.fromSecond15} a segundos 15` : '') +
      '.';
    const notes = [params.notes, justificationNote, restNote, allocNote].filter(Boolean).join(' ');

    const code = await this.generatePapeletaCode();

    const { data, error } = await supabase
      .from('vacation_papeletas')
      .insert({
        resource_id: params.resourceId,
        unit_id: params.unitId,
        code,
        worker_name: params.workerName,
        worker_dni: params.workerDni,
        unit_name: params.unitName,
        start_date: params.startDate,
        end_date: endDate,
        return_date: returnDate,
        calendar_days: calendarDays,
        source_type: 'accumulated',
        status: 'issued',
        notes,
        issued_by: params.issuedBy,
        authorized_by: params.authorizedBy?.id ?? null,
      })
      .select()
      .single();

    if (error) {
      handleSupabaseError(error);
      throw error;
    }

    await supabase
      .from('vacation_day_entries')
      .update({ status: 'batched', papeleta_id: data.id })
      .in('id', params.dayEntryIds);

    const result = transformPapeletaFromDB(data);
    result.accumulatedDays = entries.map(transformDayEntryFromDB);
    await vacationAuditService.logChange({
      actionType: 'CREATE',
      entityType: 'VACATION_PAPELETA',
      entityId: result.id,
      entityName: result.code,
      description: `Papeleta acumulada ${result.code} (${calendarDays} días) — ${params.workerName}`,
      after: papeletaSnapshot(result),
      authorizedBy: params.authorizedBy
        ? { id: params.authorizedBy.id, name: params.authorizedBy.name, email: params.authorizedBy.email }
        : undefined,
      justification: params.justification?.trim() || undefined,
    });
    return result;
  },

  async updatePapeleta(
    id: string,
    updates: {
      startDate: string;
      endDate: string;
      returnDate: string;
      notes?: string;
      weeklyRestDay?: number;
    },
    updatedBy: string
  ): Promise<VacationPapeleta> {
    const current = await this.getPapeletaWithDays(id);
    if (!current || current.status !== 'issued') {
      throw new Error('Solo se pueden editar papeletas emitidas');
    }

    const summary = await getSummaryForValidation(
      current.resourceId,
      current.unitId,
      current.unitName,
      current.workerName,
      current.workerDni
    );
    const restDay = updates.weeklyRestDay ?? summary?.weeklyRestDay ?? 0;
    const finalized = finalizeVacationPeriod(updates.startDate, updates.endDate, restDay);
    const calendarDays = round1(finalized.calendarDays);

    const excludeDays = Number(current.calendarDays);
    let firstForValidation = summary?.first15Available ?? 0;
    let secondForValidation = summary?.second15Available ?? 0;
    if (summary?.startDate) {
      const periodAccruals = buildPeriodAccruals(summary.startDate, DAYS_PER_YEAR);
      const withoutCurrent = allocateUsageToBlocks(
        periodAccruals,
        round1(Math.max(0, (summary.totalUsedDays || 0) - excludeDays))
      );
      firstForValidation = round1(withoutCurrent.reduce((s, b) => s + b.firstBlockAvailable, 0));
      secondForValidation = round1(withoutCurrent.reduce((s, b) => s + b.secondBlockAvailable, 0));
    } else {
      firstForValidation = round1(firstForValidation + excludeDays);
    }

    const allocation = allocatePapeletaDays(calendarDays, firstForValidation, secondForValidation);
    if (!allocation.valid) {
      throw new Error(allocation.error || 'Goce no permitido con el saldo disponible');
    }

    const oldStart = current.startDate;
    const oldEnd = current.endDate;

    const { data, error } = await supabase
      .from('vacation_papeletas')
      .update({
        start_date: updates.startDate,
        end_date: finalized.endDate,
        return_date: updates.returnDate || finalized.returnDate,
        calendar_days: calendarDays,
        notes: updates.notes ?? current.notes,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      handleSupabaseError(error);
      throw error;
    }

    await revertShiftsToOff(current.resourceId, oldStart, oldEnd);
    await syncVacationShifts(current.resourceId, dateRange(updates.startDate, finalized.endDate));

    const result = transformPapeletaFromDB(data);
    await vacationAuditService.logChange({
      actionType: 'UPDATE',
      entityType: 'VACATION_PAPELETA',
      entityId: result.id,
      entityName: result.code,
      description: `Papeleta ${result.code} editada — ${current.workerName}`,
      before: papeletaSnapshot(current),
      after: papeletaSnapshot(result),
      fields: ['startDate', 'endDate', 'returnDate', 'calendarDays', 'notes'],
    });
    return result;
  },

  async cancelPapeleta(
    id: string,
    cancelledBy: string,
    authorizedBy: VerifiedAuthorizer,
    reason?: string
  ): Promise<void> {
    const current = await this.getPapeletaWithDays(id);
    if (!current || current.status !== 'issued') {
      throw new Error('Solo se pueden anular papeletas emitidas');
    }

    const { error } = await supabase
      .from('vacation_papeletas')
      .update({
        status: 'cancelled',
        cancelled_by: cancelledBy,
        cancelled_at: new Date().toISOString(),
        authorized_by: authorizedBy.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      handleSupabaseError(error);
      throw error;
    }

    await revertShiftsToOff(current.resourceId, current.startDate, current.endDate);

    if (current.sourceType === 'accumulated') {
      await supabase
        .from('vacation_day_entries')
        .update({ status: 'pending_batch', papeleta_id: null })
        .eq('papeleta_id', id);
    }

    await vacationAuditService.logChange({
      actionType: 'DELETE',
      entityType: 'VACATION_PAPELETA',
      entityId: current.id,
      entityName: current.code,
      description: reason || `Papeleta ${current.code} anulada — ${current.workerName}`,
      before: papeletaSnapshot(current),
      authorizedBy: { id: authorizedBy.id, name: authorizedBy.name, email: authorizedBy.email },
    });
  },

  // --- Agregados ---

  async getUnitSummaries(units: Unit[]): Promise<VacationBalanceSummary[]> {
    const summaries: VacationBalanceSummary[] = [];

    for (const unit of units) {
      const personnel = (unit.resources || []).filter(
        r => r.type === ResourceType.PERSONNEL && r.personnelStatus !== 'cesado' && !r.archived
      );

      for (const resource of personnel) {
        const [balance, papeletas, dayEntries] = await Promise.all([
          this.getBalance(resource.id),
          this.getPapeletas(resource.id),
          this.getDayEntries(resource.id),
        ]);

        const summary = buildBalanceSummary(resource, unit, balance, papeletas, dayEntries);
        if (summary) summaries.push(summary);
      }
    }

    return summaries.sort((a, b) => a.workerName.localeCompare(b.workerName));
  },

  async getWorkersOnVacation(units: Unit[], fromDate: string, toDate: string): Promise<{
    resourceId: string;
    workerName: string;
    unitName: string;
    startDate: string;
    endDate: string;
    type: 'papeleta' | 'day_entry';
    code?: string;
  }[]> {
    const unitIds = units.map(u => u.id);
    if (unitIds.length === 0) return [];

    const { data: papeletas } = await supabase
      .from('vacation_papeletas')
      .select('*')
      .in('unit_id', unitIds)
      .neq('status', 'cancelled')
      .lte('start_date', toDate)
      .gte('end_date', fromDate);

    const { data: dayEntries } = await supabase
      .from('vacation_day_entries')
      .select('*')
      .in('unit_id', unitIds)
      .eq('status', 'pending_batch')
      .gte('vacation_date', fromDate)
      .lte('vacation_date', toDate);

    const results: {
      resourceId: string;
      workerName: string;
      unitName: string;
      startDate: string;
      endDate: string;
      type: 'papeleta' | 'day_entry';
      code?: string;
    }[] = [];

    (papeletas || []).forEach(p => {
      results.push({
        resourceId: p.resource_id,
        workerName: p.worker_name,
        unitName: p.unit_name,
        startDate: p.start_date,
        endDate: p.end_date,
        type: 'papeleta',
        code: p.code,
      });
    });

    const resourceMap = new Map<string, string>();
    units.forEach(u => {
      (u.resources || []).forEach(r => resourceMap.set(r.id, r.name));
    });

    (dayEntries || []).forEach(d => {
      const unit = units.find(u => u.id === d.unit_id);
      results.push({
        resourceId: d.resource_id,
        workerName: resourceMap.get(d.resource_id) || 'Desconocido',
        unitName: unit?.name || '',
        startDate: d.vacation_date,
        endDate: d.vacation_date,
        type: 'day_entry',
      });
    });

    return results;
  },

  async getCalendarEvents(units: Unit[], fromDate: string, toDate: string): Promise<VacationCalendarEvent[]> {
    const unitIds = units.map(u => u.id);
    if (unitIds.length === 0) return [];

    const { data: papeletas } = await supabase
      .from('vacation_papeletas')
      .select('*')
      .in('unit_id', unitIds)
      .neq('status', 'cancelled')
      .lte('start_date', toDate)
      .gte('end_date', fromDate);

    const { data: dayEntries } = await supabase
      .from('vacation_day_entries')
      .select('*')
      .in('unit_id', unitIds)
      .in('status', ['pending_batch', 'batched'])
      .gte('vacation_date', fromDate)
      .lte('vacation_date', toDate);

    const resourceMap = new Map<string, string>();
    units.forEach(u => {
      (u.resources || []).forEach(r => resourceMap.set(r.id, r.name));
    });

    const events: VacationCalendarEvent[] = [];

    (papeletas || []).forEach(p => {
      for (const d of dateRange(p.start_date, p.end_date)) {
        if (d >= fromDate && d <= toDate) {
          events.push({
            date: d,
            unitId: p.unit_id,
            unitName: p.unit_name,
            resourceId: p.resource_id,
            workerName: p.worker_name,
            eventType: 'papeleta',
            code: p.code,
          });
        }
      }
    });

    (dayEntries || []).forEach(d => {
      const unit = units.find(u => u.id === d.unit_id);
      events.push({
        date: d.vacation_date,
        unitId: d.unit_id,
        unitName: unit?.name || '',
        resourceId: d.resource_id,
        workerName: resourceMap.get(d.resource_id) || 'Desconocido',
        eventType: 'day_entry',
      });
    });

    return events.sort((a, b) => a.date.localeCompare(b.date) || a.workerName.localeCompare(b.workerName));
  },
};
