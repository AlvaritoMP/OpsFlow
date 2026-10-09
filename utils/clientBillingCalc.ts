/** Cálculo de facturación de intermediación / tercerización.
 * Réplica del método del archivo de facturación (Estación Callao, abril):
 * costo laboral con cargas, operativo, administrativo y utilidad.
 */

export type ProfitMode = 'margin_on_price' | 'markup_on_cost';
export type ProfitBase = 'all' | 'labor';

export interface BillingRates {
  familyAllowanceAmount: number;
  vacationRate: number;
  gratiRate: number;
  gratiBonusFactor: number;
  ctsRate: number;
  feriaRate: number;
  applyFeria: boolean;
  essaludRate: number;
  vidaLeyRate: number;
  applyVidaLey: boolean;
  sctrRate: number;
  applySctr: boolean;
  he25Factor: number;
  he35Factor: number;
  nightPremiumRate: number;
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
  he25Hours: number;
  he25Manual: number | null;
  he35Hours: number;
  he35Manual: number | null;
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
  notes?: string;
  suggested?: BillingWorkerSuggestion;
}

export interface BillingCostLine {
  id: string;
  kind: string;
  description: string;
  amount: number;
  formulaLocked?: boolean;
  note?: string;
}

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
  night: number;
  remLlss: number;
  remTotal: number;
  vacation: number;
  gratification: number;
  cts: number;
  feria: number;
  essalud: number;
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
  applyFeria: false,
  essaludRate: 0.09,
  vidaLeyRate: 0.00396,
  applyVidaLey: true,
  sctrRate: 0.0165,
  applySctr: true,
  he25Factor: 1.25,
  he35Factor: 1.35,
  nightPremiumRate: 0.35,
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
  vidaLeyRate: 'Tasa de Vida Ley',
  applyVidaLey: 'Incluir Vida Ley',
  sctrRate: 'Tasa de SCTR',
  applySctr: 'Incluir SCTR',
  he25Factor: 'Factor hora extra 25%',
  he35Factor: 'Factor hora extra 35%',
  nightPremiumRate: 'Porcentaje de bono nocturno',
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
  he25Hours: 'horas extra 25%',
  he25Manual: 'monto manual HE 25%',
  he35Hours: 'horas extra 35%',
  he35Manual: 'monto manual HE 35%',
  nightHours: 'horas de bono nocturno',
  nightManual: 'monto manual de bono nocturno',
  socialBaseManual: 'base de cargas manual',
  socialBase: 'base EsSalud/SCTR',
  factor: 'factor',
  calendarDays: 'días del corte',
  absenceDays: 'faltas descontadas',
  absenceDetail: 'detalle de faltas',
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

function hourly(salary: number, rates: BillingRates): number {
  const days = rates.commercialMonthDays || 30;
  const hours = rates.hoursPerDay || 8;
  return salary / days / hours;
}

function extraAmount(salary: number, hours: number, factor: number, manual: number | null, rates: BillingRates): number {
  if (manual !== null && manual !== undefined && Number.isFinite(manual)) return manual;
  if (!hours) return 0;
  return hourly(salary, rates) * factor * hours;
}

