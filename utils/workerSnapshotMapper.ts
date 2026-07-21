import type { InboundHandoffItem, ResourceInboundSourceData } from '../types';
import { resolveHandoffDisplayName } from './handoffNameParts';

export interface HandoffWorkerPrefill {
  name: string;
  dni: string;
  phone: string;
  puesto: string;
  localidad: string;
  birthDate: string;
  startDate: string;
  endDate: string;
  shift: string;
  monthlySalary?: number;
  externalId?: string;
  /** Campos OpsFlow pre-completados desde ATS (puesto y localidad los elige el operador) */
  prefilledFields: string[];
}

function normalizeDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
}

function parseSalary(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(String(value).replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

export function buildResourceInboundSourceData(
  item: InboundHandoffItem,
  context?: { sourcePackageId?: string; sourceApp?: string },
): ResourceInboundSourceData {
  return {
    sourceApp: context?.sourceApp ?? item.workerSnapshot.meta?.sourceApp ?? 'Opalo ATS',
    sourcePackageId: context?.sourcePackageId,
    sourceCandidateId:
      item.sourceCandidateId ?? item.workerSnapshot.meta?.sourceCandidateId ?? undefined,
    sourceProcessId:
      item.sourceProcessId ?? item.workerSnapshot.meta?.sourceProcessId ?? undefined,
    handoffItemId: item.id,
    capturedAt: item.workerSnapshot.meta?.capturedAt,
    workerSnapshot: item.workerSnapshot,
  };
}

export function countStoredAtsFields(snapshot: InboundHandoffItem['workerSnapshot']): number {
  const identityCount = Object.values(snapshot.identity ?? {}).filter(
    (v) => v !== null && v !== undefined && v !== '',
  ).length;
  const fieldKeys =
    snapshot.meta?.includedFieldKeys ??
    Object.keys(snapshot.fields ?? {}).filter(
      (k) =>
        snapshot.fields?.[k] !== null &&
        snapshot.fields?.[k] !== undefined &&
        snapshot.fields?.[k] !== '',
    );
  return identityCount + fieldKeys.length;
}

export function mapHandoffItemToWorkerPrefill(item: InboundHandoffItem): HandoffWorkerPrefill {
  const identity = item.workerSnapshot.identity ?? {};
  const fields = item.workerSnapshot.fields ?? {};
  const prefilledFields: string[] = [];

  const name = resolveHandoffDisplayName({
    snapshot: item.workerSnapshot,
    workerName: item.workerName,
    identity,
  });
  if (name) prefilledFields.push('name');

  const dni = identity.dni?.trim() ?? '';
  if (dni) prefilledFields.push('dni');

  const phone = (identity.phone?.trim() || identity.phone2?.trim() || '').trim();
  if (phone) prefilledFields.push('phone');

  const startDate = normalizeDate(fields.hireDate);
  if (startDate) prefilledFields.push('startDate');

  const monthlySalary = parseSalary(fields.agreedSalary);
  if (monthlySalary !== undefined) prefilledFields.push('monthlySalary');

  const birthDate = normalizeDate(fields.birthDate);
  if (birthDate) prefilledFields.push('birthDate');

  const externalId = item.sourceCandidateId ?? item.workerSnapshot.meta?.sourceCandidateId;

  return {
    name,
    dni,
    phone,
    puesto: '',
    localidad: '',
    birthDate,
    startDate,
    endDate: '',
    shift: '',
    monthlySalary,
    externalId: externalId ? String(externalId) : undefined,
    prefilledFields,
  };
}

export const HANDOFF_FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  fullName: 'Nombre completo',
  nombres: 'Nombres',
  apellidoPaterno: 'Apellido paterno',
  apellidoMaterno: 'Apellido materno',
  apellido_paterno: 'Apellido paterno',
  apellido_materno: 'Apellido materno',
  /** Etiqueta del camino OpsFlow/ATS (genérica; no tipifica DNI vs CE vs pasaporte). */
  dni: 'DNI',
  email: 'Correo',
  phone: 'Teléfono',
  phone2: 'Teléfono 2',
  birthDate: 'Fecha de nacimiento',
  startDate: 'Fecha de ingreso',
  hireDate: 'Fecha de contratación',
  monthlySalary: 'Salario mensual',
  agreedSalary: 'Salario acordado',
  address: 'Dirección',
  direccion: 'Dirección',
  province: 'Provincia',
  provincia: 'Provincia',
  district: 'Distrito',
  distrito: 'Distrito',
  processTitle: 'Proceso / puesto',
  clientName: 'Cliente',
  sexo: 'Sexo',
  gender: 'Género',
  estadoCivil: 'Estado civil',
  turno: 'Turno',
  shift: 'Turno',
};
