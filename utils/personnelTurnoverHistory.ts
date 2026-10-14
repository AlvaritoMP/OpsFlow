import { ResourceType } from '../types';

/**
 * Misma fórmula que la tarjeta "Rotación mensual" del dashboard, aplicada a cada mes:
 * rotación = (nuevos + salidas) / personal al inicio × 100.
 * Tasa de ingreso = nuevos / inicio. Tasa de salida = salidas / inicio.
 */
export interface TurnoverMonthPoint {
  key: string;
  label: string;
  monthName: string;
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

/** Misma lectura de fecha de cese que la tarjeta: calendario local, sin corrimiento UTC. */
function endDateInMonth(value: string, firstDay: Date, lastDay: Date): boolean {
  const dateOnly = value.split('T')[0];
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!year || !month || !day) return false;
  const endDateOnly = new Date(year, month - 1, day);
  const firstDayOnly = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate());
  const lastDayOnly = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate());
  return endDateOnly >= firstDayOnly && endDateOnly <= lastDayOnly;
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
  if (clients == null) return archived;
  const allowed = new Set(clients);
  const clientByUnitId = new Map(units.map((unit) => [unit.id, clientLabel(unit.clientName)]));
  return archived.filter((person) => {
    if (!person.originalUnitId) return false;
    const client = clientByUnitId.get(person.originalUnitId);
    return !!client && allowed.has(client);
  });
}

function countArchivedExits(archived: ArchivedTurnoverResource[], firstDay: Date, lastDay: Date): number {
  const seen = new Set<string>();
  let count = 0;
  archived.forEach((person) => {
    if (!person.endDate || !endDateInMonth(person.endDate, firstDay, lastDay)) return;
    const identifier = person.dni || person.id || person.name;
    if (seen.has(identifier as string)) return;
    seen.add(identifier as string);
    count += 1;
  });
  return count;
}

export function computePersonnelTurnoverHistory(
  units: TurnoverUnit[],
  archived: ArchivedTurnoverResource[],
  clients: string[] | null,
  today = new Date(),
  months = 12
): TurnoverMonthPoint[] {
  const horizon = Math.max(1, months);
  const personnel = resourcesInScope(units, clients);
  const archivedScope = archivedInScope(units, archived, clients);
  const points: TurnoverMonthPoint[] = [];

  for (let offset = horizon - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    const year = cursor.getFullYear();
    const monthIndex = cursor.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const isCurrent = year === today.getFullYear() && monthIndex === today.getMonth();
    const entryUntil = isCurrent ? today : lastDay;

    const inicio = countPeople(personnel, (resource) => {
      const startDate = resource.startDate ? new Date(resource.startDate) : null;
      const endDate = resource.endDate ? new Date(resource.endDate) : null;
      if (!startDate) return false;
      if (startDate > firstDay) return false;
      if (endDate && endDate <= firstDay) return false;
      return true;
    });

    const ingresos = countPeople(personnel, (resource) => {
      if (resource.archived || resource.personnelStatus === 'cesado') return false;
      if (!resource.startDate) return false;
      const startDate = new Date(resource.startDate);
      return startDate >= firstDay && startDate <= entryUntil;
    });

    const salidasDeUnidades = countPeople(personnel, (resource) => {
      const isCesadoOrArchivado = resource.personnelStatus === 'cesado' || resource.personnelStatus === 'archivado' || !!resource.archived;
      if (!isCesadoOrArchivado || !resource.endDate) return false;
      return endDateInMonth(resource.endDate, firstDay, lastDay);
    }).total;

    const salidasArchivados = countArchivedExits(archivedScope, firstDay, lastDay);
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
