import type { WorkerSnapshot } from '../types';

/** Presentation if meta.purpose === 'presentation' and/or snapshotVersion >= 3 */
export function isPresentationSnapshot(snapshot?: WorkerSnapshot | null): boolean {
  if (!snapshot?.meta) return false;
  const purpose = String(snapshot.meta.purpose ?? '').trim().toLowerCase();
  if (purpose === 'presentation') return true;
  const version = Number(snapshot.meta.snapshotVersion ?? 0);
  return !Number.isNaN(version) && version >= 3;
}

export function resolveHandoffPurpose(
  snapshot?: WorkerSnapshot | null,
  storedPurpose?: string | null,
): 'presentation' | null {
  if (storedPurpose === 'presentation') return 'presentation';
  return isPresentationSnapshot(snapshot) ? 'presentation' : null;
}
