/**
 * Conversión de fechas entre OpsFlow (dd-MM-yyyy en UI) y Opalosis (yyyy-MM-dd en JSON API).
 */

const OPSFLOW_DATE_RE = /^(\d{2})-(\d{2})-(\d{4})$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Convierte dd-MM-yyyy o yyyy-MM-dd → yyyy-MM-dd para la API de Opalosis. */
export function toOpalosisDate(value: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(ISO_DATE_RE);
  if (isoMatch) return trimmed;

  const opsMatch = trimmed.match(OPSFLOW_DATE_RE);
  if (opsMatch) {
    const [, dd, mm, yyyy] = opsMatch;
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

/** Convierte yyyy-MM-dd → dd-MM-yyyy para mostrar en OpsFlow. */
export function toOpsflowDate(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';

  const isoMatch = trimmed.match(ISO_DATE_RE);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd}-${mm}-${yyyy}`;
  }

  const opsMatch = trimmed.match(OPSFLOW_DATE_RE);
  if (opsMatch) return trimmed;

  return trimmed;
}

/** Fecha de hoy en formato dd-MM-yyyy (OpsFlow UI). */
export function todayOpsflowDate(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Valida que una fecha OpsFlow (dd-MM-yyyy) sea válida. */
export function isValidOpsflowDate(value: string): boolean {
  const iso = toOpalosisDate(value);
  if (!iso) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** Genera ref_operaciones: OPS-DDMMYYYY-NN */
export function generateRefOperaciones(sequence: number): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const seq = String(sequence).padStart(2, '0');
  return `OPS-${dd}${mm}${yyyy}-${seq}`;
}

/** Separa nombre completo en apellidos y nombres (heurística peruana). */
export function splitFullName(fullName: string): {
  apellido_paterno: string;
  apellido_materno: string;
  nombres: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { apellido_paterno: '', apellido_materno: '', nombres: '' };
  }
  if (parts.length === 1) {
    return { apellido_paterno: parts[0], apellido_materno: '', nombres: parts[0] };
  }
  if (parts.length === 2) {
    return { apellido_paterno: parts[0], apellido_materno: '', nombres: parts[1] };
  }
  if (parts.length === 3) {
    return { apellido_paterno: parts[0], apellido_materno: parts[1], nombres: parts[2] };
  }
  return {
    apellido_paterno: parts[0],
    apellido_materno: parts[1],
    nombres: parts.slice(2).join(' '),
  };
}

export const HR_EMPRESA_OPTIONS = [
  { code: 103, label: 'Opalo Peru S.A.C.', alias: 'Opalo Peru' },
  { code: 104, label: 'Opalo Intermediación S.A.C.', alias: 'Opalo Intermediación' },
  { code: 153, label: 'Opinter S.A.C.', alias: 'Opinter' },
] as const;

export const HR_TIPO_DOCUMENTO_OPTIONS = ['DNI', 'PASAPORTE', 'CE', 'PTP'] as const;
export const HR_SEXO_OPTIONS = ['M', 'F'] as const;
export const HR_ESTADO_CIVIL_OPTIONS = [
  'SOLTERO',
  'CASADO',
  'CONVIVIENTE',
  'VIUDO',
  'DIVORCIADO',
] as const;

export type HrTipoDocumento = (typeof HR_TIPO_DOCUMENTO_OPTIONS)[number];
export type HrSexo = (typeof HR_SEXO_OPTIONS)[number];
export type HrEstadoCivil = (typeof HR_ESTADO_CIVIL_OPTIONS)[number];
