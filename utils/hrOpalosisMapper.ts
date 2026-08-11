import type {
  HrOpalosisIngresoFields,
  HrOutboundWorkerSnapshot,
  HrWorkerFieldInventoryItem,
  InboundHandoffItem,
  Resource,
  Unit,
  WorkerSnapshotComplementary,
} from '../types';
import {
  HR_DEFAULT_OPALO_ID,
  HR_DEFAULT_PAIS_ID,
  HR_SHAREPOINT_DOCS_LIBRARY_URL,
  HR_TIPO_DOCUMENTO_ID_BY_CODE,
  splitFullName,
  toOpalosisDate,
} from './hrIntegration';
import {
  extractHandoffNameParts,
  hasStructuredNameParts,
} from './handoffNameParts';
import { HANDOFF_FIELD_LABELS } from './workerSnapshotMapper';
import { hydrateComplementaryFromSnapshot } from './complementaryHydrate';

const OPSFLOW_FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  dni: 'DNI',
  puesto: 'Puesto',
  localidad: 'Localidad',
  phone: 'Teléfono',
  birthDate: 'Fecha de nacimiento',
  startDate: 'Fecha de ingreso',
  endDate: 'Fecha de cese',
  assignedShift: 'Turno asignado',
  assignedZones: 'Zonas asignadas',
  monthlySalary: 'Salario mensual',
  personnelStatus: 'Estado de personal',
  externalId: 'ID externo',
  unitName: 'Unidad',
  clientName: 'Cliente',
  resourceId: 'ID recurso',
  unitId: 'ID unidad',
  laborRegime: 'Régimen',
  jornadaType: 'Jornada',
  mobilityBonus: 'Movilidad',
  familyAllowance: 'Asignación familiar',
};

/** Etiqueta del camino: preferir nombre conocido en UI; si es dinámico, usar la clave tal cual. */
function labelForSourceKey(
  key: string,
  source: 'ats' | 'opsflow' | 'operator',
  dictionary: Record<string, string>,
): string {
  if (dictionary[key]) return dictionary[key];
  // Campos dinámicos (ej. "mascotas"): conservar la clave original como etiqueta
  return key;
}

function pushInventoryItem(
  items: HrWorkerFieldInventoryItem[],
  source: HrWorkerFieldInventoryItem['source'],
  key: string,
  label: string,
  value: unknown,
  note?: string,
) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' && !value.trim()) return;
  if (Array.isArray(value) && value.length === 0) return;

  const normalized =
    typeof value === 'object' ? JSON.stringify(value) : (value as string | number | boolean);

  items.push({
    source,
    key,
    label,
    value: normalized,
    note,
    classificationRequired: true,
  });
}

/**
 * Inventario plano de TODOS los datos disponibles (conocidos y dinámicos).
 * Las etiquetas son las del camino ATS → OpsFlow. Opalosis decide por cada ítem
 * si lo usa, lo descarta, y con qué etiqueta de su BD (ej. mascotas → animales).
 */