export function computeWorker(worker: BillingWorkerInput, rates: BillingRates): ComputedWorker {
  const salary = num(worker.contractualSalary);
  const days = num(worker.daysWorked);
  const monthDays = rates.commercialMonthDays || 30;
  const basic = monthDays ? (salary / monthDays) * days : 0;
  const family = num(worker.familyAllowance);
  const overtimeBase = salary + family;
  const he25 = extraAmount(overtimeBase, num(worker.he25Hours), rates.he25Factor, worker.he25Manual, rates);
  const he35 = extraAmount(overtimeBase, num(worker.he35Hours), rates.he35Factor, worker.he35Manual, rates);
  const night = extraAmount(salary, num(worker.nightHours), rates.nightPremiumRate, worker.nightManual, rates);
  const remLlss = basic + family + he25 + he35 + night;
  const remTotal = remLlss + num(worker.workCondition) + num(worker.bonus);
  const vacation = remLlss * rates.vacationRate;
  const gratification = remLlss * rates.gratiBonusFactor * rates.gratiRate;
  const cts = remLlss * rates.ctsRate;
  const feria = rates.applyFeria ? remLlss * rates.feriaRate : 0;
  const socialBase = worker.socialBaseManual ? num(worker.socialBase) : salary;
  const essalud = (socialBase + family + gratification + feria) * rates.essaludRate;
  const vidaLey = rates.applyVidaLey ? (remLlss + vacation) * rates.vidaLeyRate : 0;
  const sctr = rates.applySctr ? (socialBase + gratification) * rates.sctrRate : 0;
  const monthlyCost = remTotal + vacation + gratification + cts + feria + essalud + vidaLey + sctr;
  const factor = num(worker.factor) || 0;
  return {
    id: worker.id,
    basic,
    he25,
    he35,
    night,
    remLlss,
    remTotal,
    vacation,
    gratification,
    cts,
    feria,
    essalud,
    vidaLey,
    sctr,
    monthlyCost,
    totalCost: monthlyCost * (factor || 0),
  };
}

export function computeBilling(model: ClientBillingModel): BillingComputation {
  const rates = model.rates;
  const workers = model.workers.map((worker) => computeWorker(worker, rates));
  const included = new Set(model.workers.filter((worker) => worker.included).map((worker) => worker.id));
  const laborTotal = workers.reduce((sum, worker) => (included.has(worker.id) ? sum + worker.totalCost : sum), 0);

  const operational = model.operational.map((line) => ({ id: line.id, amount: num(line.amount), formula: false }));
  const operationalTotal = operational.reduce((sum, line) => sum + line.amount, 0);

  const financialAmount =
    (laborTotal + operationalTotal) * (num(rates.financialAnnualRate) / 365) * num(rates.financialDays);

  const administrative = model.administrative.map((line) => {
    if (line.kind === 'financiero' && line.formulaLocked) {
      return { id: line.id, amount: financialAmount, formula: true };
    }
    return { id: line.id, amount: num(line.amount), formula: false };
  });
  const adminTotal = administrative.reduce((sum, line) => sum + line.amount, 0);
  const profitBaseAmount = rates.profitBase === 'labor' ? laborTotal : laborTotal + operationalTotal + adminTotal;
  const profitAmount = profitOf(profitBaseAmount, rates.profitMode, rates.profitRate);
  const grandTotal = laborTotal + operationalTotal + adminTotal + profitAmount;
  const igvAmount = grandTotal * num(rates.igvRate);
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
  if (!worker.suggested) return [];
  const labels: string[] = [];
  if (!worker.included) labels.push('excluido');
  for (const field of SUGGESTED_FIELDS) {
    if (!sameNumber(worker[field], worker.suggested[field])) {
      labels.push(WORKER_FIELD_LABELS[field] || field);
    }
  }
  if (worker.socialBaseManual && !sameNumber(worker.socialBase, worker.suggested.contractualSalary)) {
    labels.push('base EsSalud/SCTR');
  }
  if (num(worker.he25Hours) || worker.he25Manual) labels.push('HE 25%');
  if (num(worker.he35Hours) || worker.he35Manual) labels.push('HE 35%');
  if (num(worker.nightHours) || worker.nightManual) labels.push('bono nocturno');
  if (!sameNumber(worker.factor, 1)) labels.push('factor');
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
  });
  before.workers.forEach((worker) => {
    if (!afterWorkers.has(worker.id)) {
      changes.push({ label: `Personal quitado: ${worker.name || 'Sin nombre'}`, before: 'En la liquidación', after: 'Eliminado' });
    }
  });

  diffLines(changes, 'Operativo', before.operational, after.operational);
  diffLines(changes, 'Administrativo', before.administrative, after.administrative);
  return changes;
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
  return String(value);
}
