import { Resource, ResourceType, Unit } from '../types';
import { getLaborRelationshipDisplayDates } from './laborRelationshipDates';

export type RenewalAction = 'renew' | 'update';
export type StartMode = 'fixed' | 'day-after-end';
export type EndMode = 'keep' | 'fixed' | 'months' | 'same-span';
export type MoneyMode = 'keep' | 'fixed' | 'add' | 'percent';
export type UrgencyFilter = 'all' | 'overdue' | '15' | '30' | '60' | 'month' | 'missing';
export type RenewalSort = 'end-asc' | 'end-desc' | 'name' | 'unit';

export interface RenewalDraft {
  action: RenewalAction;
  startMode: StartMode;
  startDate: string;
  endMode: EndMode;
  endDate: string;
  months: number;
  salaryMode: MoneyMode;
  salaryValue: string;
  conditionMode: Exclude<MoneyMode, 'percent'>;
  conditionValue: string;
  notes: string;
}

export const emptyRenewalDraft = (): RenewalDraft => ({
  action: 'renew',
  startMode: 'day-after-end',
  startDate: '',
  endMode: 'months',
  endDate: '',
  months: 3,
  salaryMode: 'keep',
  salaryValue: '',
  conditionMode: 'keep',
  conditionValue: '',
  notes: '',
});

export interface RenewalWorker {
  resource: Resource;
  unitId: string;
  unitName: string;
  clientName: string;
  start?: string;
  end?: string;
  daysLeft: number | null;
}

export interface PlannedRenewal {
  worker: RenewalWorker;
  action: RenewalAction;
  currentStart?: string;
  currentEnd?: string;
  currentSalary?: number;
  currentCondition?: number;
  nextStart?: string;
  nextEnd?: string;
  endChanged: boolean;
  nextSalary?: number;
  salaryChanged: boolean;
  nextCondition?: number;
  conditionChanged: boolean;
  notes?: string;
  error?: string;
}

export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + days);
  return todayIso(date);
}

export function addIsoMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const target = new Date(y, (m || 1) - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d || 1, lastDay));
  return todayIso(target);
}

export function daysUntil(iso: string | undefined, today = todayIso()): number | null {
  if (!iso) return null;
  const [y1, m1, d1] = today.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = iso.slice(0, 10).split('-').map(Number);
  const from = new Date(y1, (m1 || 1) - 1, d1 || 1).getTime();
  const to = new Date(y2, (m2 || 1) - 1, d2 || 1).getTime();
  return Math.round((to - from) / 86400000);
}

