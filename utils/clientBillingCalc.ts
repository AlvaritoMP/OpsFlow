/** Cálculo de facturación de intermediación / tercerización.
 * Réplica del método del archivo de facturación (Estación Callao, abril):
 * costo laboral con cargas, operativo, administrativo y utilidad.
 * Las celdas salen de las fórmulas editables. Sin fórmulas guardadas se usa el método de fábrica.
 */

import {
  BILLING_FORMULA_DEFS,
  BillingFormulaSet,
  evaluateFormulas,
  normalizeBillingFormulas,
  WORKER_FORMULA_IDS,
} from './billingFormulas';

export type { BillingFormulaSet };

export type ProfitMode = 'margin_on_price' | 'markup_on_cost';
export type ProfitBase = 'all' | 'labor';
/** Porcentaje sobre la base laboral, o un monto igual para cada trabajador. */
export type EssaludMode = 'percent' | 'fixed';

export interface BillingRates {
  familyAllowanceAmount: number;
  vacationRate: number;
  gratiRate: number;
  gratiBonusFactor: number;
  ctsRate: number;
  feriaRate: number;
  applyFeria: boolean;
  essaludRate: number;
  /** percent: tasa sobre la base. fixed: monto en soles, igual para cada trabajador. */
  essaludMode: EssaludMode;
  /** Monto de EsSalud por trabajador cuando essaludMode es fixed. */
  essaludFixedAmount: number;
  /** Remuneración mínima vital. La base de EsSalud en porcentaje no baja de este monto. */
  minimumWage: number;
  vidaLeyRate: number;
  applyVidaLey: boolean;
  sctrRate: number;
  applySctr: boolean;
  he25Factor: number;
  he35Factor: number;
  /** La hora extra diurna suma la asignación familiar al sueldo. */
  heDayIncludeFamily: boolean;
  /** La hora extra nocturna suma la asignación familiar, sin recargarla. */
  heNightIncludeFamily: boolean;
  /** La hora extra nocturna suma el recargo nocturno sobre el sueldo. */
  heNightApplyPremium: boolean;
  nightPremiumRate: number;
  /** El bono nocturno incluye la asignación familiar en la base. */
  nightBonusIncludeFamily: boolean;
  /**
   * En el detalle para el cliente, las horas extra nocturnas se muestran dentro del bono nocturno.
   * Las diurnas siguen en su columna. El cálculo del costo no cambia.
   */
  rollOvertimeIntoNightBonus: boolean;
  commercialMonthDays: number;
  hoursPerDay: number;
  financialAnnualRate: number;
  financialDays: number;
  profitMode: ProfitMode;
  profitRate: number;
  profitBase: ProfitBase;
  igvRate: number;
}

export interface BillingWorkerSuggestion {
  contractualSalary: number;
  daysWorked: number;
  familyAllowance: number;
  workCondition: number;
  bonus: number;
}

export interface BillingWorkerInput {
  id: string;
  resourceId?: string;
  name: string;
  position: string;
  dni?: string;
  included: boolean;
  origin: 'unit' | 'manual';
  missingFromUnit?: boolean;
  contractualSalary: number;
  daysWorked: number;
  familyAllowance: number;
  workCondition: number;
  bonus: number;
  bonusConcept?: string;
  nightShift?: boolean;
  he25Hours: number;
  he25Manual: number | null;
  he35Hours: number;
  he35Manual: number | null;
  heNight25Hours?: number;
  heNight25Manual?: number | null;
  heNight35Hours?: number;
  heNight35Manual?: number | null;
  nightHours: number;
  nightManual: number | null;
  socialBaseManual: boolean;
  socialBase: number;
  factor: number;
  /** Días del mes antes de descontar faltas. */
  calendarDays?: number;
  /** Faltas de Mattermost, tareo o asistencia, sin contar dos veces el mismo día. */
  absenceDays?: number;
  absenceDetail?: string;
  /** Fecha de inicio de la ficha (YYYY-MM-DD). */
  startDate?: string;
  /** Fecha de cese de la ficha (YYYY-MM-DD). Vacío si sigue vigente. */
  endDate?: string;
  /** Sigue activo en la unidad. Quien cesó entra solo si su relación pisa el corte. */
  activeOnUnit?: boolean;
  /** El usuario editó Días. Ese valor no se reemplaza al recalcular. */
  daysManual?: boolean;
  /** Días de vacaciones gozadas en el corte. Sostienen vacaciones, gratificación, CTS, feriados y EsSalud. */
  vacationDays?: number;
  notes?: string;
  /** Montos que se suman al calculado de una celda. Sin explicación no se aplican. */
  adjustments?: Partial<Record<BillingAdjustmentKey, BillingCellAdjustment>>;
  suggested?: BillingWorkerSuggestion;
}

/** Celda calculada de personal a la que se le puede sumar un ajuste. */
export type BillingAdjustmentKey =
  | 'basic'
  | 'he25'
  | 'he35'
  | 'heNight25'
  | 'heNight35'
  | 'night'
  | 'vacation'
  | 'gratification'
  | 'cts'
  | 'feria'
  | 'essalud'
  | 'vidaLey'
  | 'sctr';

export interface BillingCellAdjustment {
  amount: number;
  reason: string;
  authorName: string;
  createdAt: string;
}

export const BILLING_ADJUSTMENT_LABELS: Record<BillingAdjustmentKey, string> = {
  basic: 'Remuneración básica',
  he25: 'Hora extra diurna 25%',
  he35: 'Hora extra diurna 35%',
  heNight25: 'Hora extra nocturna 25%',
  heNight35: 'Hora extra nocturna 35%',
  night: 'Bono nocturno',
  vacation: 'Vacaciones',
  gratification: 'Gratificación',
  cts: 'CTS',
  feria: 'Feriado',
  essalud: 'EsSalud',
  vidaLey: 'Vida Ley',
  sctr: 'SCTR',
};