export function buildWorkerFieldInventory(
  snapshot: HrOutboundWorkerSnapshot,
  hrFields?: HrOpalosisIngresoFields | null,
): HrWorkerFieldInventoryItem[] {
  const items: HrWorkerFieldInventoryItem[] = [];

  const identity = snapshot.ats.identity ?? {};
  pushInventoryItem(
    items,
    'ats',
    'fullName',
    labelForSourceKey('fullName', 'ats', HANDOFF_FIELD_LABELS),
    identity.fullName,
  );
  pushInventoryItem(
    items,
    'ats',
    'dni',
    labelForSourceKey('dni', 'ats', HANDOFF_FIELD_LABELS),
    identity.dni,
    'Etiqueta del camino ATS/OpsFlow. Opalosis tipifica (DNI/CE/pasaporte/…) al reclasificar.',
  );
  pushInventoryItem(
    items,
    'ats',
    'email',
    labelForSourceKey('email', 'ats', HANDOFF_FIELD_LABELS),
    identity.email,
  );
  pushInventoryItem(
    items,
    'ats',
    'phone',
    labelForSourceKey('phone', 'ats', HANDOFF_FIELD_LABELS),
    identity.phone,
  );
  pushInventoryItem(
    items,
    'ats',
    'phone2',
    labelForSourceKey('phone2', 'ats', HANDOFF_FIELD_LABELS),
    identity.phone2,
  );

  const atsFields = snapshot.ats.fields ?? {};
  // Todos los campos ATS, incluidos los dinámicos (mascotas, etc.)
  for (const [key, value] of Object.entries(atsFields)) {
    pushInventoryItem(
      items,
      'ats',
      key,
      labelForSourceKey(key, 'ats', HANDOFF_FIELD_LABELS),
      value,
      HANDOFF_FIELD_LABELS[key]
        ? undefined
        : 'Campo dinámico del ATS: Opalosis debe clasificar o descartar.',
    );
  }

  pushInventoryItem(items, 'ats', 'workerName', 'workerName', snapshot.ats.workerName);
  pushInventoryItem(items, 'ats', 'sourceApp', 'sourceApp', snapshot.ats.sourceApp);
  pushInventoryItem(
    items,
    'ats',
    'sourceCandidateId',
    'sourceCandidateId',
    snapshot.ats.sourceCandidateId,
  );
  pushInventoryItem(
    items,
    'ats',
    'sourceProcessId',
    'sourceProcessId',
    snapshot.ats.sourceProcessId,
  );

  const complementary = snapshot.ats.complementary;
  if (complementary) {
    const compLabels: Record<string, string> = {
      departamento: 'Departamento',
      provincia: 'Provincia',
      distrito: 'Distrito',
      bancoSueldo: 'Banco sueldo',
      bancoCts: 'Banco CTS',
      sistemaPensionesDeseado: 'Sistema pensiones deseado',
      sistemaPensionesAnterior: 'Sistema pensiones anterior',
      tallaCamisa: 'Talla camisa',
      tallaPantalon: 'Talla pantalón',
      tallaCalzado: 'Talla calzado',
      estadoCivil: 'Estado civil',
      fechaNacimiento: 'Fecha de nacimiento',
      direccion: 'Dirección',
      puestoContrato: 'Puesto contrato',
      unidadDestaque: 'Unidad destaque',
    };
    for (const [key, value] of Object.entries(complementary)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') continue;
      pushInventoryItem(
        items,
        'ats',
        `complementary.${key}`,
        compLabels[key] || key,
        value,
        'Ficha complementaria ATS/OpsFlow',
      );
    }
  }

  const ops = snapshot.opsflow;
  for (const key of Object.keys(OPSFLOW_FIELD_LABELS) as Array<keyof typeof ops>) {
    pushInventoryItem(
      items,
      'opsflow',
      key,
      labelForSourceKey(key, 'opsflow', OPSFLOW_FIELD_LABELS),
      ops[key],
      key === 'dni'
        ? 'Etiqueta del camino OpsFlow. Opalosis tipifica el documento al reclasificar.'
        : undefined,
    );
  }

  // Cualquier otra propiedad opsflow no listada (por si el snapshot crece)
  for (const [key, value] of Object.entries(ops)) {
    if (key in OPSFLOW_FIELD_LABELS) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) continue;
    pushInventoryItem(
      items,
      'opsflow',
      key,
      labelForSourceKey(key, 'opsflow', OPSFLOW_FIELD_LABELS),
      value,
      'Campo OpsFlow adicional: Opalosis debe clasificar o descartar.',
    );
  }

  if (hrFields) {
    pushInventoryItem(
      items,
      'operator',
      'urlDocumentoAdjunto',
      'urlDocumentoAdjunto',
      hrFields.urlDocumentoAdjunto,
    );
    pushInventoryItem(
      items,
      'operator',
      'observacion',
      'observacion',
      hrFields.observacion,
    );
    pushInventoryItem(
      items,
      'operator',
      'refOperaciones',
      'refOperaciones',
      hrFields.refOperaciones,
    );
    if (hrFields.labels?.empleadoCargo) {
      pushInventoryItem(
        items,
        'operator',
        'empleadoCargoLabel',
        'empleadoCargoLabel',
        hrFields.labels.empleadoCargo,
      );
    }
    if (hrFields.labels?.lugarTrabajo) {
      pushInventoryItem(
        items,
        'operator',
        'lugarTrabajoLabel',
        'lugarTrabajoLabel',
        hrFields.labels.lugarTrabajo,
      );
    }
  }

  return items;
}

