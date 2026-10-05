import { supabase, handleSupabaseError } from './supabase';

const db = supabase as unknown as {
  from: (table: string) => any;
};
import { variableCompensationsService } from './variableCompensationsService';
import {
  BillingChange,
  BillingCostLine,
  BillingRates,
  BillingWorkerInput,
  ClientBillingModel,
  DEFAULT_BILLING_RATES,
  cloneModel,
  commercialDaysInPeriod,
  computeBilling,
  defaultAdministrativeLines,
  emptyBillingModel,
  formatPeriodLabel,
  newBillingId,
  round2,
} from '../utils/clientBillingCalc';

export type BillingStatus = 'draft' | 'issued' | 'void';

export interface BillingActor {
  id?: string;
  name: string;
}

export interface ClientBillingRecord {
  id: string;
  unitId: string;
  clientName: string;
  unitName: string;
  periodMonth: string;
  title: string;
  status: BillingStatus;
  model: ClientBillingModel;
  laborTotal: number;
  operationalTotal: number;
  adminTotal: number;
  profitTotal: number;
  grandTotal: number;
  createdByName?: string;
  updatedByName?: string;
  issuedAt?: string;
  issuedByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientBillingAuditEntry {
  id: string;
  billingId: string;
  actorName?: string;
  action: string;
  summary: string;
  changes: BillingChange[];
  createdAt: string;
}

export interface BillingUnitRef {
  id: string;
  name: string;
  clientName: string;
}

export class BillingStorageError extends Error {
  code: 'missing_table' | 'duplicate' | 'unknown';
  constructor(code: BillingStorageError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

interface PersonnelRow {
  id: string;
  name: string;
  puesto?: string | null;
  dni?: string | null;
  monthly_salary?: number | null;
  work_condition_amount?: number | null;
  family_allowance?: boolean | null;
  personnel_status?: string | null;
  archived?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
}

export async function listClientBillings(): Promise<ClientBillingRecord[]> {
  const { data, error } = await db
    .from('client_billings')
    .select('*')
    .order('period_month', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(300);
  if (error) throw mapError(error);
  return (data || []).map(mapRecord);
}

export async function getBillingAudit(billingId: string): Promise<ClientBillingAuditEntry[]> {
  const { data, error } = await db
    .from('client_billing_audit')
    .select('*')
    .eq('billing_id', billingId)
    .order('created_at', { ascending: false });
  if (error) throw mapError(error);
  return (data || []).map((row: any) => ({
    id: row.id,
    billingId: row.billing_id,
    actorName: row.actor_name || undefined,
    action: row.action,
    summary: row.summary,
    changes: Array.isArray(row.changes) ? row.changes : [],
    createdAt: row.created_at,
  }));
}

export async function findActiveBilling(unitId: string, periodMonth: string): Promise<ClientBillingRecord | null> {
  const { data, error } = await db
    .from('client_billings')
    .select('*')
    .eq('unit_id', unitId)
    .eq('period_month', toPeriodDate(periodMonth))
    .neq('status', 'void')
    .maybeSingle();
  if (error) throw mapError(error);
  return data ? mapRecord(data) : null;
}

export async function prepareBillingDraft(
  unit: BillingUnitRef,
  periodMonth: string,
  options: { copyPreviousCosts: boolean }
): Promise<ClientBillingModel> {
  const [profile, previous, people, compensations] = await Promise.all([
    loadProfile(unit.id),
    loadPrevious(unit.id, periodMonth),
    loadPersonnel(unit.id),
    variableCompensationsService.getByUnitAndMonth(unit.id, periodMonth).catch(() => []),
  ]);

  const rates: BillingRates = {
    ...DEFAULT_BILLING_RATES,
    ...(previous?.model.rates || {}),
    ...(profile?.rates || {}),
  };
  const monthLabel = formatPeriodLabel(periodMonth);
  const serviceLabel = profile?.serviceLabel || previous?.model.serviceLabel || `Servicio de ${unit.name}`;
  const model = emptyBillingModel(`${serviceLabel} — ${monthLabel}`, serviceLabel, rates);
  model.considerations = profile?.considerations || previous?.model.considerations || model.considerations;

  const bonuses = new Map<string, { amount: number; concept: string[] }>();
  compensations.forEach((item) => {
    const current = bonuses.get(item.resourceId) || { amount: 0, concept: [] };
    current.amount += Number(item.amount) || 0;
    if (item.concept) current.concept.push(item.concept);
    bonuses.set(item.resourceId, current);
  });

  model.workers = people
    .map((person) => workerFromPersonnel(person, periodMonth, rates, bonuses.get(person.id)))
    .filter((worker) => worker.daysWorked > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  if (options.copyPreviousCosts && previous) {
    model.operational = cloneLines(previous.model.operational);
    model.administrative = previous.model.administrative.length
      ? cloneLines(previous.model.administrative)
      : defaultAdministrativeLines();
  } else if (profile?.administrative?.length) {
    model.administrative = cloneLines(profile.administrative);
  }

  return model;
}

export async function refreshWorkersFromUnit(
  unitId: string,
  periodMonth: string,
  model: ClientBillingModel
): Promise<ClientBillingModel> {
  const [people, compensations] = await Promise.all([
    loadPersonnel(unitId),
    variableCompensationsService.getByUnitAndMonth(unitId, periodMonth).catch(() => []),
  ]);
  const bonuses = new Map<string, { amount: number; concept: string[] }>();
  compensations.forEach((item) => {
    const current = bonuses.get(item.resourceId) || { amount: 0, concept: [] };
    current.amount += Number(item.amount) || 0;
    if (item.concept) current.concept.push(item.concept);
    bonuses.set(item.resourceId, current);
  });

  const next = cloneModel(model);
  const byResource = new Map(next.workers.filter((worker) => worker.resourceId).map((worker) => [worker.resourceId as string, worker]));
  const seen = new Set<string>();

  people.forEach((person) => {
    const fresh = workerFromPersonnel(person, periodMonth, model.rates, bonuses.get(person.id));
    if (fresh.daysWorked <= 0 && fresh.suggested?.daysWorked === 0) return;
    seen.add(person.id);
    const current = byResource.get(person.id);
    if (!current) {
      next.workers.push(fresh);
      return;
    }
    const previousSuggestion = current.suggested;
    if (previousSuggestion) {
      if (same(current.contractualSalary, previousSuggestion.contractualSalary)) current.contractualSalary = fresh.contractualSalary;
      if (same(current.daysWorked, previousSuggestion.daysWorked)) current.daysWorked = fresh.daysWorked;
      if (same(current.familyAllowance, previousSuggestion.familyAllowance)) current.familyAllowance = fresh.familyAllowance;
      if (same(current.workCondition, previousSuggestion.workCondition)) current.workCondition = fresh.workCondition;
      if (same(current.bonus, previousSuggestion.bonus)) {
        current.bonus = fresh.bonus;
        current.bonusConcept = fresh.bonusConcept;
      }
    }
    if (!current.socialBaseManual) current.socialBase = current.contractualSalary;
    current.suggested = fresh.suggested;
    current.missingFromUnit = false;
    current.name = current.name || fresh.name;
    current.position = current.position || fresh.position;
  });

  next.workers.forEach((worker) => {
    if (worker.resourceId && !seen.has(worker.resourceId)) worker.missingFromUnit = true;
  });
  next.workers.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return next;
}

export async function saveClientBilling(input: {
  id?: string;
  unit: BillingUnitRef;
  periodMonth: string;
  model: ClientBillingModel;
  actor: BillingActor;
  changes: BillingChange[];
  action?: 'created' | 'saved';
}): Promise<ClientBillingRecord> {
  const computed = computeBilling(input.model);
  const now = new Date().toISOString();
  const row = {
    unit_id: input.unit.id,
    client_name: input.unit.clientName,
    unit_name: input.unit.name,
    period_month: toPeriodDate(input.periodMonth),
    title: input.model.title || `${input.unit.name} ${input.periodMonth}`,
    payload: { model: input.model, computed },
    labor_total: round2(computed.laborTotal),
    operational_total: round2(computed.operationalTotal),
    admin_total: round2(computed.adminTotal),
    profit_total: round2(computed.profitAmount),
    grand_total: round2(computed.grandTotal),
    updated_by: input.actor.id || null,
    updated_by_name: input.actor.name,
    updated_at: now,
  };

  if (!input.id) {
    const { data, error } = await db
      .from('client_billings')
      .insert({
        ...row,
        status: 'draft',
        created_by: input.actor.id || null,
        created_by_name: input.actor.name,
        created_at: now,
      })
      .select('*')
      .single();
    if (error) throw mapError(error);
    const record = mapRecord(data);
    await writeAudit(record.id, input.actor, 'created', 'Creó la liquidación', input.changes);
    return record;
  }

  const { data, error } = await db
    .from('client_billings')
    .update(row)
    .eq('id', input.id)
    .select('*')
    .single();
  if (error) throw mapError(error);
  const record = mapRecord(data);
  if (input.changes.length > 0) {
    const summary = input.model.comment
      ? `Guardó ${input.changes.length} ajuste(s). ${input.model.comment}`
      : `Guardó ${input.changes.length} ajuste(s)`;
    await writeAudit(record.id, input.actor, input.action || 'saved', summary, input.changes);
  }
  return record;
}

export async function setBillingStatus(
  id: string,
  status: BillingStatus,
  actor: BillingActor,
  summary: string
): Promise<ClientBillingRecord> {
  const patch: Record<string, unknown> = {
    status,
    updated_by: actor.id || null,
    updated_by_name: actor.name,
    updated_at: new Date().toISOString(),
  };
  if (status === 'issued') {
    patch.issued_at = new Date().toISOString();
    patch.issued_by_name = actor.name;
  }
  if (status === 'draft') {
    patch.issued_at = null;
    patch.issued_by_name = null;
  }
  const { data, error } = await db.from('client_billings').update(patch).eq('id', id).select('*').single();
  if (error) throw mapError(error);
  const record = mapRecord(data);
  await writeAudit(id, actor, status === 'issued' ? 'issued' : status === 'void' ? 'voided' : 'reopened', summary, []);
  return record;
}

export async function saveBillingProfile(unitId: string, model: ClientBillingModel, actor: BillingActor): Promise<void> {
  const payload = {
    rates: model.rates,
    serviceLabel: model.serviceLabel,
    considerations: model.considerations,
    administrative: model.administrative,
  };
  const { error } = await db.from('client_billing_profiles').upsert({
    unit_id: unitId,
    payload,
    updated_by_name: actor.name,
    updated_at: new Date().toISOString(),
  });
  if (error) throw mapError(error);
}

async function loadProfile(unitId: string): Promise<{
  rates?: Partial<BillingRates>;
  serviceLabel?: string;
  considerations?: string;
  administrative?: BillingCostLine[];
} | null> {
  const { data, error } = await db
    .from('client_billing_profiles')
    .select('payload')
    .eq('unit_id', unitId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw mapError(error);
  }
  return data?.payload || null;
}

async function loadPrevious(unitId: string, periodMonth: string): Promise<ClientBillingRecord | null> {
  const { data, error } = await db
    .from('client_billings')
    .select('*')
    .eq('unit_id', unitId)
    .neq('status', 'void')
    .lt('period_month', toPeriodDate(periodMonth))
    .order('period_month', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw mapError(error);
  }
  return data ? mapRecord(data) : null;
}

async function loadPersonnel(unitId: string): Promise<PersonnelRow[]> {
  const { data, error } = await db
    .from('resources')
    .select('id,name,puesto,dni,monthly_salary,work_condition_amount,family_allowance,personnel_status,archived,start_date,end_date,type')
    .eq('unit_id', unitId)
    .eq('type', 'Personal');
  if (error) throw mapError(error);
  return ((data || []) as PersonnelRow[]).filter((row) => row.archived !== true && row.personnel_status !== 'archivado');
}

function workerFromPersonnel(
  person: PersonnelRow,
  periodMonth: string,
  rates: BillingRates,
  bonus?: { amount: number; concept: string[] }
): BillingWorkerInput {
  const salary = Number(person.monthly_salary) || 0;
  let days = commercialDaysInPeriod(periodMonth, person.start_date, person.end_date, person.personnel_status);
  if (person.personnel_status === 'cesado' && !person.end_date) days = 0;
  const family = person.family_allowance ? rates.familyAllowanceAmount : 0;
  const workCondition = Number(person.work_condition_amount) || 0;
  const bonusAmount = bonus?.amount || 0;
  return {
    id: newBillingId(),
    resourceId: person.id,
    name: person.name || 'Sin nombre',
    position: person.puesto || '',
    dni: person.dni || undefined,
    included: days > 0,
    origin: 'unit',
    contractualSalary: salary,
    daysWorked: days,
    familyAllowance: family,
    workCondition,
    bonus: bonusAmount,
    bonusConcept: bonus?.concept.filter(Boolean).join(', ') || undefined,
    he25Hours: 0,
    he25Manual: null,
    he35Hours: 0,
    he35Manual: null,
    nightHours: 0,
    nightManual: null,
    socialBaseManual: false,
    socialBase: salary,
    factor: 1,
    suggested: {
      contractualSalary: salary,
      daysWorked: days,
      familyAllowance: family,
      workCondition,
      bonus: bonusAmount,
    },
  };
}

function cloneLines(lines: BillingCostLine[]): BillingCostLine[] {
  return lines.map((line) => ({ ...line, id: newBillingId() }));
}

async function writeAudit(
  billingId: string,
  actor: BillingActor,
  action: string,
  summary: string,
  changes: BillingChange[]
): Promise<void> {
  const { error } = await db.from('client_billing_audit').insert({
    billing_id: billingId,
    actor_id: actor.id || null,
    actor_name: actor.name,
    action,
    summary,
    changes,
  });
  if (error) throw mapError(error);
}

function mapRecord(row: any): ClientBillingRecord {
  const model = (row.payload?.model || row.payload) as ClientBillingModel;
  return {
    id: row.id,
    unitId: row.unit_id,
    clientName: row.client_name,
    unitName: row.unit_name,
    periodMonth: String(row.period_month).slice(0, 7),
    title: row.title,
    status: row.status,
    model,
    laborTotal: Number(row.labor_total) || 0,
    operationalTotal: Number(row.operational_total) || 0,
    adminTotal: Number(row.admin_total) || 0,
    profitTotal: Number(row.profit_total) || 0,
    grandTotal: Number(row.grand_total) || 0,
    createdByName: row.created_by_name || undefined,
    updatedByName: row.updated_by_name || undefined,
    issuedAt: row.issued_at || undefined,
    issuedByName: row.issued_by_name || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPeriodDate(periodMonth: string): string {
  return `${periodMonth.slice(0, 7)}-01`;
}

function same(a: number, b: number): boolean {
  return Math.abs((a || 0) - (b || 0)) < 0.0001;
}

function isMissingTable(error: any): boolean {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return error?.code === '42P01' || /client_billing|schema cache|does not exist/i.test(message);
}

function mapError(error: any): Error {
  if (isMissingTable(error)) {
    return new BillingStorageError(
      'missing_table',
      'Falta crear las tablas de facturación. Ejecute migrations/MIGRATION_CLIENT_BILLING.sql en Supabase.'
    );
  }
  if (error?.code === '23505') {
    return new BillingStorageError('duplicate', 'Ya existe una facturación activa de esta unidad para ese mes.');
  }
  handleSupabaseError(error);
  return new BillingStorageError('unknown', error?.message || 'No se pudo guardar la facturación.');
}