/** El adicional entra al costo solo si tiene monto y una explicación. */
export function adjustmentAmount(worker: BillingWorkerInput, key: BillingAdjustmentKey): number {
  const item = worker.adjustments?.[key];
  if (!item) return 0;
  const amount = Number(item.amount);
  const reason = String(item.reason || '').trim();
  if (!Number.isFinite(amount) || amount === 0 || !reason) return 0;
  return amount;
}

export interface BillingCostLine {
  id: string;
  kind: string;
  description: string;
  amount: number;
  formulaLocked?: boolean;
  note?: string;
}

/** Pestañas de la liquidación que pueden llevar bitácora interna. */
export type BillingInternalTab = 'labor' | 'ops' | 'admin' | 'params' | 'trace';

/** Nota interna de una pestaña. No sale en el Excel, el PDF ni en las corridas. */
export interface BillingInternalNote {
  id: string;
  tab: BillingInternalTab;
  text: string;
  authorName: string;
  createdAt: string;
}

export const BILLING_INTERNAL_TAB_LABELS: Record<BillingInternalTab, string> = {
  labor: 'Bitácora de Personal',
  ops: 'Bitácora operativa',
  admin: 'Bitácora administrativa',
  params: 'Bitácora de parámetros',
  trace: 'Bitácora de trazabilidad',
};

export interface ClientBillingModel {
  version: 1;
  title: string;
  serviceLabel: string;
  comment: string;
  considerations: string;
  rates: BillingRates;
  workers: BillingWorkerInput[];
  operational: BillingCostLine[];
  administrative: BillingCostLine[];
  /** Inicio del corte del que se leen asistencia y novedades (YYYY-MM-DD). */
  attendanceFrom?: string;
  /** Fin del corte del que se leen asistencia y novedades (YYYY-MM-DD). */
  attendanceTo?: string;
  /** Bitácora interna por pestaña. No se copia a corridas ni al Excel. */
  internalNotes?: BillingInternalNote[];
  /** Fórmulas de las celdas. Si falta una, se usa la de fábrica. */
  formulas?: BillingFormulaSet;
}

export interface AttendanceWindow {
  from: string;
  to: string;
}

export interface ComputedWorker {
  id: string;
  basic: number;
  he25: number;
  he35: number;
  heNight25: number;
  heNight35: number;
  night: number;
  remLlss: number;
  remTotal: number;
  /** Sueldo base de los días de vacaciones que entra en las cargas y no se vuelve a sumar como remuneración. */
  vacationSalary: number;
  vacation: number;
  gratification: number;
  cts: number;
  feria: number;
  essalud: number;
  /** Base usada por EsSalud en porcentaje: REM LLSS + vacaciones + feriados, sin bajar de la RMV. La gratificación no entra. */
  essaludBase: number;
  vidaLey: number;
  sctr: number;
  monthlyCost: number;
  totalCost: number;
}

export interface ComputedCostLine {
  id: string;
  amount: number;
  formula: boolean;
}

export interface BillingComputation {
  workers: ComputedWorker[];
  laborTotal: number;
  operational: ComputedCostLine[];
  operationalTotal: number;
  administrative: ComputedCostLine[];
  adminTotal: number;
  financialAmount: number;
  profitBaseAmount: number;
  profitAmount: number;
  grandTotal: number;
  igvAmount: number;
  totalWithIgv: number;
}

export interface BillingChange {
  label: string;
  before: string;
  after: string;
}

export const DEFAULT_BILLING_RATES: BillingRates = {
  familyAllowanceAmount: 113,
  vacationRate: 1 / 12,
  gratiRate: 0.1667,
  gratiBonusFactor: 1.09,
  ctsRate: 0.0972,
  feriaRate: (1 / 30) * (18 / 12),
  applyFeria: true,
  essaludRate: 0.09,
  essaludMode: 'percent',
  essaludFixedAmount: 0,
  /** RMV vigente desde el 1 de octubre de 2026 (D.S. 015-2026-TR). */
  minimumWage: 1230,
  vidaLeyRate: 0.00396,
  applyVidaLey: true,
  sctrRate: 0.0165,
  applySctr: true,
  he25Factor: 1.25,
  he35Factor: 1.35,
  heDayIncludeFamily: true,
  heNightIncludeFamily: true,
  heNightApplyPremium: true,
  nightPremiumRate: 0.35,
  nightBonusIncludeFamily: false,
  rollOvertimeIntoNightBonus: false,
  commercialMonthDays: 30,
  hoursPerDay: 8,
  financialAnnualRate: 0.2,
  financialDays: 0,
  profitMode: 'margin_on_price',
  profitRate: 0.1,
  profitBase: 'all',
  igvRate: 0.18,
};

export const DEFAULT_CONSIDERATIONS =
  '* Los costos no incluyen IGV.\n* Incluye SCTR y Vida Ley.\n* La asignación familiar aplica solo a quienes tienen hijos menores de 18 años.\n* Alimentación y horas extra se facturan solo si se registran en esta liquidación.';

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const RATE_LABELS: Record<keyof BillingRates, string> = {
  familyAllowanceAmount: 'Monto de asignación familiar',
  vacationRate: 'Tasa de vacaciones',
  gratiRate: 'Tasa de gratificación',
  gratiBonusFactor: 'Factor de bonificación extraordinaria',
  ctsRate: 'Tasa de CTS',
  feriaRate: 'Tasa de feriados',
  applyFeria: 'Incluir feriados',
  essaludRate: 'Tasa de EsSalud',
  essaludMode: 'Forma de EsSalud',
  essaludFixedAmount: 'Monto fijo de EsSalud',
  minimumWage: 'Remuneración mínima vital',
  vidaLeyRate: 'Tasa de Vida Ley',
  applyVidaLey: 'Incluir Vida Ley',
  sctrRate: 'Tasa de SCTR',
  applySctr: 'Incluir SCTR',
  he25Factor: 'Factor hora extra 25%',
  he35Factor: 'Factor hora extra 35%',
  heDayIncludeFamily: 'Asignación familiar en hora extra diurna',
  heNightIncludeFamily: 'Asignación familiar en hora extra nocturna',
  heNightApplyPremium: 'Recargo nocturno en hora extra nocturna',
  nightPremiumRate: 'Porcentaje de bono nocturno',
  nightBonusIncludeFamily: 'Asignación familiar en bono nocturno',
  rollOvertimeIntoNightBonus: 'Acumular horas extra nocturnas en bono nocturno',
  commercialMonthDays: 'Días comerciales del mes',
  hoursPerDay: 'Horas por día',
  financialAnnualRate: 'Tasa anual del costo financiero',
  financialDays: 'Días del costo financiero',
  profitMode: 'Modo de utilidad',
  profitRate: 'Tasa de utilidad',
  profitBase: 'Base de la utilidad',
  igvRate: 'Tasa de IGV',
};

