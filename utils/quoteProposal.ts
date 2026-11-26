import {
  BillingComputation,
  BillingCostLine,
  BillingInternalNote,
  BillingInternalTab,
  BillingQuotePosition,
  BillingRates,
  BillingWorkerInput,
  ClientBillingModel,
  ComputedWorker,
  DEFAULT_BILLING_RATES,
  computeBilling,
  cloneModel,
  copyBillingCostLine,
  costLineAmount,
  costLineHasBreakdown,
  defaultAdministrativeLines,
  normalizeAdministrativeLine,
  emptyBillingModel,
  isProjectionBilling,
  newBillingId,
  normalizeBillingRates,
  normalizePartTimeRates,
  round2,
  scheduleMix,
  withWorkerDefaults,
  workerSchedule,
} from './clientBillingCalc';
import { BillingFormulaSet, normalizeBillingFormulas } from './billingFormulas';

/** Puesto a cotizar. Se calcula como una fila de liquidación; el factor son las vacantes. */
export type QuotePosition = BillingWorkerInput & { site?: string };

export interface QuoteClause {
  id: string;
  title: string;
  text: string;
}

/** Datos comerciales que arman los bloques de modalidad, facturación y vigencia. */
export interface QuoteCommercialTerms {
  implementationDays: number;
  currencyName: string;
  currencySymbol: string;
  creditDays: number;
  billingCutoff: string;
  invoiceIssue: string;
  offerValidityDays: number;
}

export interface QuoteProposalPayload {
  version: 1;
  address: string;
  attention: string;
  months: number;
  /** YYYY-MM-DD */
  issueDate: string;
  /** Texto libre: en qué consiste el servicio. */
  serviceScope: string;
  /**
   * En la propuesta, los gastos administrativos salen línea por línea.
   * En false, el anexo muestra solo la suma.
   */
  showAdminDetail: boolean;
  commercialTerms: QuoteCommercialTerms;
  clauses: QuoteClause[];
  notes: string[];
  model: ClientBillingModel;
}

export interface QuoteConceptRow {
  key: string;
  label: string;
  group: 'remuneracion' | 'provisiones' | 'aportes';
  emphasize?: 'sub' | 'final';
  /** La cantidad se muestra como número de puestos, no como importe. */
  format?: 'money' | 'count';
  amounts: number[];
  total: number;
}

export interface QuoteSummaryRow {
  item: string;
  quantity: string;
  description: string;
  amount: number;
  kind: 'position' | 'ops' | 'admin' | 'profit';
}

export interface QuotePositionColumn {
  id: string;
  item: string;
  name: string;
  site: string;
  vacancies: number;
  schedule: 'full' | 'part';
  /** Costo laboral de 1 puesto. */
  laborMonth: number;
  /** Costo laboral de 1 puesto multiplicado por la cantidad. */
  laborTotal: number;
}

export interface QuoteView {
  computed: BillingComputation;
  positions: QuotePositionColumn[];
  concepts: QuoteConceptRow[];
  summary: QuoteSummaryRow[];
  periodWithIgv: number;
  periodNet: number;
  periodIgv: number;
}

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

export function quoteMoney(value: number): string {
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(value));
}

/** Cantidad o frecuencia, sin forzar dos decimales. */
export function quoteCount(value: number): string {
  const parsed = Number(value);
  return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 4 }).format(Number.isFinite(parsed) ? parsed : 0);
}

export function formatRatePercent(rate: number): string {
  const percent = Math.round((Number(rate) || 0) * 10000) / 100;
  return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(percent);
}

export function formatQuoteDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1] || match[2];
  return `Lima, ${Number(match[3])} de ${month} de ${match[1]}`;
}

export function fillQuoteTokens(text: string, months: number, igvPercent: string): string {
  return text.replaceAll('{meses}', String(months)).replaceAll('{igv}', igvPercent);
}

