import { Unit, UnitStatus } from '../types';

/** Unidades desactivadas no participan en conteos ni procesos operativos del sistema. */
export function isUnitOperational(unit: Pick<Unit, 'status'> | null | undefined): boolean {
  if (!unit) return false;
  return unit.status !== UnitStatus.DEACTIVATED;
}

export function filterOperationalUnits<T extends Pick<Unit, 'status'>>(units: T[]): T[] {
  return units.filter(isUnitOperational);
}
