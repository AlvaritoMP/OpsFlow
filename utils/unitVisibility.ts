/** Compara nombres de cliente sin depender de mayúsculas o espacios. */
export function normalizeClientName(name: string | undefined | null): string {
  return (name || '').trim().toLowerCase();
}

export function unitBelongsToLinkedClients(
  unitClientName: string | undefined | null,
  linkedClientNames: string[] | undefined | null
): boolean {
  if (!linkedClientNames?.length) return false;
  const unitName = normalizeClientName(unitClientName);
  if (!unitName) return false;
  return linkedClientNames.some((name) => normalizeClientName(name) === unitName);
}

export function filterUnitsByLinkedClientNames<T extends { clientName?: string }>(
  units: T[],
  linkedClientNames: string[] | undefined | null
): T[] {
  if (!linkedClientNames?.length) return [];
  return units.filter((unit) => unitBelongsToLinkedClients(unit.clientName, linkedClientNames));
}