const WORKER_FIELD_LABELS: Record<string, string> = {
  included: 'incluido',
  name: 'nombre',
  position: 'puesto',
  contractualSalary: 'sueldo',
  daysWorked: 'días',
  familyAllowance: 'asignación familiar',
  workCondition: 'condición de trabajo',
  bonus: 'bonos',
  nightShift: 'jornada nocturna',
  he25Hours: 'horas extra diurnas 25%',
  he25Manual: 'monto manual HE diurna 25%',
  he35Hours: 'horas extra diurnas 35%',
  he35Manual: 'monto manual HE diurna 35%',
  heNight25Hours: 'horas extra nocturnas 25%',
  heNight25Manual: 'monto manual HE nocturna 25%',
  heNight35Hours: 'horas extra nocturnas 35%',
  heNight35Manual: 'monto manual HE nocturna 35%',
  nightHours: 'horas de bono nocturno',
  nightManual: 'monto manual de bono nocturno',
  socialBaseManual: 'base de cargas manual',
  socialBase: 'base EsSalud',
  factor: 'factor',
  calendarDays: 'días del corte',
  absenceDays: 'faltas descontadas',
  absenceDetail: 'detalle de faltas',
  startDate: 'fecha de inicio',
  endDate: 'fecha de cese',
  daysManual: 'días editados a mano',
  vacationDays: 'días de vacaciones',
  notes: 'nota',
};

export function newBillingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function formatPeriodLabel(periodMonth: string): string {
  const [year, month] = periodMonth.split('-');
  const index = Number(month) - 1;
  const name = MONTHS[index] || periodMonth;
  return `${name} ${year || ''}`.trim();
}

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Un corte puede cruzar de un mes a otro; más de dos meses ya no es un periodo de facturación. */
export const MAX_ATTENDANCE_WINDOW_DAYS = 62;

export function currentPeriodMonth(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

export function isIsoDate(value?: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10));
}

