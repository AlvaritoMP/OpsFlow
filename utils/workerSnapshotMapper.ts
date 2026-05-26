import type { InboundHandoffItem, Position, ResourceInboundSourceData } from '../types';

export interface HandoffWorkerPrefill {
  name: string;
  dni: string;
  puesto: string;
  localidad: string;
  birthDate: string;
  startDate: string;
  endDate: string;
  shift: string;
  monthlySalary?: number;
  externalId?: string;
  /** Campos OpsFlow pre-completados desde el paquete ATS (localidad excluida: es operativa) */
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

function matchPosition(processTitle: string | undefined, positions: Position[]): string {
  if (!processTitle?.trim()) return '';
  const normalized = processTitle.trim().toLowerCase();
  const exact = positions.find((p) => p.name.trim().toLowerCase() === normalized);
  if (exact) return exact.name;
  const partial = positions.find(
    (p) =>
      p.name.trim().toLowerCase().includes(normalized) ||
      normalized.includes(p.name.trim().toLowerCase()),
  );
  return partial?.name ?? processTitle.trim();
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

export function mapHandoffItemToWorkerPrefill(
  item: InboundHandoffItem,
  positions: Position[] = [],
): HandoffWorkerPrefill {
  const identity = item.workerSnapshot.identity ?? {};
  const fields = item.workerSnapshot.fields ?? {};
  const prefilledFields: string[] = [];

  const name = (identity.fullName?.trim() || item.workerName?.trim() || '').trim();
  if (name) prefilledFields.push('name');

  const dni = identity.dni?.trim() ?? '';
  if (dni) prefilledFields.push('dni');

  const processTitle =
    typeof fields.processTitle === 'string' ? fields.processTitle.trim() : '';
  const puesto = matchPosition(processTitle, positions);
  if (puesto) prefilledFields.push('puesto');

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
    puesto,
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
  dni: 'DNI',
  puesto: 'Puesto',
  birthDate: 'Fecha de nacimiento',
  startDate: 'Fecha de ingreso',
  monthlySalary: 'Salario mensual',
};
