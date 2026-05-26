import type { Unit } from '../types';

export interface UnitPositionOption {
  key: string;
  positionName: string;
  shift?: string;
  label: string;
  suggestedShift: string;
}

export function formatRequiredShiftLabel(shift?: string): string {
  if (!shift) return '';
  if (shift === 'Day') return 'Mañana';
  if (shift === 'Afternoon') return 'Tarde';
  if (shift === 'Night') return 'Noche';
  return shift;
}

export function mapRequiredShiftToWorkerShift(shift?: string): string {
  if (!shift) return '';
  if (shift === 'Day') return 'Diurno';
  if (shift === 'Afternoon') return 'Tarde';
  if (shift === 'Night') return 'Nocturno';
  return shift;
}

/** Puestos requeridos configurados en la unidad (no catálogo global) */
export function getUnitRequiredPositionOptions(unit: Unit | null): UnitPositionOption[] {
  if (!unit?.requiredPositions?.length) return [];

  const options: UnitPositionOption[] = [];
  const seen = new Set<string>();

  for (const req of unit.requiredPositions) {
    const positionName = (req.positionName || req.positionId || '').trim();
    if (!positionName) continue;

    const key = req.shift ? `${positionName}::${req.shift}` : positionName;
    if (seen.has(key)) continue;
    seen.add(key);

    const shiftLabel = formatRequiredShiftLabel(req.shift);
    options.push({
      key,
      positionName,
      shift: req.shift,
      label: shiftLabel ? `${positionName} (${shiftLabel})` : positionName,
      suggestedShift: mapRequiredShiftToWorkerShift(req.shift),
    });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label, 'es'));
}
