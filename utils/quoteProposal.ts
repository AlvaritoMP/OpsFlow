import {
  BillingComputation,
  BillingRates,
  BillingWorkerInput,
  ClientBillingModel,
  ComputedWorker,
  DEFAULT_BILLING_RATES,
  computeBilling,
  defaultAdministrativeLines,
  emptyBillingModel,
  newBillingId,
  normalizeBillingRates,
  round2,
  withWorkerDefaults,
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
  laborMonth: number;
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
    'Cada columna ya multiplica las vacantes del puesto. Los costos operativos, los gastos administrativos y la utilidad se calculan sobre la propuesta completa, igual que en una liquidación, y no se prorratean dentro del sueldo.',
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
  };
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
  const model: ClientBillingModel = {
    ...base,
    ...(modelRaw || {}),
    version: 1,
    title: modelRaw?.title || base.title,
    serviceLabel: modelRaw?.serviceLabel || base.serviceLabel,
    comment: modelRaw?.comment || '',
    considerations: modelRaw?.considerations || '',
    rates,
    workers: (modelRaw?.workers || []).map((worker) => normalizePosition(worker, rates)),
    operational: Array.isArray(modelRaw?.operational) ? modelRaw.operational : [],
    administrative: Array.isArray(modelRaw?.administrative) ? modelRaw.administrative : defaultAdministrativeLines(),
    formulas: normalizeBillingFormulas(modelRaw?.formulas),
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

function conceptDefs(rates: BillingRates): ConceptDef[] {
  const essalud =
    rates.essaludMode === 'fixed'
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

export function buildQuoteView(payload: QuoteProposalPayload): QuoteView {
  const model = payload.model;
  const rates = normalizeBillingRates(model.rates);
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
      vacancies: Math.max(1, Math.round(num(worker.factor) || 1)),
      laborMonth: line.totalCost,
    };
  });
  const concepts: QuoteConceptRow[] = conceptDefs(rates).map((concept) => {
    const amounts = included.map((worker) => {
      const line = lines.get(worker.id)!;
      return concept.pick(worker, line) * num(worker.factor);
    });
    return {
      key: concept.key,
      label: concept.label,
      group: concept.group,
      emphasize: concept.emphasize,
      amounts,
      total: amounts.reduce((sum, amount) => sum + amount, 0),
    };
  });
  const laborAmounts = included.map((worker) => lines.get(worker.id)!.totalCost);
  concepts.push({
    key: 'labor',
    label: 'Costo laboral del puesto',
    group: 'aportes',
    emphasize: 'final',
    amounts: laborAmounts,
    total: laborAmounts.reduce((sum, amount) => sum + amount, 0),
  });

  const summary: QuoteSummaryRow[] = positions.map((position) => ({
    item: position.item,
    quantity: String(position.vacancies),
    description: position.site ? `${position.name} · ${position.site}` : position.name,
    amount: position.laborMonth,
    kind: 'position',
  }));
  (model.operational || []).forEach((line, index) => {
    summary.push({
      item: '',
      quantity: '',
      description: line.description?.trim() || 'Costo operativo',
      amount: computed.operational[index]?.amount || 0,
      kind: 'ops',
    });
  });
  (model.administrative || []).forEach((line, index) => {
    summary.push({
      item: '',
      quantity: '',
      description: line.description?.trim() || 'Gasto administrativo',
      amount: computed.administrative[index]?.amount || 0,
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
