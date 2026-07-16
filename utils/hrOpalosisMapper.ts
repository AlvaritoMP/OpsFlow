import type {
  HrOpalosisIngresoFields,
  HrOutboundWorkerSnapshot,
  InboundHandoffItem,
  Resource,
  Unit,
} from '../types';
import {
  HR_DEFAULT_OPALO_ID,
  HR_DEFAULT_PAIS_ID,
  HR_SHAREPOINT_DOCS_LIBRARY_URL,
  HR_TIPO_DOCUMENTO_ID_BY_CODE,
  splitFullName,
  toOpalosisDate,
} from './hrIntegration';

/** Payload oficial POST /registro-ingreso (RegistroIngresoDTO). */
export interface OpalosisRegistroIngresoPayload {
  TipoDocumentoId: number | null;
  Documento: string;
  ApellidoPaterno: string | null;
  ApellidoMaterno: string | null;
  Nombres: string | null;
  Sexo: string | null;
  FechaNacimiento: string | null;
  FechaIngreso: string | null;
  Direccion: string | null;
  Telefono: string | null;
  CorreoPersonal: string | null;
  TieneAsignacionFamiliar: boolean | null;
  TieneHijos: boolean | null;
  EmpleadoCargoId: number | null;
  LugarTrabajoId: number | null;
  OpaloId: number | null;
  ModeloContratoId: number | null;
  RegimenLaboralId: number | null;
  MesesContrato: number | null;
  JornadaLaboral: string | null;
  Turno: string | null;
  Sueldo: number | null;
  Movilidad: number | null;
  SistemaPension: string | null;
  BancoPreferencia: string | null;
  NumeroCuentaTrabajador: string | null;
  UrlDocumentoAdjunto: string | null;
  TallaPoloCamisa: string | null;
  TallaCasaca: string | null;
  TallaPantalon: string | null;
  TallaZapatos: number | null;
  PaisId: number | null;
  UbigeoId: number | null;
  SupervisorId: number | null;
  CentroCostoId: number | null;
  EstadoCivilId: number | null;
  Observacion: string | null;
  UsuarioProcesoId: number | null;
  UsuarioOf: string | null;
  PayloadJson: string | null;
}

export interface OpalosisRegistroIngresoResponse {
  Resultado: boolean;
  Mensaje: string;
  MensajeError: string;
  IngresoId?: number;
  IngresoCod?: string;
  FechaRegistro?: string;
}

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