export function formatRenewalMoney(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Personal activo de todas las unidades, una fila por trabajador. */
export function collectRenewalWorkers(units: Unit[], today = todayIso()): RenewalWorker[] {
  const seen = new Set<string>();
  const rows: RenewalWorker[] = [];

  for (const unit of units) {
    for (const resource of unit.resources || []) {
      if (resource.type !== ResourceType.PERSONNEL) continue;
      if (resource.archived) continue;
      if (resource.personnelStatus === 'cesado' || resource.personnelStatus === 'archivado') continue;
      if (seen.has(resource.id)) continue;
      seen.add(resource.id);
      const dates = getLaborRelationshipDisplayDates(resource, resource.contractHistory);
      rows.push({
        resource,
        unitId: unit.id,
        unitName: unit.name,
        clientName: unit.clientName || 'Sin cliente',
        start: dates.start,
        end: dates.end,
        daysLeft: daysUntil(dates.end, today),
      });
    }
  }

  return rows;
}

export function renewalAttentionCount(units: Unit[], withinDays = 30): number {
  return collectRenewalWorkers(units).filter((worker) => worker.daysLeft !== null && worker.daysLeft <= withinDays).length;
}

export function matchesUrgency(worker: RenewalWorker, filter: UrgencyFilter, today = todayIso()): boolean {
  if (filter === 'all') return true;
  if (filter === 'missing') return !worker.end;
  if (worker.daysLeft === null) return false;
  if (filter === 'overdue') return worker.daysLeft < 0;
  if (filter === 'month') return !!worker.end && worker.end.slice(0, 7) === today.slice(0, 7);
  const window = filter === '15' ? 15 : filter === '30' ? 30 : 60;
  return worker.daysLeft <= window;
}

function parseMoney(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

function resolveMoney(
  mode: MoneyMode,
  raw: string,
  current: number | undefined,
  label: string,
): { value?: number; changed: boolean; error?: string } {
  if (mode === 'keep') return { value: current, changed: false };
  const amount = parseMoney(raw);
  if (amount === null) return { changed: true, error: `Indique un valor válido de ${label}.` };
  if (mode === 'fixed') return { value: amount, changed: current !== amount };
  if (current === undefined || Number.isNaN(current)) {
    return { changed: true, error: `Este trabajador no tiene ${label} para calcular el ajuste.` };
  }
  if (mode === 'add') {
    const value = Math.round((current + amount) * 100) / 100;
    return { value, changed: value !== current };
  }
  const value = Math.round(current * (1 + amount / 100) * 100) / 100;
  return { value, changed: value !== current };
}

export function planRenewal(worker: RenewalWorker, draft: RenewalDraft): PlannedRenewal {
  const salary = resolveMoney(draft.salaryMode, draft.salaryValue, worker.resource.monthlySalary, 'sueldo');
  const condition = resolveMoney(draft.conditionMode, draft.conditionValue, worker.resource.workConditionAmount, 'condición de trabajo');
  const plan: PlannedRenewal = {
    worker,
    action: draft.action,
    currentStart: worker.start,
    currentEnd: worker.end,
    currentSalary: worker.resource.monthlySalary,
    currentCondition: worker.resource.workConditionAmount,
    nextSalary: salary.value,
    salaryChanged: salary.changed,
    nextCondition: condition.value,
    conditionChanged: condition.changed,
    endChanged: false,
    notes: draft.notes.trim() || undefined,
  };
  const errors: string[] = [];
  if (salary.error) errors.push(salary.error);
  if (condition.error) errors.push(condition.error);

  if (draft.action === 'renew') {
    let start = '';
    if (draft.startMode === 'fixed') {
      start = draft.startDate.trim();
      if (!start) errors.push('Falta la fecha de inicio del nuevo contrato.');
    } else if (!worker.end) {
      errors.push('No tiene fecha de fin para iniciar al día siguiente.');
    } else {
      start = addIsoDays(worker.end, 1);
    }

    let end = '';
    if (draft.endMode === 'fixed') {
      end = draft.endDate.trim();
      if (!end) errors.push('Falta la fecha de fin del nuevo contrato.');
    } else if (draft.endMode === 'months') {
      const months = Math.trunc(Number(draft.months));
      if (!Number.isFinite(months) || months < 1 || months > 36) {
        errors.push('La duración debe estar entre 1 y 36 meses.');
      } else if (start) {
        end = addIsoMonths(start, months);
      }
    } else if (draft.endMode === 'same-span') {
      if (!worker.start || !worker.end) {
        errors.push('Faltan las fechas actuales para repetir la misma duración.');
      } else if (start) {
        const span = daysUntil(worker.end, worker.start);
        if (span === null || span < 0) errors.push('La duración actual no es válida.');
        else end = addIsoDays(start, span);
      }
    } else {
      errors.push('Elija cómo calcular el fin del nuevo contrato.');
    }

    if (start && end && end < start) errors.push('La fecha de fin debe ser igual o posterior al inicio.');
    plan.nextStart = start || undefined;
    plan.nextEnd = end || undefined;
    plan.endChanged = true;
  } else if (draft.endMode === 'fixed') {
    if (!draft.endDate.trim()) {
      errors.push('Falta la nueva fecha de fin.');
    } else if (worker.start && draft.endDate < worker.start) {
      errors.push('El fin queda antes del inicio de la relación laboral.');
    } else {
      plan.nextEnd = draft.endDate.trim();
      plan.endChanged = plan.nextEnd !== worker.end;
    }
  } else if (draft.endMode === 'months') {
    const months = Math.trunc(Number(draft.months));
    if (!Number.isFinite(months) || months < 1 || months > 36) {
      errors.push('La extensión debe estar entre 1 y 36 meses.');
    } else if (!worker.end) {
      errors.push('No tiene fecha de fin para extender.');
    } else {
      plan.nextEnd = addIsoMonths(worker.end, months);
      plan.endChanged = plan.nextEnd !== worker.end;
    }
  } else if (draft.endMode === 'same-span') {
    errors.push('Repetir la duración solo aplica al crear un contrato nuevo.');
  }

  if (draft.action === 'update' && !plan.endChanged && !plan.salaryChanged && !plan.conditionChanged && errors.length === 0) {
    errors.push('Indique un nuevo fin, sueldo o condición.');
  }

  if (errors.length > 0) plan.error = errors.join(' ');
  return plan;
}
