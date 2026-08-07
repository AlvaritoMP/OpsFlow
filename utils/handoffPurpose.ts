import type { WorkerSnapshot } from '../types';

/**
 * Presentaciones ATS = flujo activo.
 * Solo hire/legacy explícito queda fuera (Recepción ATS archivo).
 */
export function isPresentationSnapshot(snapshot?: WorkerSnapshot | null): boolean {
  if (!snapshot?.meta) return true;
  const purpose = String(snapshot.meta.purpose ?? '').trim().toLowerCase();
  if (purpose === 'hire' || purpose === 'legacy' || purpose === 'contratacion') return false;
  if (purpose === 'presentation') return true;
  const version = Number(snapshot.meta.snapshotVersion ?? 0);
  if (!Number.isNaN(version) && version >= 2) return true;
  return true;
}

export function resolveHandoffPurpose(
  snapshot?: WorkerSnapshot | null,
  storedPurpose?: string | null,
): 'presentation' | null {
  if (storedPurpose === 'presentation') return 'presentation';
  if (storedPurpose === 'hire' || storedPurpose === 'legacy') return null;
  return isPresentationSnapshot(snapshot) ? 'presentation' : null;
}