/** Bundle que Opalosis muestra en bandeja para reclasificar etiquetas. */
export function buildOpalosisPayloadBundle(
  snapshot: HrOutboundWorkerSnapshot,
  hrFields: HrOpalosisIngresoFields,
): string {
  const fieldInventory = buildWorkerFieldInventory(snapshot, hrFields);
  const bundle = {
    payloadVersion: 2,
    purpose:
      'Todos los datos del trabajador con etiquetas del camino ATS→OpsFlow. Opalosis reclasifica o descarta cada ítem hacia su modelo (no hay estándar 1:1).',
    sourceApp: 'OpsFlow',
    refOperaciones: hrFields.refOperaciones ?? null,
    capturedAt: snapshot.capturedAt,
    classificationModel: {
      rule:
        'Cada ítem de fieldInventory es un dato independiente. El usuario de Opalosis decide si lo usa y con qué etiqueta de su BD (ej. clave origen "mascotas" → etiqueta Opalosis "animales"), o lo deja atrás.',
      examples: [
        { originLabel: 'DNI', possibleOpalosis: 'TipoDocumentoId + Documento tipificado' },
        { originLabel: 'mascotas', possibleOpalosis: 'animales | descartar' },
      ],
    },
    fieldInventory,
    raw: {
      ats: {
        sourceApp: snapshot.ats.sourceApp,
        sourcePackageId: snapshot.ats.sourcePackageId,
        sourceCandidateId: snapshot.ats.sourceCandidateId,
        sourceProcessId: snapshot.ats.sourceProcessId,
        workerName: snapshot.ats.workerName,
        identity: snapshot.ats.identity ?? {},
        fields: snapshot.ats.fields ?? {},
        meta: snapshot.ats.meta ?? {},
      },
      opsflow: snapshot.opsflow,
    },
  };
  return JSON.stringify(bundle);
}

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
  FondoPensionId?: number | null;
  BancoId?: number | null;
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
  /** Texto del estado civil (nombre del catálogo). El DTO NO acepta el Id. */
  EstadoCivil: string | null;
  Observacion: string | null;
  UsuarioProcesoId: number | null;
  UsuarioOf: string | null;
  PayloadJson: string | null;
  /** Datos adicionales/dinámicos fuera del DTO estándar (pares Campo/Valor). */
  CamposDetalle: OpalosisRegistroIngresoDetalle[] | null;
}

/** Ítem de CamposDetalle (RegistroIngresoDetalleDTO): par Campo/Valor de texto. */
export interface OpalosisRegistroIngresoDetalle {
  Campo: string;
  Valor: string;
}

/** Claves ATS que ya tienen columna propia en el RegistroIngresoDTO (no duplicar en CamposDetalle). */
const ATS_KEYS_ALREADY_IN_DTO = new Set([
  'fullName',
  'dni',
  'nombres',
  'apellidoPaterno',
  'apellidoMaterno',
  'address',
  'direccion',
  'agreedSalary',
  'salary',
  'monthlySalary',
  'sueldo',
  'hireDate',
  'startDate',
  'fechaIngreso',
  'birthDate',
  'fechaNacimiento',
  'phone',
  'phone2',
  'telefono',
  'email',
  'correo',
  'correoPersonal',
  'processTitle',
  'puesto',
  'clientName',
]);

/**
 * Construye CamposDetalle con:
 * - extras dinámicos ATS sin columna en el DTO
 * - datos OpsFlow que no tienen columna propia (días/horario)
 * - ficha: puestoContrato / unidadDestaque (distintos de cargo/lugar tipados)
 * La trazabilidad completa sigue en PayloadJson.
 */
export function buildCamposDetalle(
  snapshot: HrOutboundWorkerSnapshot | null,
  _hrFields: HrOpalosisIngresoFields,
): OpalosisRegistroIngresoDetalle[] {
  const out: OpalosisRegistroIngresoDetalle[] = [];
  const seen = new Set<string>();

  const push = (campo: string, valor: unknown) => {
    if (valor === null || valor === undefined) return;
    const value = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
    if (!value.trim()) return;
    const key = campo.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ Campo: key, Valor: value });
  };

  if (snapshot) {
    const atsFields = snapshot.ats?.fields ?? {};
    for (const [key, value] of Object.entries(atsFields)) {
      if (ATS_KEYS_ALREADY_IN_DTO.has(key)) continue;
      push(key, value);
    }

    const complementary = snapshot.ats?.complementary;
    push('puestoContrato', complementary?.puestoContrato);
    push('unidadDestaque', complementary?.unidadDestaque);

    const ops = snapshot.opsflow;
    push('workDays', ops?.workDays);
    push('entryTime', ops?.entryTime);
    push('exitTime', ops?.exitTime);
  }

  return out;
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
  handoffItem?: InboundHandoffItem | null;
  sourcePackageId?: string;
  sourceApp?: string;
  opalosisUnidadId?: number | null;
  empresaCodigo?: number | null;
  usuarioOf?: string | null;
}

