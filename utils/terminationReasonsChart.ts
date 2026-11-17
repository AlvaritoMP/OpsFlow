import { ResourceType } from '../types';
import { splitTerminationReason } from './terminationReason';

export interface TerminationReasonPoint {
  motivo: string;
  ceses: number;
  share: number;
}

export interface TerminationReasonSummary {
  points: TerminationReasonPoint[];
  total: number;
  undated: number;
}

interface CeseSource {
  id?: string;
  type?: string;
  archived?: boolean;
  personnelStatus?: string | null;
  endDate?: string | null;
  terminationReason?: string | null;
  dni?: string | null;
  name?: string | null;
}

interface CeseUnit {
  id: string;
  resources?: CeseSource[];
}

function calendarDay(value?: string | null): string | null {
  if (!value) return null;
  const day = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function isTermination(resource: CeseSource): boolean {
  return resource.personnelStatus === 'cesado'
    || resource.personnelStatus === 'archivado'
    || resource.archived === true;
}

function isPersonnel(resource: CeseSource): boolean {
  return !resource.type || resource.type === ResourceType.PERSONNEL;
}

export function motiveLabel(reason?: string | null): string {
  const trimmed = reason?.trim() || '';
  if (!trimmed) return 'Sin motivo';
  const split = splitTerminationReason(trimmed);
  if (split.preset && split.preset !== 'Otro') return split.preset;
  return trimmed;
}

function spellKey(resource: CeseSource): string {
  if (resource.id) return resource.id;
  return `${resource.dni || resource.name || 'sin-id'}|${resource.endDate || ''}|${resource.terminationReason || ''}`;
}

/** Ceses y archivos de las unidades visibles, agrupados por motivo y filtrados por fecha de cese. */
export function summarizeTerminationReasons(
  units: CeseUnit[],
  archived: Array<CeseSource & { originalUnitId?: string }>,
  range: { from?: string; to?: string } = {},
): TerminationReasonSummary {
  const unitIds = new Set(units.map((unit) => unit.id));
  const seen = new Set<string>();
  const spells: CeseSource[] = [];

  const push = (resource: CeseSource) => {
    if (!isPersonnel(resource) || !isTermination(resource)) return;
    const key = spellKey(resource);
    if (seen.has(key)) return;
    seen.add(key);
    spells.push(resource);
  };

  units.forEach((unit) => {
    (unit.resources || []).forEach(push);
  });
  archived.forEach((person) => {
    if (!person.originalUnitId || !unitIds.has(person.originalUnitId)) return;
    push(person);
  });

  const from = calendarDay(range.from) || '';
  const to = calendarDay(range.to) || '';
  const counts = new Map<string, number>();
  let undated = 0;
  let total = 0;

  spells.forEach((spell) => {
    const day = calendarDay(spell.endDate);
    if (!day) {
      undated += 1;
      return;
    }
    if (from && day < from) return;
    if (to && day > to) return;
    const label = motiveLabel(spell.terminationReason);
    counts.set(label, (counts.get(label) || 0) + 1);
    total += 1;
  });

  const points = Array.from(counts.entries())
    .map(([motivo, ceses]) => ({
      motivo,
      ceses,
      share: total > 0 ? (ceses / total) * 100 : 0,
    }))
    .sort((a, b) => b.ceses - a.ceses || a.motivo.localeCompare(b.motivo, 'es'));

  return { points, total, undated };
}
