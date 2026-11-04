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
  const identityBag = identity as WorkerSnapshotIdentity & Record<string, unknown>;
  const fields = snapshot?.fields ?? {};

  return {
    nombres: pickFirst(
      identityBag.nombres,
      identityBag.nombre,
      identityBag.Nombre,
      fields.nombres,
      fields.nombre,
      fields.Nombre,
      fields.firstName,
      fields.givenName,
      fields.nombresCompletos,
    ),
    apellidoPaterno: pickFirst(
      identityBag.apellidoPaterno,
      identityBag['Apellido Paterno'],
      fields.apellidoPaterno,
      fields.apellido_paterno,
      fields['Apellido Paterno'],
      fields.paternalSurname,
      fields.apellidoPaternoCandidato,
    ),
    apellidoMaterno: pickFirst(
      identityBag.apellidoMaterno,
      identityBag['Apellido Materno'],
      fields.apellidoMaterno,
      fields.apellido_materno,
      fields['Apellido Materno'],
      fields.maternalSurname,
      fields.apellidoMaternoCandidato,
    ),
  };
}

/** Marcadores que RRHH usa cuando falta un apellido (no son parte del nombre). */
const PLACEHOLDER_NAME_PART = /^(x{2,}|nm|s\/n|n\/a|sn|nd)$/i;

export function isPlaceholderNamePart(value: string): boolean {
  return PLACEHOLDER_NAME_PART.test(value.trim());
}

/** Quita tokens como "xx" o "Nm" que vienen pegados al nombre. */
export function sanitizePersonName(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part && !isPlaceholderNamePart(part))
    .join(' ')
    .trim();
}

/** Compone nombre completo: Nombres + Apellido Paterno + Apellido Materno. */
export function composeFullNameFromParts(parts: HandoffNameParts): string {
  return sanitizePersonName(
    [parts.nombres, parts.apellidoPaterno, parts.apellidoMaterno].filter(Boolean).join(' '),
  );
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

  return sanitizePersonName(
    pickFirst(
      options.identity?.fullName,
      options.snapshot?.identity?.fullName,
      options.workerName,
    ),
  );
}