export function buildOutboundWorkerSnapshot(input: EnqueueAssignmentInput): HrOutboundWorkerSnapshot {
  const { resource, unit, handoffItem, sourcePackageId, sourceApp } = input;
  const ats =
    resource.inboundSourceData?.workerSnapshot ?? handoffItem?.workerSnapshot ?? undefined;
  const complementary = hydrateComplementaryFromSnapshot(
    ats,
    handoffItem?.complementary ?? ats?.complementary ?? null,
  );

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
      jornadaType: resource.jornadaType,
      laborRegime: resource.laborRegime,
      mobilityBonus: resource.mobilityBonus,
      familyAllowance: resource.familyAllowance,
      workDays: resource.workDays,
      entryTime: resource.entryTime,
      exitTime: resource.exitTime,
    },
    ats: {
      sourceApp:
        sourceApp ??
        resource.inboundSourceData?.sourceApp ??
        (handoffItem ? 'Opalo ATS' : 'OpsFlow'),
      sourcePackageId: sourcePackageId ?? resource.inboundSourceData?.sourcePackageId,
      sourceCandidateId:
        handoffItem?.sourceCandidateId ?? resource.inboundSourceData?.sourceCandidateId,
      sourceProcessId: handoffItem?.sourceProcessId ?? resource.inboundSourceData?.sourceProcessId,
      handoffItemId: handoffItem?.id ?? resource.inboundSourceData?.handoffItemId,
      workerName: handoffItem?.workerName ?? resource.name,
      identity: ats?.identity,
      fields: {
        ...(ats?.fields ?? {}),
        ...(handoffItem?.opsflowIntake?.monthlySalary != null
          ? { agreedSalary: handoffItem.opsflowIntake.monthlySalary }
          : {}),
        ...(handoffItem?.opsflowIntake?.shift
          ? { shift: handoffItem.opsflowIntake.shift }
          : {}),
        ...(handoffItem?.opsflowIntake?.jornadaType
          ? { jornadaType: handoffItem.opsflowIntake.jornadaType }
          : {}),
        ...(handoffItem?.opsflowIntake?.laborRegime
          ? { laborRegime: handoffItem.opsflowIntake.laborRegime }
          : {}),
        ...(handoffItem?.opsflowIntake?.mobilityBonus != null
          ? { mobilityBonus: handoffItem.opsflowIntake.mobilityBonus }
          : {}),
        ...(handoffItem?.opsflowIntake?.familyAllowance != null
          ? { familyAllowance: handoffItem.opsflowIntake.familyAllowance }
          : {}),
      },
      complementary,
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
        fondoPensionId: pickNumber(r.fondoPensionId) ?? null,
        bancoPreferencia: nullIfEmpty(pickString(r.bancoPreferencia)),
        bancoId: pickNumber(r.bancoId) ?? null,
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
  const identity = snapshot.ats.identity ?? {};
  const fields = snapshot.ats.fields ?? {};
  const complementary: WorkerSnapshotComplementary =
    snapshot.ats.complementary ??
    hydrateComplementaryFromSnapshot(
      {
        identity: snapshot.ats.identity,
        fields: snapshot.ats.fields,
        meta: snapshot.ats.meta,
      },
      null,
    );

  const structuredParts = extractHandoffNameParts(
    { identity, fields, meta: snapshot.ats.meta, complementary },
    identity,
  );
  const splitParts = splitFullName(snapshot.opsflow.name || snapshot.ats.workerName || '');
  const apellido_paterno = hasStructuredNameParts(structuredParts)
    ? structuredParts.apellidoPaterno ||
      pickString(complementary.apellidoPaterno) ||
      splitParts.apellido_paterno
    : pickString(complementary.apellidoPaterno) || splitParts.apellido_paterno;
  const apellido_materno = hasStructuredNameParts(structuredParts)
    ? structuredParts.apellidoMaterno ||
      pickString(complementary.apellidoMaterno) ||
      splitParts.apellido_materno
    : pickString(complementary.apellidoMaterno) || splitParts.apellido_materno;
  const nombres = hasStructuredNameParts(structuredParts)
    ? structuredParts.nombres ||
      pickString(complementary.nombres) ||
      splitParts.nombres ||
      pickString(identity.fullName, snapshot.opsflow.name)
    : pickString(complementary.nombres) ||
      splitParts.nombres ||
      pickString(identity.fullName, snapshot.opsflow.name);

  const fechaIngreso =
    normalizeIsoDate(snapshot.opsflow.startDate) ??
    normalizeIsoDate(fields.hireDate as string | undefined) ??
    normalizeIsoDate(fields.startDate as string | undefined) ??
    new Date().toISOString().slice(0, 10);

  const fechaNacimiento =
    normalizeIsoDate(snapshot.opsflow.birthDate) ??
    normalizeIsoDate(complementary.fechaNacimiento) ??
    normalizeIsoDate(fields.birthDate as string | undefined) ??
    normalizeIsoDate(fields.fechaNacimiento as string | undefined) ??
    null;

  const sueldo =
    pickNumber(
      snapshot.opsflow.monthlySalary,
      fields.agreedSalary,
      fields.sueldo,
      fields.salary,
      fields.monthlySalary,
    ) ?? null;

  // Cargo Opalosis = puesto OpsFlow (resource.puesto → EmpleadoCargoId).
  // No mezclar con puestoContrato / processTitle (ficha o proceso ATS): son datos distintos.
  const cargoLabel = pickString(snapshot.opsflow.puesto);
  const turno = pickString(snapshot.opsflow.assignedShift) || null;

  const movilidad = pickNumber(snapshot.opsflow.mobilityBonus) ?? 0;

  // Si OpsFlow ya definió asignación familiar (intake), esa decisión manda.
  const familyAllowance =
    typeof snapshot.opsflow.familyAllowance === 'boolean'
      ? snapshot.opsflow.familyAllowance
      : fields.tieneAsignacionFamiliar === true ||
        fields.asignacionFamiliar === true ||
        fields.familyAllowance === true;

  const jornadaLaboral =
    nullIfEmpty(pickString(snapshot.opsflow.jornadaType)) ?? '8 Horas';

  const departamentoLabel = pickString(
    complementary.departamento,
    fields.departamento,
    fields.department,
    fields.departamentoNombre,
    fields.Departamento,
    fields.Department,
  );
  const provinciaLabel = pickString(
    complementary.provincia,
    fields.provincia,
    fields.province,
    fields.Provincia,
    fields.Province,
  );
  const distritoLabel = pickString(
    complementary.distrito,
    fields.distrito,
    fields.district,
    fields.Distrito,
    fields.District,
  );

  // Fallback: claves ATS con mayúsculas / variantes en fields
  const fieldKeyPick = (re: RegExp) => {
    for (const [k, v] of Object.entries(fields)) {
      if (re.test(k) && v !== null && v !== undefined && String(v).trim()) {
        return String(v).trim();
      }
    }
    return '';
  };

  // Régimen: prioridad OpsFlow (intake / resource); ATS solo si OpsFlow no lo trajo.
  const regimenLabel =
    pickString(snapshot.opsflow.laborRegime) ||
    pickString(
      fields.regimenLaboral,
      fields.laborRegime,
      fields.regimen,
      fields.Regimen,
      fields['Régimen'],
      fields.regime,
    ) ||
    fieldKeyPick(/r[eé]gimen|laborRegime|labor.?regime/i);

  const departamentoFinal = departamentoLabel || fieldKeyPick(/departament/i);
  const provinciaFinal = provinciaLabel || fieldKeyPick(/provinc/i);
  const distritoFinal = distritoLabel || fieldKeyPick(/distrit|district/i);
  const bancoLabel = pickString(
    complementary.bancoSueldo,
    fields.bancoSueldo,
    fields.banco,
    fields.bancoPreferencia,
  );
  const pensionLabel = pickString(
    complementary.sistemaPensionesDeseado,
    complementary.sistemaPensionesAnterior,
    fields.sistemaPension,
    fields.fondoPension,
    fields.sistemaPensionesDeseado,
    fields.sistemaPensionesAnterior,
  );
  const estadoCivilLabel = pickString(
    complementary.estadoCivil,
    fields.estadoCivil,
    fields.estado_civil,
  );

  const tallaPolo = pickString(
    complementary.tallaCamisa,
    fields.tallaCamisa,
    fields.tallaPoloCamisa,
    fields.tallaPolo,
  );
  const tallaPantalon = pickString(
    complementary.tallaPantalon,
    fields.tallaPantalon,
  );
  const tallaCasaca = pickString(fields.tallaCasaca, fields.tallaChaqueta);
  const tallaZapatos =
    pickNumber(complementary.tallaCalzado, fields.tallaCalzado, fields.tallaZapatos) ?? null;

  const sexoRaw = pickString(complementary.sexo, fields.sexo, fields.gender) || 'M';

  return {
    tipoDocumentoId: 1,
    documento: pickString(
      snapshot.opsflow.dni,
      complementary.nroDocumento,
      identity.dni,
    ),
    apellidoPaterno: apellido_paterno,
    apellidoMaterno: apellido_materno,
    nombres: nombres,
    sexo: sexoRaw.slice(0, 1).toUpperCase(),
    fechaIngreso,
    fechaNacimiento,
    direccion: nullIfEmpty(
      pickString(
        complementary.direccion,
        fields.address,
        fields.direccion,
        snapshot.opsflow.localidad,
      ),
    ),
    telefono: nullIfEmpty(
      pickString(
        snapshot.opsflow.phone,
        complementary.telefono,
        identity.phone,
        identity.phone2,
        fields.phone,
      ),
    ),
    correoPersonal: nullIfEmpty(
      pickString(complementary.email, identity.email, fields.email, fields.correo),
    ),
    tieneAsignacionFamiliar: familyAllowance,
    tieneHijos: false,
    empleadoCargoId: pickNumber(fields.empleadoCargoId) ?? null,
    lugarTrabajoId: options?.opalosisUnidadId ?? pickNumber(fields.lugarTrabajoId) ?? null,
    opaloId: options?.empresaCodigo ?? HR_DEFAULT_OPALO_ID,
    modeloContratoId: pickNumber(fields.modeloContratoId) ?? null,
    regimenLaboralId: pickNumber(fields.regimenLaboralId) ?? null,
    mesesContrato: pickNumber(fields.mesesContrato) ?? null,
    jornadaLaboral,
    turno,
    sueldo,
    movilidad,
    sistemaPension: nullIfEmpty(pensionLabel),
    fondoPensionId: pickNumber(fields.fondoPensionId) ?? null,
    bancoPreferencia: nullIfEmpty(bancoLabel),
    bancoId: pickNumber(fields.bancoId) ?? null,
    numeroCuentaTrabajador: nullIfEmpty(
      pickString(fields.numeroCuenta, fields.bankAccount, fields.numeroCuentaTrabajador),
    ),
    urlDocumentoAdjunto: nullIfEmpty(pickString(fields.urlDocumentoAdjunto, fields.documentUrl)),
    tallaPoloCamisa: nullIfEmpty(tallaPolo),
    tallaCasaca: nullIfEmpty(tallaCasaca),
    tallaPantalon: nullIfEmpty(tallaPantalon),
    tallaZapatos,
    paisId: HR_DEFAULT_PAIS_ID,
    ubigeoId: pickNumber(fields.ubigeoId) ?? null,
    departamentoId: pickNumber(fields.departamentoId) ?? null,
    provinciaId: pickNumber(fields.provinciaId) ?? null,
    estadoCivilId: pickNumber(fields.estadoCivilId) ?? null,
    observacion: nullIfEmpty(pickString(fields.observacion, fields.notes)),
    usuarioOf: options?.usuarioOf ?? 'opsflow',
    refOperaciones,
    labels: {
      tipoDocumento: 'Documento (selección Opalosis; el valor origen puede ser DNI/CE/pasaporte)',
      empleadoCargo: cargoLabel || undefined,
      // Lugar de trabajo = unidad OpsFlow tipificada.
      // Prioridad de ID: resource.unitId / assignedWorkUnitId → LugarTrabajoId (mapeo).
      // Si solo hay unitName (sin ID), se envía como etiqueta para que RRHH tipifique.
      lugarTrabajo: snapshot.opsflow.unitName || undefined,
      regimenLaboral: regimenLabel || undefined,
      departamento: departamentoFinal || undefined,
      provincia: provinciaFinal || undefined,
      distrito: distritoFinal || undefined,
      banco: bancoLabel || undefined,
      fondoPension: pensionLabel || undefined,
      estadoCivil: estadoCivilLabel || undefined,
      opalo: undefined,
    },
  };
}