function pickNumber(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function nullIfEmpty(value?: string | null): string | null {
  if (value === null || value === undefined) return null;
  const t = String(value).trim();
  return t ? t : null;
}

export interface EnqueueAssignmentInput {
  resource: Resource;
  unit: Unit;
  handoffItem: InboundHandoffItem;
  sourcePackageId?: string;
  sourceApp?: string;
  opalosisUnidadId?: number | null;
  empresaCodigo?: number | null;
  usuarioOf?: string | null;
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

/** Normaliza hr_fields legacy (snake_case) o actuales (camelCase). */
export function normalizeHrFields(raw: unknown): HrOpalosisIngresoFields | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // Ya en formato nuevo
  if (r.documento !== undefined || r.Documento !== undefined) {
    const documento = pickString(r.documento, r.Documento);
    if (!documento && r.apellidoPaterno === undefined && r.apellido_paterno === undefined) {
      // podría ser vacío
    }

    if (r.apellidoPaterno !== undefined || r.tipoDocumentoId !== undefined) {
      return {
        tipoDocumentoId: pickNumber(r.tipoDocumentoId) ?? 1,
        documento: pickString(r.documento),
        apellidoPaterno: pickString(r.apellidoPaterno),
        apellidoMaterno: pickString(r.apellidoMaterno),
        nombres: pickString(r.nombres),
        sexo: pickString(r.sexo) || 'M',
        fechaIngreso: pickString(r.fechaIngreso) || new Date().toISOString().slice(0, 10),
        fechaNacimiento: nullIfEmpty(pickString(r.fechaNacimiento)) ,
        direccion: nullIfEmpty(pickString(r.direccion)),
        telefono: nullIfEmpty(pickString(r.telefono)),
        correoPersonal: nullIfEmpty(pickString(r.correoPersonal)),
        tieneAsignacionFamiliar: Boolean(r.tieneAsignacionFamiliar ?? false),
        tieneHijos: Boolean(r.tieneHijos ?? false),
        empleadoCargoId: pickNumber(r.empleadoCargoId) ?? null,
        lugarTrabajoId: pickNumber(r.lugarTrabajoId) ?? pickNumber(r.unidad_id) ?? null,
        opaloId: pickNumber(r.opaloId) ?? pickNumber(r.empresa_codigo) ?? HR_DEFAULT_OPALO_ID,
        modeloContratoId: pickNumber(r.modeloContratoId) ?? null,
        regimenLaboralId: pickNumber(r.regimenLaboralId) ?? null,
        mesesContrato: pickNumber(r.mesesContrato) ?? null,
        jornadaLaboral: nullIfEmpty(pickString(r.jornadaLaboral)),
        turno: nullIfEmpty(pickString(r.turno)),
        sueldo: pickNumber(r.sueldo) ?? null,
        movilidad: pickNumber(r.movilidad) ?? 0,
        sistemaPension: nullIfEmpty(pickString(r.sistemaPension)),
        bancoPreferencia: nullIfEmpty(pickString(r.bancoPreferencia)),
        numeroCuentaTrabajador: nullIfEmpty(pickString(r.numeroCuentaTrabajador)),
        urlDocumentoAdjunto: nullIfEmpty(pickString(r.urlDocumentoAdjunto)),
        tallaPoloCamisa: nullIfEmpty(pickString(r.tallaPoloCamisa)),
        tallaCasaca: nullIfEmpty(pickString(r.tallaCasaca)),
        tallaPantalon: nullIfEmpty(pickString(r.tallaPantalon)),
        tallaZapatos: pickNumber(r.tallaZapatos) ?? null,
        paisId: pickNumber(r.paisId) ?? HR_DEFAULT_PAIS_ID,
        ubigeoId: pickNumber(r.ubigeoId) ?? null,
        departamentoId: pickNumber(r.departamentoId) ?? null,
        provinciaId: pickNumber(r.provinciaId) ?? null,
        supervisorId: pickNumber(r.supervisorId) ?? null,
        centroCostoId: pickNumber(r.centroCostoId) ?? null,
        estadoCivilId: pickNumber(r.estadoCivilId) ?? null,
        observacion: nullIfEmpty(pickString(r.observacion)),
        usuarioProcesoId: pickNumber(r.usuarioProcesoId) ?? null,
        usuarioOf: nullIfEmpty(pickString(r.usuarioOf)),
        payloadJson: nullIfEmpty(pickString(r.payloadJson)),
        refOperaciones: nullIfEmpty(pickString(r.refOperaciones, r.ref_operaciones)) ?? undefined,
        labels: (r.labels as HrOpalosisIngresoFields['labels']) ?? undefined,
      };
    }
  }

  // Legacy snake_case
  if (r.apellido_paterno !== undefined || r.tipo_documento !== undefined) {
    const tipoDoc = pickString(r.tipo_documento, 'DNI').toUpperCase();
    return {
      tipoDocumentoId: HR_TIPO_DOCUMENTO_ID_BY_CODE[tipoDoc] ?? 1,
      documento: pickString(r.documento),
      apellidoPaterno: pickString(r.apellido_paterno),
      apellidoMaterno: pickString(r.apellido_materno),
      nombres: pickString(r.nombres),
      sexo: pickString(r.sexo) || 'M',
      fechaIngreso: pickString(r.fecha_ingreso) || new Date().toISOString().slice(0, 10),
      fechaNacimiento: nullIfEmpty(pickString(r.fecha_nacimiento)),
      direccion: nullIfEmpty(pickString(r.direccion)),
      telefono: nullIfEmpty(pickString(r.telefono)),
      correoPersonal: nullIfEmpty(pickString(r.correo_personal)),
      tieneAsignacionFamiliar: Boolean(r.asignacion_familiar ?? false),
      tieneHijos: false,
      empleadoCargoId: null,
      lugarTrabajoId: pickNumber(r.unidad_id) || null,
      opaloId: pickNumber(r.empresa_codigo) ?? HR_DEFAULT_OPALO_ID,
      sueldo: null,
      movilidad: 0,
      paisId: HR_DEFAULT_PAIS_ID,
      refOperaciones: pickString(r.ref_operaciones) || undefined,
      labels: {
        empleadoCargo: pickString(r.cargo) || undefined,
      },
    };
  }

  return null;
}

export function mapSnapshotToHrFields(
  snapshot: HrOutboundWorkerSnapshot,
  refOperaciones: string,
  options?: {
    opalosisUnidadId?: number | null;
    empresaCodigo?: number | null;
    usuarioOf?: string | null;
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
    null;

  const sueldo =
    pickNumber(snapshot.opsflow.monthlySalary, fields.agreedSalary, fields.sueldo, fields.salary) ??
    null;

  const cargoLabel = pickString(snapshot.opsflow.puesto, fields.processTitle, fields.cargo);
  const turno = pickString(snapshot.opsflow.assignedShift, fields.turno, fields.shift) || null;

  return {
    tipoDocumentoId: 1,
    documento: pickString(snapshot.opsflow.dni, identity.dni),
    apellidoPaterno: apellido_paterno,
    apellidoMaterno: apellido_materno,
    nombres: nombres || pickString(identity.fullName, snapshot.opsflow.name),
    sexo: (pickString(fields.sexo, fields.gender) || 'M').slice(0, 1).toUpperCase(),
    fechaIngreso,
    fechaNacimiento,
    direccion: nullIfEmpty(
      pickString(fields.address, fields.direccion, snapshot.opsflow.localidad),
    ),
    telefono: nullIfEmpty(
      pickString(snapshot.opsflow.phone, identity.phone, identity.phone2, fields.phone),
    ),
    correoPersonal: nullIfEmpty(pickString(identity.email, fields.email, fields.correo)),
    tieneAsignacionFamiliar: false,
    tieneHijos: false,
    empleadoCargoId: pickNumber(fields.empleadoCargoId) ?? null,
    lugarTrabajoId: options?.opalosisUnidadId ?? pickNumber(fields.lugarTrabajoId) ?? null,
    opaloId: options?.empresaCodigo ?? HR_DEFAULT_OPALO_ID,
    modeloContratoId: pickNumber(fields.modeloContratoId) ?? null,
    regimenLaboralId: pickNumber(fields.regimenLaboralId) ?? null,
    mesesContrato: pickNumber(fields.mesesContrato) ?? null,
    jornadaLaboral: nullIfEmpty(pickString(fields.jornadaLaboral)) ?? '8 Horas',
    turno,
    sueldo,
    movilidad: pickNumber(fields.movilidad) ?? 0,
    sistemaPension: nullIfEmpty(pickString(fields.sistemaPension, fields.fondoPension)),
    bancoPreferencia: nullIfEmpty(pickString(fields.bancoPreferencia, fields.bancoId)),
    numeroCuentaTrabajador: nullIfEmpty(pickString(fields.numeroCuenta, fields.bankAccount)),
    urlDocumentoAdjunto: nullIfEmpty(pickString(fields.urlDocumentoAdjunto, fields.documentUrl)),
    paisId: HR_DEFAULT_PAIS_ID,
    ubigeoId: pickNumber(fields.ubigeoId) ?? null,
    estadoCivilId: pickNumber(fields.estadoCivilId) ?? null,
    observacion: nullIfEmpty(pickString(fields.observacion, fields.notes)),
    usuarioOf: options?.usuarioOf ?? 'opsflow',
    refOperaciones,
    labels: {
      tipoDocumento: 'Libreta electoral o DNI',
      empleadoCargo: cargoLabel || undefined,
      lugarTrabajo: snapshot.opsflow.unitName || undefined,
      opalo: undefined,
    },
  };
}

export function mapHrFieldsToRegistroIngresoPayload(
  hrFields: HrOpalosisIngresoFields,
): OpalosisRegistroIngresoPayload {
  const obsParts: string[] = [];
  if (hrFields.refOperaciones) obsParts.push(`Ref OpsFlow: ${hrFields.refOperaciones}`);
  if (hrFields.observacion) obsParts.push(hrFields.observacion);

  return {
    TipoDocumentoId: hrFields.tipoDocumentoId ?? 1,
    Documento: hrFields.documento,
    ApellidoPaterno: nullIfEmpty(hrFields.apellidoPaterno),
    ApellidoMaterno: nullIfEmpty(hrFields.apellidoMaterno),
    Nombres: nullIfEmpty(hrFields.nombres),
    Sexo: nullIfEmpty(hrFields.sexo)?.slice(0, 1).toUpperCase() ?? 'M',
    FechaNacimiento: nullIfEmpty(hrFields.fechaNacimiento),
    FechaIngreso: nullIfEmpty(hrFields.fechaIngreso),
    Direccion: nullIfEmpty(hrFields.direccion),
    Telefono: nullIfEmpty(hrFields.telefono),
    CorreoPersonal: nullIfEmpty(hrFields.correoPersonal),
    TieneAsignacionFamiliar: hrFields.tieneAsignacionFamiliar ?? false,
    TieneHijos: hrFields.tieneHijos ?? false,
    EmpleadoCargoId: hrFields.empleadoCargoId ?? null,
    LugarTrabajoId: hrFields.lugarTrabajoId ?? null,
    OpaloId: hrFields.opaloId ?? HR_DEFAULT_OPALO_ID,
    ModeloContratoId: hrFields.modeloContratoId ?? null,
    RegimenLaboralId: hrFields.regimenLaboralId ?? null,
    MesesContrato: hrFields.mesesContrato ?? null,
    JornadaLaboral: nullIfEmpty(hrFields.jornadaLaboral),
    Turno: nullIfEmpty(hrFields.turno),
    Sueldo: hrFields.sueldo ?? null,
    Movilidad: hrFields.movilidad ?? 0,
    SistemaPension: nullIfEmpty(hrFields.sistemaPension),
    BancoPreferencia: nullIfEmpty(hrFields.bancoPreferencia),
    NumeroCuentaTrabajador: nullIfEmpty(hrFields.numeroCuentaTrabajador),
    UrlDocumentoAdjunto: nullIfEmpty(hrFields.urlDocumentoAdjunto),
    TallaPoloCamisa: nullIfEmpty(hrFields.tallaPoloCamisa),
    TallaCasaca: nullIfEmpty(hrFields.tallaCasaca),
    TallaPantalon: nullIfEmpty(hrFields.tallaPantalon),
    TallaZapatos: hrFields.tallaZapatos ?? null,
    PaisId: hrFields.paisId ?? HR_DEFAULT_PAIS_ID,
    UbigeoId: hrFields.ubigeoId ?? null,
    SupervisorId: hrFields.supervisorId ?? null,
    CentroCostoId: hrFields.centroCostoId ?? null,
    EstadoCivilId: hrFields.estadoCivilId ?? null,
    Observacion: obsParts.length ? obsParts.join(' | ') : null,
    UsuarioProcesoId: hrFields.usuarioProcesoId ?? null,
    UsuarioOf: nullIfEmpty(hrFields.usuarioOf) ?? 'opsflow',
    PayloadJson: nullIfEmpty(hrFields.payloadJson),
  };
}

export function listHrFieldWarnings(fields: HrOpalosisIngresoFields): string[] {
  const warnings: string[] = [];
  if (!fields.documento) warnings.push('Sin documento');
  if (!fields.apellidoPaterno) warnings.push('Sin apellido paterno');
  if (!fields.apellidoMaterno) warnings.push('Sin apellido materno');
  if (!fields.nombres) warnings.push('Sin nombres');
  if (!fields.fechaIngreso) warnings.push('Sin fecha de ingreso');
  if (!fields.empleadoCargoId) warnings.push('Sin cargo Opalosis (EmpleadoCargoId)');
  if (!fields.lugarTrabajoId) warnings.push('Sin lugar de trabajo (LugarTrabajoId)');
  if (fields.sueldo === null || fields.sueldo === undefined || fields.sueldo <= 0) {
    warnings.push('Sueldo obligatorio (> 0)');
  }
  if (fields.movilidad === null || fields.movilidad === undefined) {
    warnings.push('Movilidad debe enviarse (puede ser 0)');
  }
  if (!fields.urlDocumentoAdjunto) {
    warnings.push('Sin UrlDocumentoAdjunto (carpeta SharePoint)');
  }
  if (!fields.correoPersonal) warnings.push('Sin correo personal');
  if (!fields.fechaNacimiento) warnings.push('Sin fecha de nacimiento');
  return warnings;
}

export function listHrFieldBlockers(fields: HrOpalosisIngresoFields): string[] {
  const blockers: string[] = [];
  if (!fields.documento?.trim()) blockers.push('Documento');
  if (!fields.apellidoPaterno?.trim()) blockers.push('Apellido paterno');
  if (!fields.apellidoMaterno?.trim()) blockers.push('Apellido materno');
  if (!fields.nombres?.trim()) blockers.push('Nombres');
  if (!fields.fechaIngreso) blockers.push('Fecha de ingreso');
  if (!fields.empleadoCargoId) blockers.push('Cargo');
  if (!fields.lugarTrabajoId) blockers.push('Lugar de trabajo');
  if (fields.sueldo === null || fields.sueldo === undefined || Number(fields.sueldo) <= 0) {
    blockers.push('Sueldo');
  }
  if (fields.movilidad === null || fields.movilidad === undefined) blockers.push('Movilidad');
  if (!fields.urlDocumentoAdjunto?.trim()) blockers.push('URL documentos (SharePoint)');
  return blockers;
}

export { HR_SHAREPOINT_DOCS_LIBRARY_URL };
