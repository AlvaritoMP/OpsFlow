import { ResourceType } from '../types';

/**
 * Rotación mensual del dashboard y de la serie histórica.
 * Rotación = (ingresos + salidas) / personal activo al cierre del mes × 100.
 * Un ingreso o una salida cuenta si la fecha cae en el mes, aunque la persona
 * haya durado pocos días o ya esté archivada.
 */
export interface TurnoverMonthPoint {
  key: string;
  label: string;
  monthName: string;
  /** Personal que seguía activo el último día del mes (hoy, si el mes no ha cerrado). */
  inicio: number;
  ingresos: number;
  ingresosUnicos: number;
  ingresosCompartidos: number;
  salidas: number;
  salidasDeUnidades: number;
  salidasArchivados: number;
  rotacion: number;
  tasaIngreso: number;
  tasaSalida: number;
}

interface TurnoverUnit {
  id: string;
  clientName?: string;
  resources?: TurnoverResource[];
}

interface TurnoverResource {
  id?: string;
  type?: string;
  archived?: boolean;
  personnelStatus?: string;
  startDate?: string;
  endDate?: string;
  isShared?: boolean;
  dni?: string;
  name?: string;
}

interface ArchivedTurnoverResource extends TurnoverResource {
  originalUnitId?: string;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const UNASSIGNED_CLIENT = 'Sin cliente';

function clientLabel(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed || UNASSIGNED_CLIENT;
}

function rate(part: number, base: number): number {
  if (base <= 0) return 0;
  return (part / base) * 100;
}

/** Fecha de calendario local. Evita que YYYY-MM-DD se corra al día anterior por UTC. */
function parseCalendarDate(value?: string | null): Date | null {
  if (!value) return null;
  const match = value.trim().slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function inInclusiveRange(date: Date, from: Date, to: Date): boolean {
  return date >= from && date <= to;
}

function isCountedExit(resource: TurnoverResource): boolean {
  return resource.personnelStatus === 'cesado' || resource.personnelStatus === 'archivado' || !!resource.archived;
}

function isPersonnel(resource: TurnoverResource): boolean {
  return resource.type === ResourceType.PERSONNEL;
}

function countPeople(resources: TurnoverResource[], matches: (resource: TurnoverResource) => boolean): { total: number; unique: number; shared: number } {
  const sharedIds = new Set<string>();
  let unique = 0;
  let shared = 0;

  resources.forEach((resource) => {
    if (!matches(resource)) return;
    if (resource.isShared) {
      const identifier = resource.dni || resource.name;
      if (!sharedIds.has(identifier as string)) {
        sharedIds.add(identifier as string);
        shared += 1;
      }
      return;
    }
    unique += 1;
  });

  return { total: unique + shared, unique, shared };
}

function resourcesInScope(units: TurnoverUnit[], clients: string[] | null): TurnoverResource[] {
  const allowed = clients == null ? null : new Set(clients);
  const resources: TurnoverResource[] = [];
  units.forEach((unit) => {
    if (allowed && !allowed.has(clientLabel(unit.clientName))) return;
    (unit.resources || []).forEach((resource) => {
      if (isPersonnel(resource)) resources.push(resource);
    });
  });
  return resources;
}

function archivedInScope(units: TurnoverUnit[], archived: ArchivedTurnoverResource[], clients: string[] | null): ArchivedTurnoverResource[] {
  const allowed = clients == null ? null : new Set(clients);
  const clientByUnitId = new Map(units.map((unit) => [unit.id, clientLabel(unit.clientName)]));
  return archived.filter((person) => {
    if (!person.originalUnitId) return false;
    const client = clientByUnitId.get(person.originalUnitId);
    if (!client) return false;
    return allowed == null || allowed.has(client);
  });
}

function employmentSpells(units: TurnoverUnit[], archived: ArchivedTurnoverResource[], clients: string[] | null): TurnoverResource[] {
  const onUnits = resourcesInScope(units, clients);
  const seenIds = new Set(onUnits.map((resource) => resource.id).filter((id): id is string => !!id));
  const fromArchive = archivedInScope(units, archived, clients)
    .filter((person) => !person.id || !seenIds.has(person.id))
    .map((person) => ({ ...person, archived: true }));
  return [...onUnits, ...fromArchive];
}

export function computePersonnelTurnoverHistory(
  units: TurnoverUnit[],
  archived: ArchivedTurnoverResource[],
  clients: string[] | null,
  today = new Date(),
  months = 12
): TurnoverMonthPoint[] {
  const horizon = Math.max(1, months);
  const personnel = employmentSpells(units, archived, clients);
  const unitIds = new Set(
    resourcesInScope(units, clients).map((resource) => resource.id).filter((id): id is string => !!id)
  );
  const points: TurnoverMonthPoint[] = [];

  for (let offset = horizon - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    const year = cursor.getFullYear();
    const monthIndex = cursor.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const isCurrent = year === today.getFullYear() && monthIndex === today.getMonth();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const entryUntil = isCurrent && todayDate < lastDay ? todayDate : lastDay;

    const closeDate = entryUntil;
    const inicio = countPeople(personnel, (resource) => {
      const startDate = parseCalendarDate(resource.startDate);
      if (!startDate || startDate > closeDate) return false;
      if (!isCountedExit(resource)) return true;
      const endDate = parseCalendarDate(resource.endDate);
      return !!endDate && endDate > closeDate;
    });

    const ingresos = countPeople(personnel, (resource) => {
      const startDate = parseCalendarDate(resource.startDate);
      return !!startDate && inInclusiveRange(startDate, firstDay, entryUntil);
    });

    const leftInMonth = (resource: TurnoverResource) => {
      const endDate = parseCalendarDate(resource.endDate);
      return isCountedExit(resource) && !!endDate && inInclusiveRange(endDate, firstDay, closeDate);
    };
    const salidasDeUnidades = countPeople(personnel, (resource) => !!resource.id && unitIds.has(resource.id) && leftInMonth(resource)).total;
    const salidasArchivados = countPeople(personnel, (resource) => (!resource.id || !unitIds.has(resource.id)) && leftInMonth(resource)).total;
    const salidas = salidasDeUnidades + salidasArchivados;

    points.push({
      key: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
      label: `${MONTH_LABELS[monthIndex]} ${String(year).slice(2)}`,
      monthName: MONTH_NAMES[monthIndex],
      inicio: inicio.total,
      ingresos: ingresos.total,
      ingresosUnicos: ingresos.unique,
      ingresosCompartidos: ingresos.shared,
      salidas,
      salidasDeUnidades,
      salidasArchivados,
      rotacion: rate(ingresos.total + salidas, inicio.total),
      tasaIngreso: rate(ingresos.total, inicio.total),
      tasaSalida: rate(salidas, inicio.total),
    });
  }

  return points;
}