export function monthDateBounds(periodMonth: string): AttendanceWindow {
  const [year, month] = periodMonth.split('-').map(Number);
  if (!year || !month) return monthDateBounds(currentPeriodMonth());
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` };
}

export function resolveAttendanceWindow(periodMonth: string, from?: string | null, to?: string | null): AttendanceWindow {
  const bounds = monthDateBounds(periodMonth);
  return {
    from: isIsoDate(from) ? from.slice(0, 10) : bounds.from,
    to: isIsoDate(to) ? to.slice(0, 10) : bounds.to,
  };
}

export function attendanceWindowKey(periodMonth: string, from?: string | null, to?: string | null): string {
  const window = resolveAttendanceWindow(periodMonth, from, to);
  return `${window.from}|${window.to}`;
}

export function inclusiveDayCount(from: string, to: string): number {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end || end < start) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function attendanceWindowError(from: string, to: string): string | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return 'Indique la fecha de inicio y la de fin del corte.';
  if (from.slice(0, 10) > to.slice(0, 10)) return 'La fecha de inicio del corte no puede ser posterior a la de fin.';
  const days = inclusiveDayCount(from, to);
  if (days > MAX_ATTENDANCE_WINDOW_DAYS) {
    return `El corte puede cruzar de un mes a otro, con un máximo de ${MAX_ATTENDANCE_WINDOW_DAYS} días.`;
  }
  return null;
}

export function formatAttendanceDate(iso?: string | null): string {
  if (!isIsoDate(iso)) return '—';
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return `${day} ${SHORT_MONTHS[month - 1] || ''} ${year}`.replace(/\s+/g, ' ').trim();
}

export function formatAttendanceRange(from?: string | null, to?: string | null): string {
  return `${formatAttendanceDate(from)} – ${formatAttendanceDate(to)}`;
}

export function formatBillingDate(iso?: string | null): string {
  if (!isIsoDate(iso)) return '';
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** Activo en la unidad: no archivado y sin estado de cese. */
export function isOpenPersonnelRecord(person: {
  archived?: boolean | null;
  personnel_status?: string | null;
}): boolean {
  const status = (person.personnel_status || '').trim().toLowerCase();
  return person.archived !== true && status !== 'cesado' && status !== 'archivado';
}

/**
 * Entra a la facturación quien sigue sin fecha de cese,
 * y quien tiene cese solo si esa fecha cae dentro del corte (Desde–Hasta, inclusive).
 */
export function includePersonnelInBilling(
  person: {
    archived?: boolean | null;
    personnel_status?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  },
  window: AttendanceWindow
): boolean {
  const end = isIsoDate(person.end_date) ? person.end_date.slice(0, 10) : '';
  const from = window.from.slice(0, 10);
  const to = window.to.slice(0, 10);
  if (end) return end >= from && end <= to;
  return isOpenPersonnelRecord(person);
}

/** Quien tiene fecha de cese solo permanece si ese día está dentro del corte. Sin cese, se queda el personal vigente. */
export function workerOverlapsBillingWindow(
  worker: { origin?: string; activeOnUnit?: boolean; startDate?: string | null; endDate?: string | null },
  window: AttendanceWindow
): boolean {
  if (worker.origin === 'manual') return true;
  if (!isIsoDate(window.from) || !isIsoDate(window.to) || window.from.slice(0, 10) > window.to.slice(0, 10)) return true;
  const end = isIsoDate(worker.endDate) ? worker.endDate.slice(0, 10) : '';
  const from = window.from.slice(0, 10);
  const to = window.to.slice(0, 10);
  if (end) return end >= from && end <= to;
  return worker.activeOnUnit !== false;
}

/**
 * Días inclusive desde el Desde del corte hasta el cese.
 * Null si no hay cese dentro del corte (cesó el mismo Hasta o después, o no hay fecha):
 * en ese caso se usa el corte completo.
 */
export function payableDaysUntilCese(window: AttendanceWindow, endDate?: string | null): number | null {
  if (!isIsoDate(endDate) || !isIsoDate(window.from) || !isIsoDate(window.to)) return null;
  const from = window.from.slice(0, 10);
  const to = window.to.slice(0, 10);
  const end = endDate.slice(0, 10);
  if (end < from) return 0;
  if (end >= to) return null;
  return inclusiveDayCount(from, end);
}

export function commercialDaysInPeriod(
  periodMonth: string,
  startDate?: string | null,
  endDate?: string | null,
  status?: string | null
): number {
  return commercialDaysInWindow(monthDateBounds(periodMonth), startDate, endDate, status);
}

/** Días a facturar dentro del corte. Un mes calendario completo sigue en 30 días comerciales. */
export function commercialDaysInWindow(
  window: AttendanceWindow,
  startDate?: string | null,
  endDate?: string | null,
  status?: string | null
): number {
  const rangeStart = parseIsoDate(window.from);
  const rangeEnd = parseIsoDate(window.to);
  if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return 0;

  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (start && start > rangeEnd) return 0;
  if ((status === 'cesado' || status === 'archivado') && end && end < rangeStart) return 0;
  if (status === 'archivado' && !end && !start) return 0;

  let from = rangeStart;
  let to = rangeEnd;
  if (start && start > rangeStart && start <= rangeEnd) from = start;
  if (end && end >= rangeStart && end < rangeEnd) to = end;
  if (to < from) return 0;

  const coversWindow = from.getTime() === rangeStart.getTime() && to.getTime() === rangeEnd.getTime();
  if (coversWindow && isFullCalendarMonth(rangeStart, rangeEnd)) return 30;
  const calendarDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return Math.min(30, Math.max(0, calendarDays));
}

function parseIsoDate(iso?: string | null): Date | null {
  if (!isIsoDate(iso)) return null;
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function isFullCalendarMonth(from: Date, to: Date): boolean {
  if (from.getDate() !== 1) return false;
  if (from.getFullYear() !== to.getFullYear() || from.getMonth() !== to.getMonth()) return false;
  const last = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  return to.getDate() === last;
}

/** Las liquidaciones antiguas no traen el modo y se leen como porcentaje. */
export function usesPercentEssalud(rates: Partial<BillingRates> | undefined): boolean {
  return normalizeBillingRates(rates).essaludMode !== 'fixed';
}

/** Completa factores ausentes en liquidaciones guardadas antes de estas opciones. */
export function normalizeBillingRates(rates: Partial<BillingRates> | undefined): BillingRates {
  const merged: BillingRates = { ...DEFAULT_BILLING_RATES, ...(rates || {}) };
  if (merged.essaludMode !== 'percent' && merged.essaludMode !== 'fixed') {
    merged.essaludMode = 'percent';
  }
  const fixed = Number(merged.essaludFixedAmount);
  merged.essaludFixedAmount = Number.isFinite(fixed) ? fixed : 0;
  const wage = Number(merged.minimumWage);
  merged.minimumWage = Number.isFinite(wage) && wage > 0 ? wage : DEFAULT_BILLING_RATES.minimumWage;
  merged.rollOvertimeIntoNightBonus = merged.rollOvertimeIntoNightBonus === true;
  return merged;
}

export interface OvertimeNightSplit {
  he25: number;
  he35: number;
  heNight25: number;
  heNight35: number;
  night: number;
}

/** Pasa solo las horas extra nocturnas a la columna de bono nocturno. Sirve para mostrar el detalle; no altera el costo. */
export function presentOvertimeInNightBonus(split: OvertimeNightSplit, enabled: boolean): OvertimeNightSplit {
  const he25 = num(split.he25);
  const he35 = num(split.he35);
  const heNight25 = num(split.heNight25);
  const heNight35 = num(split.heNight35);
  const night = num(split.night);
  if (!enabled) return { he25, he35, heNight25, heNight35, night };
  return {
    he25,
    he35,
    heNight25: 0,
    heNight35: 0,
    night: night + heNight25 + heNight35,
  };
}

export function withWorkerDefaults(worker: BillingWorkerInput): BillingWorkerInput {
  return {
    ...worker,
    nightShift: Boolean(worker.nightShift),
    heNight25Hours: num(worker.heNight25Hours),
    heNight25Manual: manualOrNull(worker.heNight25Manual),
    heNight35Hours: num(worker.heNight35Hours),
    heNight35Manual: manualOrNull(worker.heNight35Manual),
    vacationDays: Math.max(0, num(worker.vacationDays)),
  };
}

function manualOrNull(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

export function computeWorker(worker: BillingWorkerInput, inputRates: BillingRates, formulas?: BillingFormulaSet): ComputedWorker {
  const rates = normalizeBillingRates(inputRates);
  const values = workerFormulaValues(worker, rates, formulas);
  const basic = values.basico;
  const he25 = values.he25;
  const he35 = values.he35;
  const heNight25 = values.heNoche25;
  const heNight35 = values.heNoche35;
  const night = values.bonoNocturno;
  const vacationSalary = values.sueldoVacaciones;
  const remLlss = values.remCargas;
  const remTotal = values.remTotal;
  const vacationBase = values.vacaciones;
  const gratificationBase = values.gratificacion;
  const ctsBase = values.cts;
  const feriaBase = values.feriado;
  const essaludBase = values.baseEssalud;
  const essaludBaseAmount = values.essalud;
  const vidaLeyBase = values.vidaLey;
  const sctrBase = values.sctr;
  // El adicional se suma a esa celda y al costo. No vuelve a entrar en las otras fórmulas.
  return {
    id: worker.id,
    basic: basic + adjustmentAmount(worker, 'basic'),
    he25: he25 + adjustmentAmount(worker, 'he25'),
    he35: he35 + adjustmentAmount(worker, 'he35'),
    heNight25: heNight25 + adjustmentAmount(worker, 'heNight25'),
    heNight35: heNight35 + adjustmentAmount(worker, 'heNight35'),
    night: night + adjustmentAmount(worker, 'night'),
    remLlss,
    remTotal,
    vacationSalary,
    vacation: vacationBase + adjustmentAmount(worker, 'vacation'),
    gratification: gratificationBase + adjustmentAmount(worker, 'gratification'),
    cts: ctsBase + adjustmentAmount(worker, 'cts'),
    feria: feriaBase + adjustmentAmount(worker, 'feria'),
    essalud: essaludBaseAmount + adjustmentAmount(worker, 'essalud'),
    essaludBase,
    vidaLey: vidaLeyBase + adjustmentAmount(worker, 'vidaLey'),
    sctr: sctrBase + adjustmentAmount(worker, 'sctr'),
    monthlyCost: values.costoMes,
    totalCost: values.costoTotal,
  };
}

function workerFormulaValues(worker: BillingWorkerInput, rates: BillingRates, formulas?: BillingFormulaSet): Record<string, number> {
  const scope = workerFormulaScope(worker, rates);
  try {
    return evaluateFormulas(formulas, scope, WORKER_FORMULA_IDS);
  } catch {
    return evaluateFormulas(undefined, scope, WORKER_FORMULA_IDS);
  }
}

export const WORKER_INPUT_IDS = [
  'sueldo',
  'dias',
  'diasVacaciones',
  'asignacion',
  'condicionTrabajo',
  'bonos',
  'factor',
  'he25Horas',
  'he25Manual',
  'he25ManualActivo',
  'he35Horas',
  'he35Manual',
  'he35ManualActivo',
  'heNoche25Horas',
  'heNoche25Manual',
  'heNoche25ManualActivo',
  'heNoche35Horas',
  'heNoche35Manual',
  'heNoche35ManualActivo',
  'bonoHoras',
  'bonoManual',
  'bonoManualActivo',
  'ajusteBasico',
  'ajusteHe25',
  'ajusteHe35',
  'ajusteHeNoche25',
  'ajusteHeNoche35',
  'ajusteBono',
  'ajusteVacaciones',
  'ajusteGratificacion',
  'ajusteCts',
  'ajusteFeriado',
  'ajusteEssalud',
  'ajusteVidaLey',
  'ajusteSctr',
] as const;

export type WorkerInputId = (typeof WORKER_INPUT_IDS)[number];

export const BILLING_RATE_IDS = [
  'diasMes',
  'horasDia',
  'factorHe25',
  'factorHe35',
  'recargoNocturno',
  'heDiaConAsignacion',
  'heNocheConAsignacion',
  'heNocheConRecargo',
  'bonoConAsignacion',
  'tasaVacaciones',
  'tasaGratificacion',
  'factorBonificacion',
  'tasaCts',
  'tasaFeriado',
  'aplicaFeriado',
  'tasaEssalud',
  'essaludFijo',
  'montoEssalud',
  'rmv',
  'tasaVidaLey',
  'aplicaVidaLey',
  'tasaSctr',
  'aplicaSctr',
  'tasaFinanciera',
  'diasFinanciados',
  'utilidadSoloLaboral',
  'margenSobrePrecio',
  'tasaUtilidad',
  'tasaIgv',
] as const;

export type BillingRateId = (typeof BILLING_RATE_IDS)[number];

/** Datos de una fila de personal. Son los mismos que usa el cálculo. */
export function workerInputValues(worker: BillingWorkerInput): Record<WorkerInputId, number> {
  const manual = (value: number | null | undefined) => (value !== null && value !== undefined && Number.isFinite(value) ? value : 0);
  const active = (value: number | null | undefined) => (value !== null && value !== undefined && Number.isFinite(value) ? 1 : 0);
  return {
    sueldo: num(worker.contractualSalary),
    dias: num(worker.daysWorked),
    diasVacaciones: Math.max(0, num(worker.vacationDays)),
    asignacion: num(worker.familyAllowance),
    condicionTrabajo: num(worker.workCondition),
    bonos: num(worker.bonus),
    factor: num(worker.factor),
    he25Horas: num(worker.he25Hours),
    he25Manual: manual(worker.he25Manual),
    he25ManualActivo: active(worker.he25Manual),
    he35Horas: num(worker.he35Hours),
    he35Manual: manual(worker.he35Manual),
    he35ManualActivo: active(worker.he35Manual),
    heNoche25Horas: num(worker.heNight25Hours),
    heNoche25Manual: manual(worker.heNight25Manual),
    heNoche25ManualActivo: active(worker.heNight25Manual),
    heNoche35Horas: num(worker.heNight35Hours),
    heNoche35Manual: manual(worker.heNight35Manual),
    heNoche35ManualActivo: active(worker.heNight35Manual),
    bonoHoras: num(worker.nightHours),
    bonoManual: manual(worker.nightManual),
    bonoManualActivo: active(worker.nightManual),
    ajusteBasico: adjustmentAmount(worker, 'basic'),
    ajusteHe25: adjustmentAmount(worker, 'he25'),
    ajusteHe35: adjustmentAmount(worker, 'he35'),
    ajusteHeNoche25: adjustmentAmount(worker, 'heNight25'),
    ajusteHeNoche35: adjustmentAmount(worker, 'heNight35'),
    ajusteBono: adjustmentAmount(worker, 'night'),
    ajusteVacaciones: adjustmentAmount(worker, 'vacation'),
    ajusteGratificacion: adjustmentAmount(worker, 'gratification'),
    ajusteCts: adjustmentAmount(worker, 'cts'),
    ajusteFeriado: adjustmentAmount(worker, 'feria'),
    ajusteEssalud: adjustmentAmount(worker, 'essalud'),
    ajusteVidaLey: adjustmentAmount(worker, 'vidaLey'),
    ajusteSctr: adjustmentAmount(worker, 'sctr'),
  };
}

/** Tasas y opciones de la liquidación. 1 es sí y 0 es no. */
export function billingRateValues(rates: Partial<BillingRates> | undefined): Record<BillingRateId, number> {
  const normalized = normalizeBillingRates(rates);
  const flag = (value: boolean) => (value ? 1 : 0);
  return {
    diasMes: normalized.commercialMonthDays || 30,
    horasDia: normalized.hoursPerDay || 8,
    factorHe25: num(normalized.he25Factor),
    factorHe35: num(normalized.he35Factor),
    recargoNocturno: num(normalized.nightPremiumRate),
    heDiaConAsignacion: flag(normalized.heDayIncludeFamily),
    heNocheConAsignacion: flag(normalized.heNightIncludeFamily),
    heNocheConRecargo: flag(normalized.heNightApplyPremium),
    bonoConAsignacion: flag(normalized.nightBonusIncludeFamily),
    tasaVacaciones: num(normalized.vacationRate),
    tasaGratificacion: num(normalized.gratiRate),
    factorBonificacion: num(normalized.gratiBonusFactor),
    tasaCts: num(normalized.ctsRate),
    tasaFeriado: num(normalized.feriaRate),
    aplicaFeriado: flag(normalized.applyFeria),
    tasaEssalud: num(normalized.essaludRate),
    essaludFijo: normalized.essaludMode === 'fixed' ? 1 : 0,
    montoEssalud: num(normalized.essaludFixedAmount),
    rmv: num(normalized.minimumWage),
    tasaVidaLey: num(normalized.vidaLeyRate),
    aplicaVidaLey: flag(normalized.applyVidaLey),
    tasaSctr: num(normalized.sctrRate),
    aplicaSctr: flag(normalized.applySctr),
    tasaFinanciera: num(normalized.financialAnnualRate),
    diasFinanciados: num(normalized.financialDays),
    utilidadSoloLaboral: normalized.profitBase === 'labor' ? 1 : 0,
    margenSobrePrecio: normalized.profitMode === 'margin_on_price' ? 1 : 0,
    tasaUtilidad: num(normalized.profitRate),
    tasaIgv: num(normalized.igvRate),
  };
}

function workerFormulaScope(worker: BillingWorkerInput, rates: BillingRates): Record<string, number> {
  return { ...workerInputValues(worker), ...billingRateValues(rates) };
}

export function computeBilling(model: ClientBillingModel): BillingComputation {
  const rates = normalizeBillingRates(model.rates);
  const workers = model.workers.map((worker) => computeWorker(worker, rates, model.formulas));
  const included = new Set(model.workers.filter((worker) => worker.included).map((worker) => worker.id));
  const laborTotal = workers.reduce((sum, worker) => (included.has(worker.id) ? sum + worker.totalCost : sum), 0);

  const operational = model.operational.map((line) => ({ id: line.id, amount: num(line.amount), formula: false }));
  const operationalTotal = operational.reduce((sum, line) => sum + line.amount, 0);

  const billingScope: Record<string, number> = {
    costoLaboral: laborTotal,
    costoOperativo: operationalTotal,
    costoAdministrativo: 0,
    tasaFinanciera: num(rates.financialAnnualRate),
    diasFinanciados: num(rates.financialDays),
    utilidadSoloLaboral: rates.profitBase === 'labor' ? 1 : 0,
    margenSobrePrecio: rates.profitMode === 'margin_on_price' ? 1 : 0,
    tasaUtilidad: num(rates.profitRate),
    tasaIgv: num(rates.igvRate),
  };
  const financialAmount = billingFormula(model.formulas, billingScope, 'financiero');

  const administrative = model.administrative.map((line) => {
    if (line.kind === 'financiero' && line.formulaLocked) {
      return { id: line.id, amount: financialAmount, formula: true };
    }
    return { id: line.id, amount: num(line.amount), formula: false };
  });
  const adminTotal = administrative.reduce((sum, line) => sum + line.amount, 0);
  billingScope.costoAdministrativo = adminTotal;
  const profitBaseAmount = billingFormula(model.formulas, billingScope, 'baseUtilidad');
  const profitAmount = billingFormula(model.formulas, billingScope, 'utilidad');
  const grandTotal = laborTotal + operationalTotal + adminTotal + profitAmount;
  const igvAmount = billingFormula(model.formulas, billingScope, 'igv');
  return {
    workers,
    laborTotal,
    operational,
    operationalTotal,
    administrative,
    adminTotal,
    financialAmount,
    profitBaseAmount,
    profitAmount,
    grandTotal,
    igvAmount,
    totalWithIgv: grandTotal + igvAmount,
  };
}

function billingFormula(formulas: BillingFormulaSet | undefined, scope: Record<string, number>, id: string): number {
  try {
    return evaluateFormulas(formulas, scope, [id])[id] || 0;
  } catch {
    return evaluateFormulas(undefined, scope, [id])[id] || 0;
  }
}

export function profitOf(base: number, mode: ProfitMode, rate: number): number {
  const safeRate = num(rate);
  if (base <= 0 || safeRate <= 0) return 0;
  if (mode === 'margin_on_price') {
    const bounded = Math.min(safeRate, 0.95);
    return (base / (1 - bounded)) * bounded;
  }
  return base * safeRate;
}

export function defaultAdministrativeLines(): BillingCostLine[] {
  return [
    {
      id: newBillingId(),
      kind: 'financiero',
      description: 'Costo financiero',
      amount: 0,
      formulaLocked: true,
      note: '(costo laboral + costo operativo) × (tasa anual / 365) × días',
    },
    {
      id: newBillingId(),
      kind: 'gestion_rrhh',
      description: 'Gestión de recurso humano',
      amount: 0,
    },
  ];
}

export function emptyBillingModel(title: string, serviceLabel: string, rates: BillingRates = DEFAULT_BILLING_RATES): ClientBillingModel {
  return {
    version: 1,
    title,
    serviceLabel,
    comment: '',
    considerations: DEFAULT_CONSIDERATIONS,
    rates: { ...rates },
    workers: [],
    operational: [],
    administrative: defaultAdministrativeLines(),
    internalNotes: [],
  };
}

export function cloneModel(model: ClientBillingModel): ClientBillingModel {
  return JSON.parse(JSON.stringify(model)) as ClientBillingModel;
}

const SUGGESTED_FIELDS: (keyof BillingWorkerSuggestion)[] = [
  'contractualSalary',
  'daysWorked',
  'familyAllowance',
  'workCondition',
  'bonus',
];

export function workerAdjustmentLabels(worker: BillingWorkerInput): string[] {
  const labels: string[] = [];
  if (worker.suggested) {
    if (!worker.included) labels.push('excluido');
    for (const field of SUGGESTED_FIELDS) {
      if (!sameNumber(worker[field], worker.suggested[field])) {
        labels.push(WORKER_FIELD_LABELS[field] || field);
      }
    }
    if (num(worker.he25Hours) || worker.he25Manual) labels.push('HE diurna 25%');
    if (num(worker.he35Hours) || worker.he35Manual) labels.push('HE diurna 35%');
    if (num(worker.heNight25Hours) || worker.heNight25Manual) labels.push('HE nocturna 25%');
    if (num(worker.heNight35Hours) || worker.heNight35Manual) labels.push('HE nocturna 35%');
    if (num(worker.nightHours) || worker.nightManual) labels.push('bono nocturno');
    if (!sameNumber(worker.factor, 1)) labels.push('factor');
  }
  (Object.keys(BILLING_ADJUSTMENT_LABELS) as BillingAdjustmentKey[]).forEach((field) => {
    if (adjustmentAmount(worker, field)) labels.push(`adicional ${BILLING_ADJUSTMENT_LABELS[field]}`);
  });
  return labels;
}

export function diffBillingModels(before: ClientBillingModel, after: ClientBillingModel): BillingChange[] {
  const changes: BillingChange[] = [];
  const push = (label: string, prev: unknown, next: unknown) => {
    const a = displayValue(prev);
    const b = displayValue(next);
    if (a !== b) changes.push({ label, before: a, after: b });
  };

  push('Título', before.title, after.title);
  push('Servicio', before.serviceLabel, after.serviceLabel);
  push('Comentario', before.comment, after.comment);
  push('Consideraciones', before.considerations, after.considerations);
  push('Inicio del corte de asistencia', formatAttendanceDate(before.attendanceFrom), formatAttendanceDate(after.attendanceFrom));
  push('Fin del corte de asistencia', formatAttendanceDate(before.attendanceTo), formatAttendanceDate(after.attendanceTo));

  (Object.keys(RATE_LABELS) as (keyof BillingRates)[]).forEach((key) => {
    push(RATE_LABELS[key], before.rates[key], after.rates[key]);
  });

  const beforeFormulas = normalizeBillingFormulas(before.formulas);
  const afterFormulas = normalizeBillingFormulas(after.formulas);
  BILLING_FORMULA_DEFS.forEach((item) => {
    push(`Fórmula de ${item.label}`, beforeFormulas[item.id], afterFormulas[item.id]);
  });

  const beforeWorkers = new Map(before.workers.map((worker) => [worker.id, worker]));
  const afterWorkers = new Map(after.workers.map((worker) => [worker.id, worker]));
  after.workers.forEach((worker) => {
    const prev = beforeWorkers.get(worker.id);
    if (!prev) {
      changes.push({
        label: `Personal agregado: ${worker.name || 'Sin nombre'}`,
        before: '—',
        after: worker.included ? 'Incluido' : 'Agregado y excluido',
      });
      return;
    }
    Object.keys(WORKER_FIELD_LABELS).forEach((field) => {
      const key = field as keyof BillingWorkerInput;
      push(`${worker.name || 'Trabajador'} · ${WORKER_FIELD_LABELS[field]}`, prev[key], worker[key]);
    });
    (Object.keys(BILLING_ADJUSTMENT_LABELS) as BillingAdjustmentKey[]).forEach((field) => {
      push(
        `${worker.name || 'Trabajador'} · Adicional ${BILLING_ADJUSTMENT_LABELS[field]}`,
        formatAdjustment(prev.adjustments?.[field]),
        formatAdjustment(worker.adjustments?.[field])
      );
    });
  });
  before.workers.forEach((worker) => {
    if (!afterWorkers.has(worker.id)) {
      changes.push({ label: `Personal quitado: ${worker.name || 'Sin nombre'}`, before: 'En la liquidación', after: 'Eliminado' });
    }
  });

  diffLines(changes, 'Operativo', before.operational, after.operational);
  diffLines(changes, 'Administrativo', before.administrative, after.administrative);
  (Object.keys(BILLING_INTERNAL_TAB_LABELS) as BillingInternalTab[]).forEach((tab) => {
    push(BILLING_INTERNAL_TAB_LABELS[tab], internalNoteLog(before.internalNotes, tab), internalNoteLog(after.internalNotes, tab));
  });
  return changes;
}

function formatAdjustment(item: BillingCellAdjustment | undefined): string {
  if (!item) return '';
  const reason = String(item.reason || '').trim();
  const amount = Number(item.amount);
  if (!reason || !Number.isFinite(amount) || amount === 0) return '';
  const who = item.authorName ? ` · ${item.authorName}` : '';
  return `${amount}${who}: ${reason}`;
}

function internalNoteLog(notes: BillingInternalNote[] | undefined, tab: BillingInternalTab): string {
  return (notes || [])
    .filter((note) => note.tab === tab)
    .map((note) => `${note.createdAt.slice(0, 16)} · ${note.authorName}: ${note.text.trim()}`)
    .join('\n');
}

/** La corrida guarda el cálculo. La bitácora se queda solo en la liquidación. */
export function modelWithoutInternalNotes(model: ClientBillingModel): ClientBillingModel {
  const copy = cloneModel(model);
  delete copy.internalNotes;
  return copy;
}

function diffLines(changes: BillingChange[], group: string, before: BillingCostLine[], after: BillingCostLine[]) {
  const prevMap = new Map(before.map((line) => [line.id, line]));
  const nextMap = new Map(after.map((line) => [line.id, line]));
  after.forEach((line) => {
    const prev = prevMap.get(line.id);
    const name = line.description || 'Ítem';
    if (!prev) {
      changes.push({ label: `${group} agregado: ${name}`, before: '—', after: displayValue(line.amount) });
      return;
    }
    if (prev.description !== line.description) {
      changes.push({ label: `${group}: descripción`, before: prev.description || '—', after: line.description || '—' });
    }
    if (!sameNumber(prev.amount, line.amount)) {
      changes.push({
        label: `${group}: ${name}`,
        before: displayValue(prev.amount),
        after: displayValue(line.amount),
      });
    }
    if (Boolean(prev.formulaLocked) !== Boolean(line.formulaLocked)) {
      changes.push({
        label: `${group}: ${name} · cálculo`,
        before: prev.formulaLocked ? 'Fórmula' : 'Manual',
        after: line.formulaLocked ? 'Fórmula' : 'Manual',
      });
    }
  });
  before.forEach((line) => {
    if (!nextMap.has(line.id)) {
      changes.push({ label: `${group} eliminado: ${line.description || 'Ítem'}`, before: displayValue(line.amount), after: 'Eliminado' });
    }
  });
}

export interface BillingMoneySnapshot {
  laborTotal: number;
  operationalTotal: number;
  adminTotal: number;
  profitTotal: number;
  grandTotal: number;
  igvAmount: number;
  totalWithIgv: number;
}

export interface BillingDifferenceLine {
  key: 'labor' | 'operational' | 'admin' | 'profit' | 'grand' | 'igv' | 'withIgv';
  label: string;
  source: number;
  base: number;
  difference: number;
}

const DIFFERENCE_FIELDS: { key: BillingDifferenceLine['key']; label: string; field: keyof BillingMoneySnapshot }[] = [
  { key: 'labor', label: 'Costo laboral', field: 'laborTotal' },
  { key: 'operational', label: 'Costo operativo', field: 'operationalTotal' },
  { key: 'admin', label: 'Gastos administrativos', field: 'adminTotal' },
  { key: 'profit', label: 'Utilidad', field: 'profitTotal' },
  { key: 'grand', label: 'Total sin IGV', field: 'grandTotal' },
  { key: 'igv', label: 'IGV', field: 'igvAmount' },
  { key: 'withIgv', label: 'Total con IGV', field: 'totalWithIgv' },
];

/** Totales guardados de una liquidación. El IGV se informa aparte y no entra en el ítem de la nota. */
export function snapshotFromSavedTotals(input: {
  laborTotal: number;
  operationalTotal: number;
  adminTotal: number;
  profitTotal: number;
  grandTotal: number;
  igvRate: number;
}): BillingMoneySnapshot {
  const grandTotal = round2(input.grandTotal);
  const igvAmount = round2(grandTotal * num(input.igvRate));
  return {
    laborTotal: round2(input.laborTotal),
    operationalTotal: round2(input.operationalTotal),
    adminTotal: round2(input.adminTotal),
    profitTotal: round2(input.profitTotal),
    grandTotal,
    igvAmount,
    totalWithIgv: round2(grandTotal + igvAmount),
  };
}

/** Resta el cálculo base del cálculo origen: diferencia = origen − base. */
export function subtractBillingSnapshots(
  source: BillingMoneySnapshot,
  base: BillingMoneySnapshot
): { lines: BillingDifferenceLine[]; signedGrand: number; absoluteGrand: number } {
  const lines = DIFFERENCE_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    source: round2(source[field.field]),
    base: round2(base[field.field]),
    difference: round2(source[field.field] - base[field.field]),
  }));
  const signedGrand = lines.find((line) => line.key === 'grand')?.difference ?? 0;
  return { lines, signedGrand, absoluteGrand: round2(Math.abs(signedGrand)) };
}

/** Si el cálculo nuevo es mayor, lo habitual es debitar; si es menor, acreditar. El usuario puede elegir lo contrario. */
export function suggestedNoteKind(signedGrand: number): 'credit' | 'debit' | null {
  if (signedGrand > 0.004) return 'debit';
  if (signedGrand < -0.004) return 'credit';
  return null;
}

export function defaultAdjustmentDescription(
  source: { periodMonth: string; unitName: string },
  base: { periodMonth: string; unitName: string }
): string {
  if (source.unitName === base.unitName) {
    return `Diferencia entre ${formatPeriodLabel(source.periodMonth)} y ${formatPeriodLabel(base.periodMonth)} · ${source.unitName}`;
  }
  return `Diferencia entre ${formatPeriodLabel(source.periodMonth)} (${source.unitName}) y ${formatPeriodLabel(base.periodMonth)} (${base.unitName})`;
}

export function pen(value: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function round2(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sameNumber(a: unknown, b: unknown): boolean {
  return Math.abs(num(a) - num(b)) < 0.0001;
}

function displayValue(value: unknown): string {
  if (typeof value === 'number') {
    return value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (value === null || value === undefined || value === '') return '—';
  if (value === 'margin_on_price') return 'Margen sobre el precio';
  if (value === 'markup_on_cost') return 'Margen sobre el costo';
  if (value === 'all') return 'Laboral + operativo + administrativo';
  if (value === 'labor') return 'Solo costo laboral';
  if (value === 'percent') return 'Porcentaje';
  if (value === 'fixed') return 'Monto fijo';
  return String(value);
}
