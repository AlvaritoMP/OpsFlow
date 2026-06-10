import type {
  HrOpalosisIngresoFields,
  HrOutboundWorkerSnapshot,
  InboundHandoffItem,
  Resource,
  Unit,
} from '../types';
import { splitFullName, toOpalosisDate } from './hrIntegration';

function normalizeIsoDate(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = toOpalosisDate(raw);
  return parsed ?? undefined;
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (v !== null && v !== undefined && String(v).trim()) {
      return String(v).trim();
    }
  }
  return '';
}

export interface EnqueueAssignmentInput {
  resource: Resource;
  unit: Unit;
  handoffItem: InboundHandoffItem;
  sourcePackageId?: string;
  sourceApp?: string;
  opalosisUnidadId?: number | null;
  empresaCodigo?: number | null;
}

export function buildOutboundWorkerSnapshot(input: EnqueueAssignmentInput): HrOutboundWorkerSnapshot {
  const { resource, unit, handoffItem, sourcePackageId, sourceApp } = input;
  const ats = resource.inboundSourceData?.workerSnapshot ?? handoffItem.workerSnapshot;

  return {
    capturedAt: new Date().toISOString(),
    opsflow: {
      resourceId: resource.id,
      unitId: unit.id,
      unitName: unit.name,
      clientName: unit.clientName,
      name: resource.name,
      dni: resource.dni,
      puesto: resource.puesto,
      localidad: resource.localidad,
      phone: resource.phone,
      birthDate: resource.birthDate,
      startDate: resource.startDate,
      endDate: resource.endDate,
      assignedShift: resource.assignedShift,
      assignedZones: resource.assignedZones,
      monthlySalary: resource.monthlySalary,
      personnelStatus: resource.personnelStatus,
      externalId: resource.externalId,
    },
    ats: {
      sourceApp: sourceApp ?? resource.inboundSourceData?.sourceApp ?? 'Opalo ATS',
      sourcePackageId: sourcePackageId ?? resource.inboundSourceData?.sourcePackageId,
      sourceCandidateId:
        handoffItem.sourceCandidateId ?? resource.inboundSourceData?.sourceCandidateId,
      sourceProcessId: handoffItem.sourceProcessId ?? resource.inboundSourceData?.sourceProcessId,
      handoffItemId: handoffItem.id,
      workerName: handoffItem.workerName,
      identity: ats?.identity,
      fields: ats?.fields,
      meta: ats?.meta,
    },
  };
}

export function mapSnapshotToHrFields(
  snapshot: HrOutboundWorkerSnapshot,
  refOperaciones: string,
  options?: {
    opalosisUnidadId?: number | null;
    empresaCodigo?: number | null;
  },
): HrOpalosisIngresoFields {
  const { apellido_paterno, apellido_materno, nombres } = splitFullName(
    snapshot.opsflow.name || snapshot.ats.workerName || '',
  );

  const identity = snapshot.ats.identity ?? {};
  const fields = snapshot.ats.fields ?? {};

  const fechaIngreso =
    normalizeIsoDate(snapshot.opsflow.startDate) ??
    normalizeIsoDate(fields.hireDate as string | undefined) ??
    new Date().toISOString().slice(0, 10);

  const fechaNacimiento =
    normalizeIsoDate(snapshot.opsflow.birthDate) ??
    normalizeIsoDate(fields.birthDate as string | undefined) ??
    '';

  const hrFields: HrOpalosisIngresoFields = {
    tipo: 'ingreso',
    empresa_codigo: options?.empresaCodigo ?? 103,
    tipo_documento: 'DNI',
    documento: pickString(snapshot.opsflow.dni, identity.dni),
    apellido_paterno,
    apellido_materno,
    nombres: nombres || pickString(identity.fullName, snapshot.opsflow.name),
    sexo: pickString(fields.sexo, fields.gender) || 'M',
    cargo: pickString(snapshot.opsflow.puesto, fields.processTitle),
    unidad_id: options?.opalosisUnidadId ?? 0,
    fecha_ingreso: fechaIngreso,
    fecha_nacimiento: fechaNacimiento,
    estado_civil: pickString(fields.estadoCivil, fields.estado_civil) || 'SOLTERO',
    correo_personal: pickString(identity.email, fields.email, fields.correo),
    ref_operaciones: refOperaciones,
    pais: pickString(fields.pais, fields.country) || 'PE',
    asignacion_familiar: false,
  };

  const telefono = pickString(snapshot.opsflow.phone, identity.phone, identity.phone2, fields.phone);
  if (telefono) hrFields.telefono = telefono;

  const direccion = pickString(
    fields.address,
    fields.direccion,
    snapshot.opsflow.localidad,
    fields.province,
    fields.district,
  );
  if (direccion) hrFields.direccion = direccion;

  return hrFields;
}

export function listHrFieldWarnings(fields: HrOpalosisIngresoFields): string[] {
  const warnings: string[] = [];
  if (!fields.documento) warnings.push('Sin documento');
  if (!fields.correo_personal) warnings.push('Sin correo personal');
  if (!fields.fecha_nacimiento) warnings.push('Sin fecha de nacimiento');
  if (!fields.unidad_id) warnings.push('Sin unidad_id Opalosis (configurar mapeo)');
  if (!fields.cargo) warnings.push('Sin cargo');
  return warnings;
}