export function nextQuoteCode(existing: string[], date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PES-${stamp}-`;
  let next = 1;
  existing.forEach((code) => {
    if (!code.startsWith(prefix)) return;
    const seq = Number(code.slice(prefix.length));
    if (Number.isFinite(seq) && seq >= next) next = seq + 1;
  });
  return `${prefix}${String(next).padStart(2, '0')}`;
}

export function defaultCommercialTerms(): QuoteCommercialTerms {
  return {
    implementationDays: 7,
    currencyName: 'Soles',
    currencySymbol: 'S/',
    creditDays: 30,
    billingCutoff: 'el último día de cada mes',
    invoiceIssue: 'los primeros días del mes siguiente',
    offerValidityDays: 15,
  };
}

export function defaultQuoteClauses(): QuoteClause[] {
  const items: Array<[string, string]> = [
    ['Firma contractual', 'Para el inicio del servicio se requerirá tener el contrato de servicio previamente firmado por ambas partes.'],
    ['Supervisión', 'Esta propuesta incluye supervisión directa al personal por parte del equipo especializado de Opalo.'],
    ['Selección y reemplazos', 'Se incluye el servicio de reclutamiento y selección cuando haya que reponer personal o incorporar nuevas posiciones.'],
    [
      'Facturación adicional',
      'Los conceptos no considerados se refacturan al cliente con un recargo del 10%. Las horas adicionales requieren autorización previa y se liquidan según el tareo mensual aprobado.',
    ],
    ['Absorción de personal', 'Es factible absorber al personal actual, previa coordinación y evaluación con el colaborador.'],
    [
      'Seguridad y beneficios',
      'Incluye póliza de responsabilidad civil, sistema de gestión de SST y aguinaldos corporativos a cargo de Opalo, salvo que una condición de esta propuesta indique lo contrario.',
    ],
  ];
  return items.map(([title, text]) => ({ id: newBillingId(), title, text }));
}

export function defaultQuoteNotes(): string[] {
  return [
    'Los montos consignados en el presente anexo no incluyen el Impuesto General a las Ventas (IGV {igv}%).',
    'La asignación familiar aplica conforme a la Ley N° 25129 para colaboradores con carga familiar acreditada. En esta propuesta solo está cargada en los puestos que la incluyen.',
    'Las provisiones laborales (gratificación y bonificación extraordinaria de la Ley N.° 30334, CTS y vacaciones) y los aportes y seguros de ley (EsSalud, SCTR salud y pensión, y Vida Ley) se calculan con el mismo método de una liquidación.',
    'Si la propuesta combina puestos full time y part time, las cargas del part time salen de los parámetros de ajuste de esa jornada. La jornada completa sigue con las tasas generales.',
    'Cada columna es el costo de 1 puesto. La cantidad se aplica solo en la línea de costo laboral total. Los costos operativos, los gastos administrativos y la utilidad se calculan sobre ese total, igual que en una liquidación, y no se prorratean dentro del sueldo.',
    'No se incluyen alimentación ni horas extraordinarias no programadas. Esas horas se liquidan con autorización previa del cliente.',
  ];
}

export function emptyQuotePosition(name: string, rates: BillingRates = DEFAULT_BILLING_RATES): QuotePosition {
  const days = rates.commercialMonthDays || 30;
  return {
    id: newBillingId(),
    name,
    position: name,
    site: '',
    included: true,
    origin: 'manual',
    contractualSalary: 0,
    daysWorked: days,
    familyAllowance: 0,
    workCondition: 0,
    bonus: 0,
    he25Hours: 0,
    he25Manual: null,
    he35Hours: 0,
    he35Manual: null,
    heNight25Hours: 0,
    heNight25Manual: null,
    heNight35Hours: 0,
    heNight35Manual: null,
    nightHours: 0,
    nightManual: null,
    socialBaseManual: false,
    socialBase: 0,
    factor: 1,
    daysManual: true,
    vacationDays: 0,
    schedule: 'full',
  };
}

/** Copia puestos, cargas, costos y condiciones. La nueva queda como borrador, con otros identificadores y la fecha que se indique. */
export function cloneQuotePayload(source: QuoteProposalPayload, issueDate?: string): QuoteProposalPayload {
  const normalized = normalizeQuotePayload(source);
  const model = cloneModel(normalized.model);
  model.workers = (model.workers || []).map((worker) => ({ ...worker, id: newBillingId() }));
  model.operational = (model.operational || []).map((line) => copyBillingCostLine(line));
  model.administrative = (model.administrative || []).map((line) => copyBillingCostLine(line));
  model.internalNotes = (model.internalNotes || []).map((note) => ({ ...note, id: newBillingId() }));
  model.sourceQuoteId = undefined;
  model.sourceQuoteCode = undefined;
  model.sourceQuotePositions = undefined;
  model.opalosisRegistration = undefined;
  model.billingKind = undefined;
  const date = issueDate && /^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? issueDate : new Date().toISOString().slice(0, 10);
  return {
    ...normalized,
    issueDate: date,
    clauses: normalized.clauses.map((clause) => ({ ...clause, id: newBillingId() })),
    model,
  };
}

export function createEmptyQuote(input: {
  clientName?: string;
  serviceName: string;
  address?: string;
  attention?: string;
  months?: number;
  issueDate?: string;
  formulas?: BillingFormulaSet | null;
}): QuoteProposalPayload {
  const serviceName = input.serviceName.trim() || 'Servicio';
  const model = emptyBillingModel('PROPUESTA TÉCNICO ECONÓMICA DE SERVICIOS', serviceName);
  model.formulas = normalizeBillingFormulas(input.formulas || undefined);
  model.workers = [emptyQuotePosition('Puesto 1', model.rates)];
  model.comment = '';
  model.considerations = '';
  return {
    version: 1,
    address: input.address?.trim() || '',
    attention: input.attention?.trim() || '',
    months: Math.max(1, Math.round(Number(input.months) || 1)),
    issueDate: input.issueDate || new Date().toISOString().slice(0, 10),
    serviceScope: '',
    showAdminDetail: true,
    commercialTerms: defaultCommercialTerms(),
    clauses: defaultQuoteClauses(),
    notes: defaultQuoteNotes(),
    model,
  };
}

function normalizePosition(raw: Partial<QuotePosition> | null | undefined, rates: BillingRates): QuotePosition {
  const seed = emptyQuotePosition(String(raw?.name || raw?.position || 'Puesto'), rates);
  const merged = withWorkerDefaults({
    ...seed,
    ...(raw || {}),
    id: String(raw?.id || seed.id),
    origin: 'manual',
    included: raw?.included !== false,
  });
  const rawName = String(raw?.name ?? raw?.position ?? seed.name);
  const name = rawName.trim() ? rawName : 'Puesto';
  return {
    ...merged,
    name,
    position: name,
    site: String(raw?.site || ''),
    factor: Math.max(1, Math.round(Number(raw?.factor) || 1)),
    schedule: workerSchedule(raw || {}),
  };
}

export function applyQuoteCommercials(
  model: ClientBillingModel,
  quote: { id: string; code: string; payload: QuoteProposalPayload },
  options?: { keepWorkers?: boolean }
): ClientBillingModel {
  const payload = normalizeQuotePayload(quote.payload);
  const source = payload.model;
  const next = cloneModel(model);
  next.rates = normalizeBillingRates(source.rates);
  next.partTimeRates = source.partTimeRates ? normalizePartTimeRates(source.partTimeRates, next.rates) : undefined;
  next.serviceLabel = source.serviceLabel.trim() || next.serviceLabel;
  next.formulas = source.formulas || next.formulas;
  next.operational = (source.operational || []).map((line) => copyBillingCostLine(line));
  next.administrative = (source.administrative || []).map((line) => copyBillingCostLine(line));
  if (options?.keepWorkers) {
    next.billingKind = 'real';
    next.sourceQuotePositions = snapshotQuotePositions(source);
    next.workers = next.workers.map((worker) => prepareWorkerForQuoteAssignment(worker));
  } else {
    next.workers = quotePositions(source)
      .filter((position) => position.included)
      .map((position) => workerFromQuotePosition(position));
    next.billingKind = 'projection';
    next.sourceQuotePositions = undefined;
  }
  next.sourceQuoteId = quote.id;
  next.sourceQuoteCode = quote.code.trim();
  if (!next.opalosisPesCode?.trim()) next.opalosisPesCode = next.sourceQuoteCode;
  return next;
}

export function snapshotQuotePositions(model: ClientBillingModel): BillingQuotePosition[] {
  return quotePositions(model)
    .filter((position) => position.included)
    .map((position) => ({
      id: position.id,
      name: position.name.trim() || position.position.trim() || 'Puesto',
      site: position.site || '',
      quantity: Math.max(1, Math.round(num(position.factor) || 1)),
      contractualSalary: num(position.contractualSalary),
      familyAllowance: num(position.familyAllowance),
      workCondition: num(position.workCondition),
      bonus: num(position.bonus),
      bonusConcept: position.bonusConcept,
      he25Hours: num(position.he25Hours),
      he25Manual: manualOrNull(position.he25Manual),
      he35Hours: num(position.he35Hours),
      he35Manual: manualOrNull(position.he35Manual),
      heNight25Hours: num(position.heNight25Hours),
      heNight25Manual: manualOrNull(position.heNight25Manual),
      heNight35Hours: num(position.heNight35Hours),
      heNight35Manual: manualOrNull(position.heNight35Manual),
      nightHours: num(position.nightHours),
      nightManual: manualOrNull(position.nightManual),
      socialBaseManual: Boolean(position.socialBaseManual),
      socialBase: num(position.socialBase),
      schedule: workerSchedule(position),
    }));
}

export function quoteCatalogForBilling(
  model: ClientBillingModel,
  quotes: Array<{ id: string; payload: QuoteProposalPayload }>,
  status?: string
): BillingQuotePosition[] {
  if (!model.sourceQuoteId || isProjectionBilling(model)) return [];
  if (model.sourceQuotePositions?.length) return model.sourceQuotePositions;
  if (status && status !== 'draft') return [];
  const quote = quotes.find((item) => item.id === model.sourceQuoteId);
  return quote ? snapshotQuotePositions(normalizeQuotePayload(quote.payload).model) : [];
}

/** Un borrador real ya guardado toma los puestos de su propuesta. No cambia sueldos ni días hasta que se asigne cada persona. */
export function attachDraftQuotePositions(
  model: ClientBillingModel,
  quotes: Array<{ id: string; payload: QuoteProposalPayload }>
): ClientBillingModel | null {
  if (model.billingKind !== 'real' || !model.sourceQuoteId || model.sourceQuotePositions?.length) return null;
  const positions = quoteCatalogForBilling(model, quotes, 'draft');
  if (!positions.length) return null;
  return {
    ...model,
    sourceQuotePositions: positions,
    workers: model.workers.map((worker) => ({
      ...worker,
      unitPosition: worker.unitPosition || worker.position || '',
    })),
  };
}

export function workersMissingQuotePosition(model: ClientBillingModel, catalog: BillingQuotePosition[]): BillingWorkerInput[] {
  if (!catalog.length || isProjectionBilling(model)) return [];
  const ids = new Set(catalog.map((position) => position.id));
  return model.workers.filter((worker) => worker.included && !ids.has(worker.quotePositionId || ''));
}

/** Deja a la persona con su cargo de unidad y sin puesto de propuesta, para que el usuario lo elija. */
export function prepareWorkerForQuoteAssignment(worker: BillingWorkerInput): BillingWorkerInput {
  const cleared = worker.quotePositionId ? clearWorkerQuotePosition(worker) : worker;
  return {
    ...cleared,
    unitPosition: cleared.unitPosition || cleared.position || '',
    quotePositionId: undefined,
  };
}

/** Copia el costo de 1 puesto. Los días, las faltas y la identidad siguen siendo los del corte. */
export function assignWorkerQuotePosition(worker: BillingWorkerInput, position: BillingQuotePosition): BillingWorkerInput {
  const salary = num(position.contractualSalary);
  return {
    ...worker,
    unitPosition: worker.unitPosition || worker.position || '',
    quotePositionId: position.id,
    position: position.name,
    contractualSalary: salary,
    socialBaseManual: position.socialBaseManual,
    socialBase: position.socialBaseManual ? num(position.socialBase) : salary,
    familyAllowance: num(position.familyAllowance),
    workCondition: num(position.workCondition),
    bonus: num(position.bonus),
    bonusConcept: position.bonusConcept,
    he25Hours: num(position.he25Hours),
    he25Manual: manualOrNull(position.he25Manual),
    he35Hours: num(position.he35Hours),
    he35Manual: manualOrNull(position.he35Manual),
    heNight25Hours: num(position.heNight25Hours),
    heNight25Manual: manualOrNull(position.heNight25Manual),
    heNight35Hours: num(position.heNight35Hours),
    heNight35Manual: manualOrNull(position.heNight35Manual),
    nightHours: num(position.nightHours),
    nightManual: manualOrNull(position.nightManual),
    factor: 1,
    schedule: workerSchedule(position),
  };
}

export function clearWorkerQuotePosition(worker: BillingWorkerInput): BillingWorkerInput {
  const unitPosition = worker.unitPosition || worker.position || '';
  const suggested = worker.suggested;
  const salary = suggested ? num(suggested.contractualSalary) : num(worker.contractualSalary);
  return {
    ...worker,
    quotePositionId: undefined,
    unitPosition,
    position: unitPosition,
    contractualSalary: salary,
    socialBaseManual: false,
    socialBase: salary,
    familyAllowance: suggested ? num(suggested.familyAllowance) : num(worker.familyAllowance),
    workCondition: suggested ? num(suggested.workCondition) : num(worker.workCondition),
    bonus: suggested ? num(suggested.bonus) : num(worker.bonus),
    he25Hours: 0,
    he25Manual: null,
    he35Hours: 0,
    he35Manual: null,
    heNight25Hours: 0,
    heNight25Manual: null,
    heNight35Hours: 0,
    heNight35Manual: null,
    nightHours: 0,
    nightManual: null,
    factor: 1,
    schedule: 'full',
  };
}

function manualOrNull(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

function workerFromQuotePosition(position: QuotePosition): BillingWorkerInput {
  const name = position.name.trim() || position.position.trim() || 'Puesto';
  return withWorkerDefaults({
    id: newBillingId(),
    name,
    position: name,
    included: true,
    origin: 'manual',
    contractualSalary: position.contractualSalary,
    daysWorked: position.daysWorked,
    familyAllowance: position.familyAllowance,
    workCondition: position.workCondition,
    bonus: position.bonus,
    bonusConcept: position.bonusConcept,
    nightShift: position.nightShift,
    he25Hours: position.he25Hours,
    he25Manual: position.he25Manual,
    he35Hours: position.he35Hours,
    he35Manual: position.he35Manual,
    heNight25Hours: position.heNight25Hours,
    heNight25Manual: position.heNight25Manual,
    heNight35Hours: position.heNight35Hours,
    heNight35Manual: position.heNight35Manual,
    nightHours: position.nightHours,
    nightManual: position.nightManual,
    socialBaseManual: position.socialBaseManual,
    socialBase: position.socialBase,
    factor: position.factor,
    daysManual: true,
    vacationDays: position.vacationDays,
    schedule: workerSchedule(position),
    calendarDays: position.daysWorked,
    absenceDays: 0,
    notes: position.site ? `Sede: ${position.site}` : position.notes,
  });
}

export function normalizeQuotePayload(raw: unknown): QuoteProposalPayload {
  const source = raw && typeof raw === 'object' ? (raw as Partial<QuoteProposalPayload>) : {};
  const modelRaw = source.model && typeof source.model === 'object' ? source.model : undefined;
  const rates = normalizeBillingRates(modelRaw?.rates);
  const base = emptyBillingModel(
    modelRaw?.title || 'PROPUESTA TÉCNICO ECONÓMICA DE SERVICIOS',
    modelRaw?.serviceLabel || 'Servicio',
    rates
  );
  const workers = (modelRaw?.workers || []).map((worker) => normalizePosition(worker, rates));
  const storedPartTime = modelRaw?.partTimeRates;
  const model: ClientBillingModel = {
    ...base,
    ...(modelRaw || {}),
    version: 1,
    title: modelRaw?.title || base.title,
    serviceLabel: modelRaw?.serviceLabel || base.serviceLabel,
    comment: modelRaw?.comment || '',
    considerations: modelRaw?.considerations || '',
    rates,
    workers,
    partTimeRates:
      scheduleMix(workers) === 'mixed' || storedPartTime
        ? normalizePartTimeRates(storedPartTime, rates)
        : undefined,
    operational: Array.isArray(modelRaw?.operational) ? modelRaw.operational.map((line) => normalizeOperationalLine(line)) : [],
    administrative: Array.isArray(modelRaw?.administrative)
      ? modelRaw.administrative.map((line) => normalizeAdministrativeLine(line))
      : defaultAdministrativeLines(),
    formulas: normalizeBillingFormulas(modelRaw?.formulas),
    internalNotes: normalizeQuoteNotes(modelRaw?.internalNotes),
  };
  const commercialTerms = normalizeCommercialTerms(
    (source as { commercialTerms?: Partial<QuoteCommercialTerms> }).commercialTerms
  );
  const coveredByBlocks = !source.commercialTerms;
  const clauses = Array.isArray(source.clauses)
    ? source.clauses
        .map((clause) => ({
          id: String(clause?.id || newBillingId()),
          title: String(clause?.title || '').trim(),
          text: String(clause?.text || '').trim(),
        }))
        .filter((clause) => clause.title || clause.text)
        .filter((clause) => !coveredByBlocks || !legacyConditionCovered(clause.text))
    : defaultQuoteClauses();
  const notes = Array.isArray(source.notes) ? source.notes.map((note) => String(note ?? '')) : defaultQuoteNotes();
  const issueDate = String(source.issueDate || '');
  return {
    version: 1,
    address: String(source.address || ''),
    attention: String(source.attention || ''),
    months: Math.max(1, Math.round(Number(source.months) || 1)),
    issueDate: /^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? issueDate : new Date().toISOString().slice(0, 10),
    serviceScope: String(source.serviceScope || ''),
    showAdminDetail: source.showAdminDetail !== false,
    commercialTerms,
    clauses,
    notes,
    model,
  };
}

export function quotePositions(model: ClientBillingModel): QuotePosition[] {
  return (model.workers || []).map((worker) => normalizePosition(worker as QuotePosition, model.rates));
}

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeOperationalLine(raw: Partial<BillingCostLine> | null | undefined): BillingCostLine {
  const source = raw || {};
  const line: BillingCostLine = {
    id: String(source.id || newBillingId()),
    kind: String(source.kind || 'otros'),
    description: String(source.description || ''),
    amount: num(source.amount),
  };
  if (source.formulaLocked) line.formulaLocked = true;
  if (source.note) line.note = String(source.note);
  if (!costLineHasBreakdown(source)) return line;
  line.quantity = num(source.quantity);
  line.unitPrice = num(source.unitPrice);
  line.frequency = num(source.frequency);
  line.amount = costLineAmount(line);
  return line;
}

const QUOTE_NOTE_TABS = new Set<BillingInternalTab>(['labor', 'ops', 'admin', 'params', 'profit']);

function normalizeQuoteNotes(raw: unknown): BillingInternalNote[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const note = item && typeof item === 'object' ? (item as Partial<BillingInternalNote>) : {};
    const tab = String(note.tab || '') as BillingInternalTab;
    const text = String(note.text || '').trim();
    if (!QUOTE_NOTE_TABS.has(tab) || !text) return [];
    return [
      {
        id: String(note.id || newBillingId()),
        tab,
        text,
        authorName: String(note.authorName || 'Usuario').trim() || 'Usuario',
        createdAt: String(note.createdAt || new Date().toISOString()),
      },
    ];
  });
}

function legacyConditionCovered(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    normalized.startsWith('la implementación e inicio del servicio tomará') ||
    normalized.startsWith('facturación los primeros días de cada mes con plazo de cancelación')
  );
}

function normalizeCommercialTerms(raw: Partial<QuoteCommercialTerms> | null | undefined): QuoteCommercialTerms {
  const base = defaultCommercialTerms();
  const whole = (value: unknown, fallback: number) => {
    const parsed = Math.round(Number(value));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const text = (value: unknown, fallback: string) => {
    const parsed = String(value ?? '').trim();
    return parsed || fallback;
  };
  return {
    implementationDays: whole(raw?.implementationDays, base.implementationDays),
    currencyName: text(raw?.currencyName, base.currencyName),
    currencySymbol: text(raw?.currencySymbol, base.currencySymbol),
    creditDays: Math.max(1, whole(raw?.creditDays, base.creditDays)),
    billingCutoff: text(raw?.billingCutoff, base.billingCutoff),
    invoiceIssue: text(raw?.invoiceIssue, base.invoiceIssue),
    offerValidityDays: Math.max(1, whole(raw?.offerValidityDays, base.offerValidityDays)),
  };
}

function profitDescription(rates: BillingRates): string {
  const mode = rates.profitMode === 'markup_on_cost' ? 'recargo sobre el costo' : 'margen sobre el precio';
  const base = rates.profitBase === 'labor' ? 'solo sobre el costo laboral' : 'sobre el costo laboral, operativo y administrativo';
  return `Utilidad comercial (${formatRatePercent(rates.profitRate)}%, ${mode}, ${base})`;
}

interface ConceptDef {
  key: string;
  label: string;
  group: 'remuneracion' | 'provisiones' | 'aportes';
  emphasize?: 'sub';
  pick: (worker: QuotePosition, line: ComputedWorker) => number;
}

function conceptDefs(rates: BillingRates, partTimeEssaludDiffers: boolean): ConceptDef[] {
  const essalud = partTimeEssaludDiffers
    ? 'EsSalud (según jornada)'
    : rates.essaludMode === 'fixed'
      ? 'EsSalud (monto fijo por puesto)'
      : `EsSalud (${formatRatePercent(rates.essaludRate)}%)`;
  return [
    { key: 'basic', label: 'Remuneración básica', group: 'remuneracion', pick: (_worker, line) => line.basic },
    { key: 'family', label: 'Asignación familiar', group: 'remuneracion', pick: (worker) => num(worker.familyAllowance) },
    { key: 'condition', label: 'Condición de trabajo / movilidad supeditada', group: 'remuneracion', pick: (worker) => num(worker.workCondition) },
    { key: 'he25', label: 'Hora extra diurna 25%', group: 'remuneracion', pick: (_worker, line) => line.he25 },
    { key: 'he35', label: 'Hora extra diurna 35%', group: 'remuneracion', pick: (_worker, line) => line.he35 },
    { key: 'heNight25', label: 'Hora extra nocturna 25%', group: 'remuneracion', pick: (_worker, line) => line.heNight25 },
    { key: 'heNight35', label: 'Hora extra nocturna 35%', group: 'remuneracion', pick: (_worker, line) => line.heNight35 },
    { key: 'night', label: 'Bono nocturno', group: 'remuneracion', pick: (_worker, line) => line.night },
    { key: 'bonus', label: 'Bonos', group: 'remuneracion', pick: (worker) => num(worker.bonus) },
    { key: 'gratification', label: 'Gratificación y bonificación extraordinaria (Ley N.° 30334)', group: 'provisiones', pick: (_worker, line) => line.gratification },
    { key: 'cts', label: 'CTS (compensación por tiempo de servicios)', group: 'provisiones', pick: (_worker, line) => line.cts },
    { key: 'vacation', label: 'Vacaciones', group: 'provisiones', pick: (_worker, line) => line.vacation },
    { key: 'feria', label: 'Feriados', group: 'provisiones', pick: (_worker, line) => line.feria },
    { key: 'essalud', label: essalud, group: 'aportes', pick: (_worker, line) => line.essalud },
    { key: 'sctr', label: 'SCTR salud y pensión', group: 'aportes', pick: (_worker, line) => line.sctr },
    { key: 'vidaLey', label: 'Seguro de Vida Ley', group: 'aportes', pick: (_worker, line) => line.vidaLey },
  ];
}

export interface ProposalAdminRow {
  description: string;
  amount: number;
  strong?: boolean;
}

function adminKindLabel(kind: string): string {
  if (kind === 'financiero') return 'Costo financiero';
  if (kind === 'gestion_rrhh') return 'Gestión de RRHH';
  if (kind === 'estructura') return 'Estructura';
  return 'Gasto administrativo';
}

/** Líneas de gastos administrativos que salen en la propuesta. */
export function proposalAdministrativeTable(
  model: ClientBillingModel,
  computed: BillingComputation,
  showDetail: boolean
): { rows: ProposalAdminRow[]; subtotalLabel: string | null; subtotal: number } {
  const lines = model.administrative || [];
  const amounts = computed.administrative || [];
  const byId = new Map(amounts.map((line) => [line.id, line.amount]));
  const rows = lines
    .map((line, index) => ({
      description: line.description?.trim() || adminKindLabel(line.kind),
      amount: byId.get(line.id) ?? amounts[index]?.amount ?? 0,
    }))
    .filter((line) => Math.abs(line.amount) >= 0.005);

  if (!showDetail) {
    if (Math.abs(computed.adminTotal) < 0.005) {
      return { rows: [], subtotalLabel: null, subtotal: computed.adminTotal };
    }
    return {
      rows: [{ description: 'Gastos administrativos', amount: computed.adminTotal, strong: true }],
      subtotalLabel: null,
      subtotal: computed.adminTotal,
    };
  }

  return {
    rows,
    subtotalLabel: rows.length ? 'Subtotal de gastos administrativos' : null,
    subtotal: computed.adminTotal,
  };
}

export function buildQuoteView(payload: QuoteProposalPayload): QuoteView {
  const model = payload.model;
  const rates = normalizeBillingRates(model.rates);
  const mixed = scheduleMix(model.workers) === 'mixed';
  const partTime = mixed ? normalizePartTimeRates(model.partTimeRates, rates) : null;
  const essaludDiffers = Boolean(
    partTime &&
      (partTime.essaludMode !== rates.essaludMode ||
        partTime.essaludRate !== rates.essaludRate ||
        partTime.essaludFixedAmount !== rates.essaludFixedAmount)
  );
  const computed = computeBilling({ ...model, rates });
  const lines = new Map(computed.workers.map((line) => [line.id, line]));
  const included = quotePositions(model).filter((worker) => worker.included && lines.has(worker.id));
  const positions: QuotePositionColumn[] = included.map((worker, index) => {
    const line = lines.get(worker.id)!;
    return {
      id: worker.id,
      item: String(index + 1).padStart(2, '0'),
      name: worker.name || 'Puesto',
      site: worker.site || '',
      schedule: workerSchedule(worker),
      vacancies: Math.max(1, Math.round(num(worker.factor) || 1)),
      laborMonth: line.monthlyCost,
      laborTotal: line.totalCost,
    };
  });
  const concepts: QuoteConceptRow[] = conceptDefs(rates, essaludDiffers).map((concept) => {
    const amounts = included.map((worker) => concept.pick(worker, lines.get(worker.id)!));
    return {
      key: concept.key,
      label: concept.label,
      group: concept.group,
      emphasize: concept.emphasize,
      amounts,
      total: amounts.reduce((sum, amount) => sum + amount, 0),
    };
  });
  const unitLabor = included.map((worker) => lines.get(worker.id)!.monthlyCost);
  const quantities = included.map((worker) => Math.max(1, Math.round(num(worker.factor) || 1)));
  const extendedLabor = included.map((worker) => lines.get(worker.id)!.totalCost);
  concepts.push(
    {
      key: 'laborUnit',
      label: 'Costo laboral de 1 puesto',
      group: 'aportes',
      emphasize: 'sub',
      amounts: unitLabor,
      total: unitLabor.reduce((sum, amount) => sum + amount, 0),
    },
    {
      key: 'quantity',
      label: 'Cantidad de puestos',
      group: 'aportes',
      format: 'count',
      amounts: quantities,
      total: quantities.reduce((sum, amount) => sum + amount, 0),
    },
    {
      key: 'labor',
      label: 'Costo laboral total',
      group: 'aportes',
      emphasize: 'final',
      amounts: extendedLabor,
      total: extendedLabor.reduce((sum, amount) => sum + amount, 0),
    }
  );

  const summary: QuoteSummaryRow[] = positions.map((position) => {
    const jornada = mixed ? (position.schedule === 'part' ? 'Part time' : 'Full time') : '';
    const description = [position.name, jornada, position.site].filter(Boolean).join(' · ');
    return {
      item: position.item,
      quantity: String(position.vacancies),
      description,
      amount: position.laborTotal,
      kind: 'position',
    };
  });
  (model.operational || []).forEach((line, index) => {
    summary.push({
      item: '',
      quantity: costLineHasBreakdown(line) ? String(num(line.quantity)) : '',
      description: line.description?.trim() || 'Costo operativo',
      amount: computed.operational[index]?.amount || 0,
      kind: 'ops',
    });
  });
  proposalAdministrativeTable(model, computed, payload.showAdminDetail !== false).rows.forEach((line) => {
    summary.push({
      item: '',
      quantity: '',
      description: line.description,
      amount: line.amount,
      kind: 'admin',
    });
  });
  summary.push({
    item: '',
    quantity: '',
    description: profitDescription(rates),
    amount: computed.profitAmount,
    kind: 'profit',
  });

  const months = Math.max(1, payload.months || 1);
  const periodWithIgv = round2(computed.totalWithIgv * months);
  const periodNet = round2(computed.grandTotal * months);
  return {
    computed,
    positions,
    concepts,
    summary,
    periodWithIgv,
    periodNet,
    periodIgv: round2(periodWithIgv - periodNet),
  };
}
