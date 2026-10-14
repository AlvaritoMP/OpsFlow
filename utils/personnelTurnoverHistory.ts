import { Resource, ResourceType } from '../types';

/** Fecha de calendario, sin zona horaria. */
export interface CalendarDate {
  y: number;
  m: number;
  d: number;
}

export interface TurnoverSpell {
  id: string;
  /** Clave para contar una sola vez al personal compartido entre unidades. */
  sharedKey: string | null;
  clientName: string;
  start: CalendarDate | null;
  /** Fin de vigencia (contrato o cese). Define si estaba activo al día 1. */
  end: CalendarDate | null;
  /** Fecha de cese o archivo. Solo entonces cuenta como salida. */
  exitDate: CalendarDate | null;
}

export interface TurnoverMonthPoint {
  key: string;
  label: string;
  inicio: number;
  ingresos: number;
  salidas: number;
  /** null cuando no había personal al inicio y la tasa no tiene base. */
  rotacion: number | null;
  tasaIngreso: number | null;
  tasaSalida: number | null;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const UNASSIGNED_CLIENT = 'Sin cliente';

export function parseCalendarDate(value?: string | null): CalendarDate | null {
  if (!value) return null;
  const match = value.trim().slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(y, m - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) return null;
  return { y, m, d };
}

function compareDates(a: CalendarDate, b: CalendarDate): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

function lastDayOfMonth(year: number, month: number): CalendarDate {
  const date = new Date(year, month, 0);
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

function inRange(date: CalendarDate, from: CalendarDate, to: CalendarDate): boolean {
  return compareDates(date, from) >= 0 && compareDates(date, to) <= 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function rate(part: number, base: number): number | null {
  if (base <= 0) return null;
  return round1((part / base) * 100);
}

function clientLabel(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed || UNASSIGNED_CLIENT;
}

function isCountedExit(resource: { personnelStatus?: string; archived?: boolean }): boolean {
  return resource.personnelStatus === 'cesado' || resource.personnelStatus === 'archivado' || !!resource.archived;
}

function spellFromResource(resource: Resource, clientName: string): TurnoverSpell | null {
  if (resource.type !== ResourceType.PERSONNEL) return null;
  const identifier = (resource.dni || resource.name || '').trim();
  const end = parseCalendarDate(resource.endDate);
  return {
    id: resource.id,
    sharedKey: resource.isShared && identifier ? identifier : null,
    clientName,
    start: parseCalendarDate(resource.startDate),
    end,
    exitDate: isCountedExit(resource) ? end : null,
  };
}

export function buildTurnoverSpells(
  units: Array<{ id: string; clientName?: string; resources?: Resource[] }>,
  archived: Array<Resource & { originalUnitId?: string }>
): TurnoverSpell[] {
  const clientByUnitId = new Map(units.map((unit) => [unit.id, clientLabel(unit.clientName)]));
  const spells: TurnoverSpell[] = [];
  const seenIds = new Set<string>();

  units.forEach((unit) => {
    const clientName = clientLabel(unit.clientName);
    (unit.resources || []).forEach((resource) => {
      const spell = spellFromResource(resource, clientName);
      if (!spell || seenIds.has(spell.id)) return;
      seenIds.add(spell.id);
      spells.push(spell);
    });
  });

  archived.forEach((resource) => {
    if (!resource.originalUnitId || seenIds.has(resource.id)) return;
    const clientName = clientByUnitId.get(resource.originalUnitId);
    if (!clientName) return;
    const spell = spellFromResource({ ...resource, archived: true }, clientName);
    if (!spell) return;
    seenIds.add(spell.id);
    spells.push(spell);
  });

  return spells;
}

function countSpells(spells: TurnoverSpell[], matches: (spell: TurnoverSpell) => boolean): number {
  const shared = new Set<string>();
  let unique = 0;
  spells.forEach((spell) => {
    if (!matches(spell)) return;
    if (spell.sharedKey) shared.add(spell.sharedKey);
    else unique += 1;
  });
  return unique + shared.size;
}

export function listTurnoverMonths(today = new Date(), months = 12): Array<{ key: string; label: string; start: CalendarDate; end: CalendarDate; entryEnd: CalendarDate }> {
  const horizon = Math.max(1, months);
  const current: CalendarDate = { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };
  const result = [];

  for (let offset = horizon - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    const start: CalendarDate = { y: year, m: month, d: 1 };
    const end = lastDayOfMonth(year, month);
    const isCurrent = year === current.y && month === current.m;
    result.push({
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: `${MONTH_LABELS[month - 1]} ${String(year).slice(2)}`,
      start,
      end,
      entryEnd: isCurrent && compareDates(current, end) < 0 ? current : end,
    });
  }

  return result;
}

/**
 * Serie mensual de rotación, tasa de ingreso y tasa de salida.
 * Rotación = (ingresos + salidas) / personal al inicio del mes.
 * El personal compartido se cuenta una sola vez dentro del filtro de clientes.
 */
export function computePersonnelTurnoverHistory(
  spells: TurnoverSpell[],
  clients: string[] | null,
  today = new Date(),
  months = 12
): TurnoverMonthPoint[] {
  const allowed = clients == null ? null : new Set(clients);
  const scoped = allowed == null ? spells : spells.filter((spell) => allowed.has(spell.clientName));

  return listTurnoverMonths(today, months).map((month) => {
    const inicio = countSpells(scoped, (spell) => {
      if (!spell.start || compareDates(spell.start, month.start) > 0) return false;
      if (spell.end && compareDates(spell.end, month.start) <= 0) return false;
      return true;
    });
    const ingresos = countSpells(scoped, (spell) => !!spell.start && inRange(spell.start, month.start, month.entryEnd));
    const salidas = countSpells(scoped, (spell) => !!spell.exitDate && inRange(spell.exitDate, month.start, month.end));
    const tasaIngreso = rate(ingresos, inicio);
    const tasaSalida = rate(salidas, inicio);
    const rotacion = inicio > 0 ? round1(((ingresos + salidas) / inicio) * 100) : null;

    return {
      key: month.key,
      label: month.label,
      inicio,
      ingresos,
      salidas,
      rotacion,
      tasaIngreso,
      tasaSalida,
    };
  });
}