export function mapHrFieldsToRegistroIngresoPayload(
  hrFields: HrOpalosisIngresoFields,
  snapshot?: HrOutboundWorkerSnapshot | null,
): OpalosisRegistroIngresoPayload {
  const obsParts: string[] = [];
  if (hrFields.refOperaciones) obsParts.push(`Ref OpsFlow: ${hrFields.refOperaciones}`);
  if (hrFields.observacion) obsParts.push(hrFields.observacion);
  obsParts.push(
    'Ver PayloadJson.fieldInventory: etiquetas originales ATS/OpsFlow para retiquetado en Opalosis.',
  );

  const payloadJson =
    nullIfEmpty(hrFields.payloadJson) ??
    (snapshot ? buildOpalosisPayloadBundle(snapshot, hrFields) : null);

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
    // Opalosis espera códigos de catálogo, no la etiqueta de texto
    SistemaPension:
      hrFields.fondoPensionId != null
        ? String(hrFields.fondoPensionId)
        : nullIfEmpty(hrFields.sistemaPension),
    BancoPreferencia:
      hrFields.bancoId != null
        ? String(hrFields.bancoId)
        : nullIfEmpty(hrFields.bancoPreferencia),
    FondoPensionId: hrFields.fondoPensionId ?? null,
    BancoId: hrFields.bancoId ?? null,
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
    EstadoCivil: nullIfEmpty(hrFields.labels?.estadoCivil) ?? null,
    Observacion: obsParts.length ? obsParts.join(' | ') : null,
    UsuarioProcesoId: hrFields.usuarioProcesoId ?? null,
    UsuarioOf: nullIfEmpty(hrFields.usuarioOf) ?? 'opsflow',
    PayloadJson: payloadJson,
    CamposDetalle: buildCamposDetalle(snapshot ?? null, hrFields),
  };
}

