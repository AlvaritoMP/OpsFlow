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
  workDays?: string[];
  entryTime?: string;
  exitTime?: string;
  jornadaType?: string;
  laborRegime?: string;
  mobilityBonus?: number;
  familyAllowance?: boolean;
  externalId?: string;
  /** Campos precargados desde ATS o intake OpsFlow (puesto y localidad los elige el operador) */
  prefilledFields: string[];
}

function normalizeDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
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
    opsflowIntake: item.opsflowIntake ?? undefined,
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
  const complementary =
    item.complementary ?? item.workerSnapshot.complementary ?? undefined;
  const prefilledFields: string[] = [];

  const name = resolveHandoffDisplayName({
    snapshot: item.workerSnapshot,
    workerName: item.workerName,
    identity,
  });
  if (name) prefilledFields.push('name');

  const dni =
    identity.dni?.trim() ||
    (typeof complementary?.nroDocumento === 'string' ? complementary.nroDocumento.trim() : '') ||
    '';
  if (dni) prefilledFields.push('dni');

  const phone = (
    identity.phone?.trim() ||
    identity.phone2?.trim() ||
    (typeof complementary?.telefono === 'string' ? complementary.telefono.trim() : '') ||
    ''
  ).trim();
  if (phone) prefilledFields.push('phone');

  const startDate = normalizeDate(fields.hireDate);
  if (startDate) prefilledFields.push('startDate');

  const intake = item.opsflowIntake;
  const monthlySalary =
    parseSalary(intake?.monthlySalary) ?? parseSalary(fields.agreedSalary);
  if (monthlySalary !== undefined) prefilledFields.push('monthlySalary');

  const birthDate = normalizeDate(
    fields.birthDate ?? fields.fechaNacimiento ?? complementary?.fechaNacimiento,
  );
  if (birthDate) prefilledFields.push('birthDate');

  const shift = intake?.shift?.trim() || '';
  if (shift) prefilledFields.push('shift');

  const workDays = Array.isArray(intake?.workDays)
    ? intake!.workDays!.filter((d) => Boolean(d?.trim()))
    : [];
  if (workDays.length > 0) prefilledFields.push('workDays');

  const entryTime = intake?.entryTime?.trim() || '';
  if (entryTime) prefilledFields.push('entryTime');

  const exitTime = intake?.exitTime?.trim() || '';
  if (exitTime) prefilledFields.push('exitTime');

  const jornadaType = intake?.jornadaType?.trim() || '';
  if (jornadaType) prefilledFields.push('jornadaType');

  const laborRegime = intake?.laborRegime?.trim() || '';
  if (laborRegime) prefilledFields.push('laborRegime');

  const mobilityBonus =
    intake?.mobilityBonus === null || intake?.mobilityBonus === undefined
      ? undefined
      : Number(intake.mobilityBonus);
  if (mobilityBonus !== undefined && Number.isFinite(mobilityBonus) && mobilityBonus >= 0) {
    prefilledFields.push('mobilityBonus');
  }

  const familyAllowance =
    intake?.familyAllowance === true
      ? true
      : intake?.familyAllowance === false
        ? false
        : undefined;
  if (familyAllowance !== undefined) prefilledFields.push('familyAllowance');

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
    shift,
    monthlySalary,
    workDays,
    entryTime,
    exitTime,
    jornadaType,
    laborRegime,
    mobilityBonus:
      mobilityBonus !== undefined && Number.isFinite(mobilityBonus) && mobilityBonus >= 0
        ? mobilityBonus
        : undefined,
    familyAllowance,
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
