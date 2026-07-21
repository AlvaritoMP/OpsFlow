import type { WorkerSnapshot, WorkerSnapshotIdentity } from '../types';

export interface HandoffNameParts {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
}

function asTrimmedString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function pickFirst(...values: unknown[]): string {
  for (const value of values) {
    const text = asTrimmedString(value);
    if (text) return text;
  }
  return '';
}

/**
 * Lee nombres y apellidos desde identity o fields del snapshot ATS
 * (acepta aliases comunes del export de Opalo ATS).
 */
export function extractHandoffNameParts(
  snapshot?: WorkerSnapshot | null,
  identityOverride?: WorkerSnapshotIdentity | null,
): HandoffNameParts {
  const identity = identityOverride ?? snapshot?.identity ?? {};
  const fields = snapshot?.fields ?? {};

  return {
    nombres: pickFirst(
      identity.nombres,
      fields.nombres,
      fields.firstName,
      fields.givenName,
      fields.nombresCompletos,
    ),
    apellidoPaterno: pickFirst(
      identity.apellidoPaterno,
      fields.apellidoPaterno,
      fields.apellido_paterno,
      fields.paternalSurname,
      fields.apellidoPaternoCandidato,
    ),
    apellidoMaterno: pickFirst(
      identity.apellidoMaterno,
      fields.apellidoMaterno,
      fields.apellido_materno,
      fields.maternalSurname,
      fields.apellidoMaternoCandidato,
    ),
  };
}

/** Compone nombre completo: Nombres + Apellido Paterno + Apellido Materno. */
export function composeFullNameFromParts(parts: HandoffNameParts): string {
  return [parts.nombres, parts.apellidoPaterno, parts.apellidoMaterno]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

export function hasStructuredNameParts(parts: HandoffNameParts): boolean {
  return Boolean(parts.nombres || parts.apellidoPaterno || parts.apellidoMaterno);
}

/**
 * Nombre para bandeja / registro OpsFlow:
 * 1) partes estructuradas si existen
 * 2) fullName / workerName
 */
export function resolveHandoffDisplayName(options: {
  snapshot?: WorkerSnapshot | null;
  workerName?: string | null;
  identity?: WorkerSnapshotIdentity | null;
}): string {
  const parts = extractHandoffNameParts(options.snapshot, options.identity);
  const composed = composeFullNameFromParts(parts);
  if (composed) return composed;

  return pickFirst(
    options.identity?.fullName,
    options.snapshot?.identity?.fullName,
    options.workerName,
  );
}