export function listHrFieldWarnings(fields: HrOpalosisIngresoFields): string[] {
  const warnings: string[] = [];
  if (!fields.apellidoMaterno?.trim()) warnings.push('Sin apellido materno');
  if (!fields.fechaIngreso) warnings.push('Sin fecha de ingreso');
  if (!fields.empleadoCargoId) {
    warnings.push(
      fields.labels?.empleadoCargo
        ? `Cargo OpsFlow «${fields.labels.empleadoCargo}» sin ID Opalosis (RRHH puede tipificar)`
        : 'Sin cargo Opalosis (EmpleadoCargoId)',
    );
  }
  if (!fields.lugarTrabajoId) {
    warnings.push(
      fields.labels?.lugarTrabajo
        ? `Unidad OpsFlow «${fields.labels.lugarTrabajo}» sin LugarTrabajoId (mapear unidad o tipificar en RRHH)`
        : 'Sin lugar de trabajo (LugarTrabajoId)',
    );
  }
  if (fields.sueldo === null || fields.sueldo === undefined || fields.sueldo <= 0) {
    warnings.push('Sin sueldo (> 0) — se envía null para que RRHH complete');
  }
  if (fields.movilidad === null || fields.movilidad === undefined) {
    warnings.push('Movilidad no definida (se enviará 0)');
  }
  if (!fields.urlDocumentoAdjunto) {
    warnings.push('Sin UrlDocumentoAdjunto (opcional; RRHH puede adjuntar después)');
  }
  if (!fields.correoPersonal) warnings.push('Sin correo personal');
  if (!fields.fechaNacimiento) warnings.push('Sin fecha de nacimiento');
  return warnings;
}

/**
 * Bloquea envío solo si falta identidad mínima.
 * Cargo/lugar/sueldo/URL son catálogos Opalosis: van como advertencia y en el inventario;
 * RRHH tipifica en OpaloSis. No hay match 1:1 obligatorio previo al POST.
 */
export function listHrFieldBlockers(fields: HrOpalosisIngresoFields): string[] {
  const blockers: string[] = [];
  if (!fields.documento?.trim()) blockers.push('Documento');
  const hasName =
    Boolean(fields.nombres?.trim()) ||
    Boolean(fields.apellidoPaterno?.trim()) ||
    Boolean(fields.apellidoMaterno?.trim());
  if (!hasName) blockers.push('Nombre (nombres o apellidos)');
  return blockers;
}

/** Rellena huecos de hr_fields con lo ya conocido en el snapshot OpsFlow/ATS. */
export function mergeHrFieldsWithSnapshot(
  existing: HrOpalosisIngresoFields | null | undefined,
  snapshot: HrOutboundWorkerSnapshot,
  refOperaciones: string,
  options?: {
    opalosisUnidadId?: number | null;
    empresaCodigo?: number | null;
    usuarioOf?: string | null;
  },
): HrOpalosisIngresoFields {
  const mapped = mapSnapshotToHrFields(snapshot, refOperaciones, options);
  if (!existing) return mapped;

  const pickFilledString = (a?: string | null, b?: string | null) => {
    const av = a?.trim();
    if (av) return a as string;
    return b ?? '';
  };
  const pickFilledNum = (a?: number | null, b?: number | null) =>
    a !== null && a !== undefined ? a : (b ?? null);

  return {
    ...mapped,
    ...existing,
    documento: pickFilledString(existing.documento, mapped.documento),
    apellidoPaterno: pickFilledString(existing.apellidoPaterno, mapped.apellidoPaterno),
    apellidoMaterno: pickFilledString(existing.apellidoMaterno, mapped.apellidoMaterno),
    nombres: pickFilledString(existing.nombres, mapped.nombres),
    sexo: pickFilledString(existing.sexo, mapped.sexo) || 'M',
    fechaIngreso: pickFilledString(existing.fechaIngreso, mapped.fechaIngreso),
    fechaNacimiento: existing.fechaNacimiento || mapped.fechaNacimiento,
    direccion: existing.direccion || mapped.direccion,
    telefono: existing.telefono || mapped.telefono,
    correoPersonal: existing.correoPersonal || mapped.correoPersonal,
    empleadoCargoId: pickFilledNum(existing.empleadoCargoId, mapped.empleadoCargoId),
    lugarTrabajoId: pickFilledNum(existing.lugarTrabajoId, mapped.lugarTrabajoId),
    sueldo: pickFilledNum(existing.sueldo, mapped.sueldo),
    movilidad:
      existing.movilidad !== null && existing.movilidad !== undefined
        ? existing.movilidad
        : mapped.movilidad,
    jornadaLaboral: existing.jornadaLaboral || mapped.jornadaLaboral,
    turno: existing.turno || mapped.turno,
    urlDocumentoAdjunto: existing.urlDocumentoAdjunto || mapped.urlDocumentoAdjunto,
    tieneAsignacionFamiliar:
      existing.tieneAsignacionFamiliar || mapped.tieneAsignacionFamiliar,
    sistemaPension: existing.sistemaPension || mapped.sistemaPension,
    fondoPensionId: pickFilledNum(existing.fondoPensionId, mapped.fondoPensionId),
    bancoPreferencia: existing.bancoPreferencia || mapped.bancoPreferencia,
    bancoId: pickFilledNum(existing.bancoId, mapped.bancoId),
    tallaPoloCamisa: existing.tallaPoloCamisa || mapped.tallaPoloCamisa,
    tallaCasaca: existing.tallaCasaca || mapped.tallaCasaca,
    tallaPantalon: existing.tallaPantalon || mapped.tallaPantalon,
    tallaZapatos: pickFilledNum(existing.tallaZapatos, mapped.tallaZapatos),
    departamentoId: pickFilledNum(existing.departamentoId, mapped.departamentoId),
    provinciaId: pickFilledNum(existing.provinciaId, mapped.provinciaId),
    ubigeoId: pickFilledNum(existing.ubigeoId, mapped.ubigeoId),
    estadoCivilId: pickFilledNum(existing.estadoCivilId, mapped.estadoCivilId),
    regimenLaboralId: pickFilledNum(existing.regimenLaboralId, mapped.regimenLaboralId),
    labels: {
      ...mapped.labels,
      ...existing.labels,
      empleadoCargo: existing.labels?.empleadoCargo || mapped.labels?.empleadoCargo,
      lugarTrabajo: existing.labels?.lugarTrabajo || mapped.labels?.lugarTrabajo,
      regimenLaboral: existing.labels?.regimenLaboral || mapped.labels?.regimenLaboral,
      departamento: existing.labels?.departamento || mapped.labels?.departamento,
      provincia: existing.labels?.provincia || mapped.labels?.provincia,
      distrito: existing.labels?.distrito || mapped.labels?.distrito,
      banco: existing.labels?.banco || mapped.labels?.banco,
      fondoPension: existing.labels?.fondoPension || mapped.labels?.fondoPension,
      estadoCivil: existing.labels?.estadoCivil || mapped.labels?.estadoCivil,
    },
    refOperaciones: existing.refOperaciones || mapped.refOperaciones || refOperaciones,
  };
}

export { HR_SHAREPOINT_DOCS_LIBRARY_URL };
