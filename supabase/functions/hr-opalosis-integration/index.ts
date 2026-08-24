import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Rutas relativas a OPALOSIS_API_BASE_URL (…/api/opsflow). */
const PATHS = {
  registro: '/registro-ingreso',
  solicitudes: '/solicitudes-ingreso',
} as const;

const CATALOG_PATHS = new Set([
  'tipo-documento',
  'estado-civil',
  'paises',
  'departamentos',
  'provincias',
  'distritos',
  'empleado-cargo',
  'lugar-trabajo',
  'opalos',
  'regimen-laboral',
  'modelo-contrato',
  'fondo-pension',
  'banco',
  'supervisores',
  'centro-costo',
]);

interface RequestBody {
  action:
    | 'send-package'
    | 'fetch-catalog'
    | 'check-package-status'
    | 'test-registro-ingreso'
    | 'fetch-unidades';
  queueItemIds?: string[];
  reportDate?: string;
  senderNote?: string | null;
  sentByName?: string | null;
  packageId?: string;
  testPayload?: Record<string, unknown>;
  catalog?: string;
  buscar?: string;
  departamentoId?: number;
  provinciaId?: number;
}

interface RegistroIngresoResult {
  queueItemId?: string;
  refOperaciones: string;
  workerName: string;
  documento: string;
  ok: boolean;
  businessRejected: boolean;
  itemStatus: 'recibido' | 'rechazado';
  ingresoId?: number;
  ingresoCod?: string;
  mensaje: string;
  response: Record<string, unknown>;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getProxyConfig(): { proxyUrl: string; proxySecret: string } | null {
  const proxyUrl = Deno.env.get('OPALOSIS_PROXY_URL')?.trim();
  const proxySecret = Deno.env.get('OPALOSIS_PROXY_SECRET')?.trim();
  if (!proxyUrl || !proxySecret) return null;
  return { proxyUrl: proxyUrl.replace(/\/$/, ''), proxySecret };
}

function isMockMode(): boolean {
  const explicit = Deno.env.get('OPALOSIS_USE_MOCK');
  if (explicit === 'false') return false;
  if (explicit === 'true') return true;
  // Proxy EasyPanel (recomendado) o llamada directa a Onyx
  if (getProxyConfig()) return false;
  const baseUrl = Deno.env.get('OPALOSIS_API_BASE_URL')?.trim();
  const apiKey = Deno.env.get('OPALOSIS_API_KEY')?.trim();
  return !baseUrl || !apiKey;
}

function getOpalosisConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = Deno.env.get('OPALOSIS_API_BASE_URL')?.trim();
  const apiKey = Deno.env.get('OPALOSIS_API_KEY')?.trim();
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey };
}

/**
 * Llama a Opalosis.
 * Si existe OPALOSIS_PROXY_URL, la petición sale vía EasyPanel (Node → Onyx),
 * evitando el ECONNRESET del runtime Deno/Supabase Edge contra IIS 8.0.
 */
async function callOpalosis(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const proxy = getProxyConfig();
  const relativePath = path.startsWith('/') ? path : `/${path}`;
  const method = options.method ?? 'GET';

  let url: URL;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (proxy) {
    url = new URL(`${proxy.proxyUrl}${relativePath}`);
    headers['X-OpsFlow-Proxy-Secret'] = proxy.proxySecret;
  } else {
    const config = getOpalosisConfig();
    if (!config) throw new Error('Opalosis no configurado (ni proxy ni API directa)');
    url = new URL(`${config.baseUrl}${relativePath}`);
    headers['X-Api-Key'] = config.apiKey;
  }

  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { ok: response.ok, status: response.status, data };
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (v !== null && v !== undefined && String(v).trim()) return String(v).trim();
  }
  return '';
}

function pickNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

/** Opalosis (IIS) responde HTTP 500 si CamposDetalle/PayloadJson traen binarios (PDF base64). */
const MAX_OUTBOUND_FIELD_CHARS = 2000;

function summarizeHeavyValue(key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('data:')) {
      const semi = value.indexOf(';');
      const mime = semi > 5 ? value.slice(5, semi) : 'binario';
      return `[omitido: ${key} archivo embebido ${mime} ~${Math.round(value.length / 1024)}KB]`;
    }
    if (value.length > MAX_OUTBOUND_FIELD_CHARS) {
      return `[omitido: ${key} texto ~${Math.round(value.length / 1024)}KB]`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => summarizeHeavyValue(`${key}[${i}]`, item));
  }
  if (value && typeof value === 'object') {
    const json = JSON.stringify(value);
    if (json.length > MAX_OUTBOUND_FIELD_CHARS) {
      return `[omitido: ${key} objeto ~${Math.round(json.length / 1024)}KB]`;
    }
  }
  return value;
}

function sanitizeFieldsMap(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = summarizeHeavyValue(key, value);
  }
  return out;
}

function sanitizeWorkerSnapshot(
  snapshot: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!snapshot) return null;
  const ats = { ...((snapshot.ats ?? {}) as Record<string, unknown>) };
  if (ats.fields && typeof ats.fields === 'object' && !Array.isArray(ats.fields)) {
    ats.fields = sanitizeFieldsMap(ats.fields as Record<string, unknown>);
  }
  return { ...snapshot, ats };
}

function snippetFromOpalosisBody(data: unknown): string {
  const raw = typeof data === 'string' ? data : JSON.stringify(data ?? '');
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.startsWith('data:')) return '';
  return cleaned.slice(0, 220);
}

const ATS_LABELS: Record<string, string> = {
  fullName: 'Nombre completo',
  dni: 'DNI',
  email: 'Correo',
  phone: 'Teléfono',
  phone2: 'Teléfono 2',
  hireDate: 'Fecha de contratación',
  birthDate: 'Fecha de nacimiento',
  agreedSalary: 'Salario acordado',
  address: 'Dirección',
  processTitle: 'Proceso / puesto',
  clientName: 'Cliente',
};

const OPSFLOW_LABELS: Record<string, string> = {
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
};

function pushField(
  items: Array<Record<string, unknown>>,
  source: string,
  key: string,
  label: string,
  value: unknown,
  note?: string,
) {
  if (value === null || value === undefined) return;
  const safe = summarizeHeavyValue(key, value);
  if (typeof safe === 'string' && !safe.trim()) return;
  if (Array.isArray(safe) && safe.length === 0) return;
  items.push({
    source,
    key,
    label,
    value: typeof safe === 'object' ? JSON.stringify(safe) : safe,
    note: note ?? null,
    classificationRequired: true,
  });
}

/** Inventario con etiquetas del camino ATS→OpsFlow (incluidos campos dinámicos). */
function buildPayloadJsonFromSnapshot(
  snapshot: Record<string, unknown> | null,
  hrFields: Record<string, unknown>,
  refOps: string,
): string {
  const fieldInventory: Array<Record<string, unknown>> = [];
  const ats = (snapshot?.ats ?? {}) as Record<string, unknown>;
  const ops = (snapshot?.opsflow ?? {}) as Record<string, unknown>;
  const identity = (ats.identity ?? {}) as Record<string, unknown>;
  const fields = (ats.fields ?? {}) as Record<string, unknown>;

  pushField(fieldInventory, 'ats', 'fullName', ATS_LABELS.fullName ?? 'fullName', identity.fullName);
  pushField(
    fieldInventory,
    'ats',
    'dni',
    ATS_LABELS.dni ?? 'dni',
    identity.dni,
    'Etiqueta del camino ATS/OpsFlow. Opalosis tipifica al reclasificar.',
  );
  pushField(fieldInventory, 'ats', 'email', ATS_LABELS.email ?? 'email', identity.email);
  pushField(fieldInventory, 'ats', 'phone', ATS_LABELS.phone ?? 'phone', identity.phone);
  pushField(fieldInventory, 'ats', 'phone2', ATS_LABELS.phone2 ?? 'phone2', identity.phone2);

  // Todos los campos ATS, incluidos dinámicos (ej. mascotas)
  for (const [key, value] of Object.entries(fields)) {
    pushField(
      fieldInventory,
      'ats',
      key,
      ATS_LABELS[key] ?? key,
      value,
      ATS_LABELS[key] ? undefined : 'Campo dinámico del ATS: clasificar o descartar en Opalosis.',
    );
  }

  pushField(fieldInventory, 'ats', 'workerName', 'workerName', ats.workerName);
  pushField(fieldInventory, 'ats', 'sourceApp', 'sourceApp', ats.sourceApp);
  pushField(fieldInventory, 'ats', 'sourceCandidateId', 'sourceCandidateId', ats.sourceCandidateId);
  pushField(fieldInventory, 'ats', 'sourceProcessId', 'sourceProcessId', ats.sourceProcessId);

  for (const [key, label] of Object.entries(OPSFLOW_LABELS)) {
    pushField(fieldInventory, 'opsflow', key, label, ops[key]);
  }

  for (const [key, value] of Object.entries(ops)) {
    if (key in OPSFLOW_LABELS) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) continue;
    pushField(
      fieldInventory,
      'opsflow',
      key,
      key,
      value,
      'Campo OpsFlow adicional: clasificar o descartar en Opalosis.',
    );
  }

  pushField(
    fieldInventory,
    'operator',
    'urlDocumentoAdjunto',
    'urlDocumentoAdjunto',
    hrFields.urlDocumentoAdjunto,
  );
  pushField(fieldInventory, 'operator', 'observacion', 'observacion', hrFields.observacion);
  pushField(fieldInventory, 'operator', 'refOperaciones', 'refOperaciones', refOps);

  const labels = (hrFields.labels ?? {}) as Record<string, unknown>;
  pushField(
    fieldInventory,
    'operator',
    'empleadoCargoLabel',
    'empleadoCargoLabel',
    labels.empleadoCargo,
  );
  pushField(
    fieldInventory,
    'operator',
    'lugarTrabajoLabel',
    'lugarTrabajoLabel',
    labels.lugarTrabajo,
  );

  return JSON.stringify({
    payloadVersion: 2,
    purpose:
      'Todos los datos del trabajador con etiquetas del camino ATS→OpsFlow. Opalosis reclasifica o descarta cada ítem (no hay estándar 1:1).',
    sourceApp: 'OpsFlow',
    refOperaciones: refOps || null,
    capturedAt: snapshot?.capturedAt ?? new Date().toISOString(),
    classificationModel: {
      rule:
        'Cada ítem de fieldInventory es independiente. El usuario de Opalosis decide si lo usa y con qué etiqueta de su BD (ej. origen "mascotas" → "animales"), o lo descarta.',
      examples: [
        { originLabel: 'DNI', possibleOpalosis: 'TipoDocumentoId + Documento tipificado' },
        { originLabel: 'mascotas', possibleOpalosis: 'animales | descartar' },
      ],
    },
    fieldInventory,
    raw: {
      ats: {
        sourceApp: ats.sourceApp,
        sourcePackageId: ats.sourcePackageId,
        sourceCandidateId: ats.sourceCandidateId,
        sourceProcessId: ats.sourceProcessId,
        workerName: ats.workerName,
        identity,
        fields,
        meta: ats.meta ?? {},
      },
      opsflow: ops,
    },
  });
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
 * CamposDetalle: extras ATS sin columna DTO + datos OpsFlow (días/horario) +
 * puestoContrato / unidadDestaque de ficha (distintos de cargo/lugar tipados).
 * La trazabilidad completa sigue viajando en PayloadJson.
 */
function buildCamposDetalle(
  snapshot: Record<string, unknown> | null,
): Array<{ Campo: string; Valor: string }> {
  const out: Array<{ Campo: string; Valor: string }> = [];
  const seen = new Set<string>();
  const ats = (snapshot?.ats ?? {}) as Record<string, unknown>;
  const ops = (snapshot?.opsflow ?? {}) as Record<string, unknown>;
  const fields = (ats.fields ?? {}) as Record<string, unknown>;
  const complementary = (ats.complementary ?? {}) as Record<string, unknown>;

  const push = (campoRaw: string, value: unknown) => {
    if (value === null || value === undefined) return;
    const safe = summarizeHeavyValue(campoRaw, value);
    const v = typeof safe === 'object' ? JSON.stringify(safe) : String(safe);
    if (!v.trim()) return;
    const campo = campoRaw.trim();
    if (!campo || seen.has(campo)) return;
    seen.add(campo);
    out.push({ Campo: campo, Valor: v });
  };

  for (const [key, value] of Object.entries(fields)) {
    if (ATS_KEYS_ALREADY_IN_DTO.has(key)) continue;
    push(key, value);
  }

  push('puestoContrato', complementary.puestoContrato);
  push('unidadDestaque', complementary.unidadDestaque);
  push('workDays', ops.workDays);
  push('entryTime', ops.entryTime);
  push('exitTime', ops.exitTime);

  return out;
}

/** Construye RegistroIngresoDTO desde hr_fields + snapshot (inventario en PayloadJson). */
function buildRegistroPayload(
  hrFields: Record<string, unknown>,
  workerSnapshot?: Record<string, unknown> | null,
): Record<string, unknown> {
  workerSnapshot = sanitizeWorkerSnapshot(workerSnapshot ?? null);
  const isLegacy = hrFields.apellido_paterno !== undefined && hrFields.apellidoPaterno === undefined;

  const documento = pickString(hrFields.documento, hrFields.Documento);
  const tipoDocumentoId = pickNumber(
    hrFields.tipoDocumentoId,
    hrFields.TipoDocumentoId,
    isLegacy ? 1 : null,
  ) ?? 1;

  const refOps = pickString(hrFields.refOperaciones, hrFields.ref_operaciones);
  const observacion = pickString(hrFields.observacion, hrFields.Observacion);
  const obsParts = [
    refOps ? `Ref OpsFlow: ${refOps}` : '',
    observacion,
    'Ver PayloadJson.fieldInventory: etiquetas originales ATS/OpsFlow para retiquetado en Opalosis.',
  ].filter(Boolean);

  const existingPayload = pickString(hrFields.payloadJson);
  const payloadJson =
    existingPayload && !existingPayload.includes('data:')
      ? existingPayload
      : buildPayloadJsonFromSnapshot(workerSnapshot ?? null, hrFields, refOps);

  return {
    TipoDocumentoId: tipoDocumentoId,
    Documento: documento,
    ApellidoPaterno: pickString(hrFields.apellidoPaterno, hrFields.apellido_paterno) || null,
    ApellidoMaterno: pickString(hrFields.apellidoMaterno, hrFields.apellido_materno) || null,
    Nombres: pickString(hrFields.nombres, hrFields.Nombres) || null,
    Sexo: (pickString(hrFields.sexo, hrFields.Sexo) || 'M').slice(0, 1).toUpperCase(),
    FechaNacimiento: pickString(hrFields.fechaNacimiento, hrFields.fecha_nacimiento) || null,
    FechaIngreso: pickString(hrFields.fechaIngreso, hrFields.fecha_ingreso) || null,
    Direccion: pickString(hrFields.direccion) || null,
    Telefono: pickString(hrFields.telefono) || null,
    CorreoPersonal: pickString(hrFields.correoPersonal, hrFields.correo_personal) || null,
    TieneAsignacionFamiliar: Boolean(
      hrFields.tieneAsignacionFamiliar ?? hrFields.asignacion_familiar ?? false,
    ),
    TieneHijos: Boolean(hrFields.tieneHijos ?? false),
    EmpleadoCargoId: pickNumber(hrFields.empleadoCargoId),
    LugarTrabajoId: pickNumber(hrFields.lugarTrabajoId, hrFields.unidad_id),
    OpaloId: pickNumber(hrFields.opaloId, hrFields.empresa_codigo) ?? 103,
    ModeloContratoId: pickNumber(hrFields.modeloContratoId),
    RegimenLaboralId: pickNumber(hrFields.regimenLaboralId),
    MesesContrato: pickNumber(hrFields.mesesContrato),
    JornadaLaboral: pickString(hrFields.jornadaLaboral) || null,
    Turno: pickString(hrFields.turno) || null,
    Sueldo: pickNumber(hrFields.sueldo),
    Movilidad: pickNumber(hrFields.movilidad) ?? 0,
    SistemaPension:
      pickNumber(hrFields.fondoPensionId) != null
        ? String(pickNumber(hrFields.fondoPensionId))
        : pickString(hrFields.sistemaPension) || null,
    BancoPreferencia:
      pickNumber(hrFields.bancoId) != null
        ? String(pickNumber(hrFields.bancoId))
        : pickString(hrFields.bancoPreferencia) || null,
    FondoPensionId: pickNumber(hrFields.fondoPensionId) ?? null,
    BancoId: pickNumber(hrFields.bancoId) ?? null,
    NumeroCuentaTrabajador: pickString(hrFields.numeroCuentaTrabajador) || null,
    UrlDocumentoAdjunto: pickString(hrFields.urlDocumentoAdjunto) || null,
    TallaPoloCamisa: pickString(hrFields.tallaPoloCamisa) || null,
    TallaCasaca: pickString(hrFields.tallaCasaca) || null,
    TallaPantalon: pickString(hrFields.tallaPantalon) || null,
    TallaZapatos: pickNumber(hrFields.tallaZapatos),
    PaisId: pickNumber(hrFields.paisId) ?? 173,
    UbigeoId: pickNumber(hrFields.ubigeoId),
    SupervisorId: pickNumber(hrFields.supervisorId),
    CentroCostoId: pickNumber(hrFields.centroCostoId),
    EstadoCivil:
      pickString((hrFields.labels as Record<string, unknown> | undefined)?.estadoCivil, hrFields.estadoCivil) ||
      null,
    Observacion: obsParts.length ? obsParts.join(' | ') : null,
    UsuarioProcesoId: pickNumber(hrFields.usuarioProcesoId),
    UsuarioOf: pickString(hrFields.usuarioOf) || 'opsflow',
    PayloadJson: payloadJson,
    CamposDetalle: buildCamposDetalle(workerSnapshot ?? null),
  };
}

function parseRegistroResponse(data: unknown) {
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    resultado: Boolean(row.Resultado ?? row.resultado),
    mensaje: String(row.Mensaje ?? row.mensaje ?? ''),
    mensajeError: String(row.MensajeError ?? row.mensajeError ?? ''),
    ingresoId: row.IngresoId !== undefined ? Number(row.IngresoId) : undefined,
    ingresoCod: row.IngresoCod !== undefined ? String(row.IngresoCod) : undefined,
    fechaRegistro: row.FechaRegistro !== undefined ? String(row.FechaRegistro) : undefined,
  };
}

function simulateRegistroResponse(documento: string): Record<string, unknown> {
  const suffix = documento.replace(/\D/g, '').slice(-4) || '0000';
  return {
    Resultado: true,
    Mensaje: 'Se registro ingreso.',
    MensajeError: 'sin errores',
    IngresoId: Math.floor(Math.random() * 900) + 100,
    IngresoCod: `ING-SIM-${suffix}`,
    FechaRegistro: new Date().toISOString(),
  };
}

function defaultTestPayload(): Record<string, unknown> {
  return {
    TipoDocumentoId: 1,
    Documento: '12345678',
    ApellidoPaterno: 'Perez',
    ApellidoMaterno: 'Gomez',
    Nombres: 'Juan Carlos',
    Sexo: 'M',
    FechaIngreso: new Date().toISOString().slice(0, 10),
    EmpleadoCargoId: null,
    LugarTrabajoId: null,
    OpaloId: 103,
    Sueldo: 1130,
    Movilidad: 0,
    PaisId: 173,
    UsuarioOf: 'opsflow.test',
  };
}

function normalizeCatalogItems(catalog: string, data: unknown): Array<{ id: number; label: string; raw: Record<string, unknown> }> {
  if (!Array.isArray(data)) return [];

  return data.map((row) => {
    const r = row as Record<string, unknown>;
    let id = 0;
    let label = '';

    switch (catalog) {
      case 'tipo-documento':
        id = Number(r.TipoDocumentoId ?? 0);
        label = String(r.TipoDocumento ?? '');
        break;
      case 'estado-civil':
        id = Number(r.EstadoCivilId ?? 0);
        label = String(r.NombreEstadoCivil ?? '');
        break;
      case 'paises':
        id = Number(r.PaisId ?? 0);
        label = String(r.NombrePais ?? '');
        break;
      case 'departamentos':
      case 'provincias':
      case 'distritos':
        id = Number(r.UbigeoId ?? 0);
        label = String(r.Nombre ?? '');
        break;
      case 'empleado-cargo':
        id = Number(r.EmpleadoCargoId ?? 0);
        label = String(r.NombreCargo ?? '');
        break;
      case 'lugar-trabajo':
        id = Number(r.LugarTrabajoId ?? 0);
        label = String(r.NombreLugarTrabajo ?? '');
        break;
      case 'opalos':
        id = Number(r.OpaloId ?? 0);
        label = String(r.NombreOpalo ?? '');
        break;
      case 'regimen-laboral':
        id = Number(r.RegimenLaboralId ?? 0);
        label = String(r.NombreRegimen ?? '');
        break;
      case 'modelo-contrato':
        id = Number(r.ModeloContratoId ?? 0);
        label = String(r.NombreModelo ?? '');
        break;
      case 'fondo-pension':
        id = Number(r.FondoPensionId ?? 0);
        label = String(r.NombreFondoPension ?? '');
        break;
      case 'banco':
        id = Number(r.BancoId ?? 0);
        label = String(r.NombreBanco ?? '');
        break;
      case 'supervisores':
        id = Number(r.PersonaId ?? 0);
        label = String(r.Nombres ?? '');
        break;
      case 'centro-costo':
        id = Number(r.CentroCostoId ?? 0);
        label = String(r.NombreCentroCosto ?? '');
        break;
      default:
        id = Number(Object.values(r)[0] ?? 0);
        label = String(Object.values(r)[1] ?? '');
    }

    return { id, label, raw: r };
  }).filter((x) => x.id && x.label);
}

function simulateCatalog(catalog: string) {
  const samples: Record<string, Array<{ id: number; label: string; raw: Record<string, unknown> }>> = {
    'tipo-documento': [
      { id: 1, label: 'Libreta electoral o DNI', raw: {} },
      { id: 2, label: 'Pasaporte', raw: {} },
      { id: 4, label: 'Carné de extranjeria', raw: {} },
      { id: 5, label: 'Permiso temporal de permanencia', raw: {} },
    ],
    'estado-civil': [
      { id: 2159, label: 'Soltero', raw: {} },
      { id: 2158, label: 'Casado', raw: {} },
      { id: 3632, label: 'Conviviente', raw: {} },
    ],
    opalos: [
      { id: 103, label: 'Opalo Peru SAC', raw: {} },
      { id: 104, label: 'Opalo Intermediacion', raw: {} },
      { id: 153, label: 'Opalo Tercerizacion', raw: {} },
    ],
    'regimen-laboral': [
      { id: 1, label: 'General', raw: {} },
      { id: 4, label: 'Formacion laboral', raw: {} },
    ],
    'modelo-contrato': [
      { id: 7, label: 'OPINTER - SERVICIO ESPECIFICO RENOVACION', raw: {} },
    ],
    'fondo-pension': [
      { id: 9, label: 'ONP', raw: {} },
      { id: 4, label: 'PROFUTURO', raw: {} },
    ],
    'empleado-cargo': [
      { id: 1909, label: 'asistente de nominas (simulado)', raw: {} },
    ],
    'lugar-trabajo': [
      { id: 1967, label: 'ESTACION COPACABANA (simulado)', raw: {} },
    ],
    paises: [{ id: 173, label: 'Perú', raw: {} }],
    departamentos: [{ id: 1392, label: 'LIMA', raw: {} }],
    provincias: [{ id: 1393, label: 'LIMA', raw: {} }],
    distritos: [{ id: 1394, label: 'LIMA', raw: {} }],
    banco: [{ id: 1, label: 'Banco de Credito del Peru (BCP)', raw: {} }],
    supervisores: [{ id: 321201, label: '43635031 | SUPERVISOR SIMULADO', raw: {} }],
    'centro-costo': [{ id: 233, label: 'HORTIFRUT', raw: {} }],
  };
  return samples[catalog] ?? [];
}

async function registerWorkerInOpalosis(
  row: Record<string, unknown>,
  mock: boolean,
): Promise<RegistroIngresoResult> {
  const hrFields = (row.hr_fields ?? {}) as Record<string, unknown>;
  const workerSnapshot = (row.worker_snapshot ?? null) as Record<string, unknown> | null;
  const payload = buildRegistroPayload(hrFields, workerSnapshot);
  const documento = String(payload.Documento ?? '');
  const refOperaciones = pickString(hrFields.refOperaciones, hrFields.ref_operaciones, row.ref_operaciones);
  const workerName = String(row.worker_name ?? '');

  if (!documento) {
    return {
      queueItemId: row.id as string | undefined,
      refOperaciones,
      workerName,
      documento,
      ok: false,
      businessRejected: true,
      itemStatus: 'rechazado',
      mensaje: 'Sin documento — no se puede registrar en Opalosis',
      response: { Resultado: false, MensajeError: 'Documento requerido' },
    };
  }

  let responseData: Record<string, unknown>;
  let httpStatus = 200;

  if (mock) {
    responseData = simulateRegistroResponse(documento);
  } else {
    const result = await callOpalosis(PATHS.registro, { method: 'POST', body: payload });
    httpStatus = result.status;
    responseData = (result.data ?? {}) as Record<string, unknown>;

    // Fallo técnico (≠ 200)
    if (result.status !== 200) {
      return {
        queueItemId: row.id as string | undefined,
        refOperaciones,
        workerName,
        documento,
        ok: false,
        businessRejected: false,
        itemStatus: 'rechazado',
        mensaje: (() => {
          const snippet = snippetFromOpalosisBody(result.data);
          return `Error técnico HTTP ${result.status}${snippet ? `: ${snippet}` : ''}`;
        })(),
        response: responseData,
      };
    }
  }

  const parsed = parseRegistroResponse(responseData);

  // HTTP 200 + Resultado false = rechazo de negocio
  if (!parsed.resultado) {
    return {
      queueItemId: row.id as string | undefined,
      refOperaciones,
      workerName,
      documento,
      ok: false,
      businessRejected: true,
      itemStatus: 'rechazado',
      mensaje: parsed.mensajeError || parsed.mensaje || 'Rechazado por Opalosis',
      response: responseData,
    };
  }

  return {
    queueItemId: row.id as string | undefined,
    refOperaciones,
    workerName,
    documento,
    ok: true,
    businessRejected: false,
    itemStatus: 'recibido',
    ingresoId: parsed.ingresoId,
    ingresoCod: parsed.ingresoCod,
    mensaje: `${parsed.ingresoCod ?? parsed.mensaje}`.trim(),
    response: responseData,
  };
}

function derivePackageStatus(results: RegistroIngresoResult[], mock: boolean): string {
  const successCount = results.filter((r) => r.ok).length;
  if (successCount === 0) return 'error';
  if (successCount < results.length) return 'parcialmente_procesado';
  return mock ? 'simulado' : 'enviado';
}

function mapEstadoToItemStatus(estado: string): string {
  const n = estado.toLowerCase();
  if (n.includes('rechaz')) return 'rechazado';
  if (n.includes('observ')) return 'observado';
  if (n.includes('proces')) return 'procesado';
  if (n.includes('recib')) return 'recibido';
  return 'recibido';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const mock = isMockMode();

    if (body.action === 'fetch-catalog') {
      const catalog = (body.catalog ?? '').trim();
      if (!CATALOG_PATHS.has(catalog)) {
        return jsonResponse({ error: `Catálogo no soportado: ${catalog}` }, 400);
      }

      if (mock) {
        return jsonResponse({
          catalog,
          items: simulateCatalog(catalog),
          simulated: true,
        });
      }

      const query: Record<string, string | number | undefined> = {};
      if (body.buscar?.trim()) query.buscar = body.buscar.trim();
      if (body.departamentoId) query.DepartamentoId = body.departamentoId;
      if (body.provinciaId) query.ProvinciaId = body.provinciaId;

      const result = await callOpalosis(`/${catalog}`, { method: 'GET', query });
      if (!result.ok) {
        return jsonResponse({
          error: `Opalosis respondió HTTP ${result.status}`,
          details: result.data,
        }, 502);
      }

      return jsonResponse({
        catalog,
        items: normalizeCatalogItems(catalog, result.data),
        simulated: false,
      });
    }

    if (body.action === 'test-registro-ingreso') {
      const payload = body.testPayload ?? defaultTestPayload();

      if (mock) {
        return jsonResponse({
          simulated: true,
          endpoint: PATHS.registro,
          request: payload,
          response: simulateRegistroResponse(String(payload.Documento ?? '12345678')),
        });
      }

      const result = await callOpalosis(PATHS.registro, { method: 'POST', body: payload });
      return jsonResponse({
        simulated: false,
        endpoint: PATHS.registro,
        request: payload,
        httpStatus: result.status,
        ok: result.status === 200,
        response: result.data,
      }, result.status === 200 ? 200 : 502);
    }

    if (body.action === 'send-package') {
      const queueItemIds = body.queueItemIds ?? [];
      const reportDate = body.reportDate?.trim();

      if (!reportDate) return jsonResponse({ error: 'reportDate is required' }, 400);
      if (queueItemIds.length === 0) {
        return jsonResponse({ error: 'queueItemIds must not be empty' }, 400);
      }

      const { data: queueRows, error: queueError } = await supabaseAdmin
        .from('hr_outbound_ingreso_queue')
        .select('*')
        .in('id', queueItemIds)
        .eq('queue_status', 'pendiente_envio');

      if (queueError) return jsonResponse({ error: 'Database error loading queue' }, 500);
      if (!queueRows || queueRows.length !== queueItemIds.length) {
        return jsonResponse({
          error: 'Algunos trabajadores ya no están pendientes de envío o no existen',
        }, 400);
      }

      const sourcePackageId = crypto.randomUUID();

      const { data: insertedPackage, error: packageError } = await supabaseAdmin
        .from('hr_outbound_ingreso_packages')
        .insert({
          source_package_id: sourcePackageId,
          report_date: reportDate,
          worker_count: queueRows.length,
          status: 'pendiente',
          sender_note: body.senderNote?.trim() || null,
          sent_by_name: body.sentByName?.trim() || null,
        })
        .select('*')
        .single();

      if (packageError || !insertedPackage) {
        console.error('Package insert error:', packageError);
        return jsonResponse({ error: 'Failed to create package' }, 500);
      }

      const packageItems = queueRows.map((row) => ({
        package_id: insertedPackage.id,
        queue_item_id: row.id,
        ref_operaciones: row.ref_operaciones,
        resource_id: row.resource_id,
        worker_name: row.worker_name,
        worker_snapshot: row.worker_snapshot,
        hr_fields: row.hr_fields,
        item_status: 'pendiente',
      }));

      const { data: insertedItems, error: itemsError } = await supabaseAdmin
        .from('hr_outbound_ingreso_package_items')
        .insert(packageItems)
        .select('id, queue_item_id, ref_operaciones');

      if (itemsError || !insertedItems) {
        await supabaseAdmin.from('hr_outbound_ingreso_packages').delete().eq('id', insertedPackage.id);
        return jsonResponse({ error: 'Failed to create package items', details: itemsError }, 500);
      }

      const itemIdByQueueId = new Map(
        insertedItems.map((item) => [item.queue_item_id as string, item.id as string]),
      );

      const registrationResults: RegistroIngresoResult[] = [];
      for (const row of queueRows as Array<Record<string, unknown>>) {
        const result = await registerWorkerInOpalosis(row, mock);
        registrationResults.push(result);

        const packageItemId = itemIdByQueueId.get(row.id as string);
        if (packageItemId) {
          await supabaseAdmin
            .from('hr_outbound_ingreso_package_items')
            .update({
              item_status: result.itemStatus,
              mensaje: result.mensaje,
              empleado_id_rrhh: result.ingresoId ?? null,
              ingreso_cod: result.ingresoCod ?? null,
              opalosis_estado: result.ok ? 'Recibido' : null,
              opalosis_etapa: result.ok ? 'Nuevo' : null,
            })
            .eq('id', packageItemId);
        }
      }

      const packageStatus = derivePackageStatus(registrationResults, mock);
      const sentAt = new Date().toISOString();
      const fechaRecepcion = registrationResults.find((r) => r.ok)?.response.FechaRegistro as
        | string
        | undefined;

      const opalosisResponse = {
        endpoint: PATHS.registro,
        sourcePackageId,
        workerCount: queueRows.length,
        successCount: registrationResults.filter((r) => r.ok).length,
        results: registrationResults.map((r) => ({
          refOperaciones: r.refOperaciones,
          workerName: r.workerName,
          documento: r.documento,
          ok: r.ok,
          businessRejected: r.businessRejected,
          ingresoId: r.ingresoId,
          ingresoCod: r.ingresoCod,
          mensaje: r.mensaje,
        })),
      };

      await supabaseAdmin
        .from('hr_outbound_ingreso_packages')
        .update({
          status: packageStatus,
          sent_at: sentAt,
          fecha_recepcion: fechaRecepcion ?? sentAt,
          opalosis_response: opalosisResponse,
        })
        .eq('id', insertedPackage.id);

      // Solo sacar de la cola los que se enviaron con éxito
      const successQueueIds = registrationResults
        .filter((r) => r.ok && r.queueItemId)
        .map((r) => r.queueItemId as string);

      if (successQueueIds.length > 0) {
        await supabaseAdmin
          .from('hr_outbound_ingreso_queue')
          .update({
            queue_status: 'incluido_paquete',
            package_id: insertedPackage.id,
          })
          .in('id', successQueueIds);
      }

      if (packageStatus === 'error') {
        const detail = registrationResults
          .map((r) => `${r.workerName} (${r.documento}): ${r.mensaje}`)
          .join(' | ');
        // HTTP 200: el cliente de Supabase traga el body en 502 y muestra solo "non-2xx".
        return jsonResponse({
          error: `Ningún trabajador pudo registrarse en Opalosis. ${detail}`,
          package: insertedPackage,
          details: opalosisResponse,
        }, 200);
      }

      const { data: finalPackage } = await supabaseAdmin
        .from('hr_outbound_ingreso_packages')
        .select('*')
        .eq('id', insertedPackage.id)
        .single();

      return jsonResponse({
        package: finalPackage,
        simulated: mock,
        opalosisResponse,
        partial: packageStatus === 'parcialmente_procesado',
      }, 201);
    }

    if (body.action === 'check-package-status') {
      const packageId = body.packageId?.trim();
      if (!packageId) return jsonResponse({ error: 'packageId is required' }, 400);

      const { data: pkg, error: pkgError } = await supabaseAdmin
        .from('hr_outbound_ingreso_packages')
        .select('*')
        .eq('id', packageId)
        .maybeSingle();

      if (pkgError) return jsonResponse({ error: 'Database error' }, 500);
      if (!pkg) return jsonResponse({ error: 'Paquete no encontrado' }, 404);

      const { data: items } = await supabaseAdmin
        .from('hr_outbound_ingreso_package_items')
        .select('*')
        .eq('package_id', packageId);

      if (mock) {
        return jsonResponse({
          packageId,
          status: pkg.status,
          simulated: true,
          mensaje: 'Modo simulación — configure Opalosis para consultar solicitudes reales.',
          items: items ?? [],
        });
      }

      const updatedItems: unknown[] = [];
      for (const item of items ?? []) {
        const hr = (item.hr_fields ?? {}) as Record<string, unknown>;
        const buscar = pickString(
          item.ingreso_cod,
          hr.documento,
          (item.worker_snapshot as Record<string, unknown>)?.opsflow
            ? ((item.worker_snapshot as { opsflow?: { dni?: string } }).opsflow?.dni)
            : '',
        );

        if (!buscar) {
          updatedItems.push(item);
          continue;
        }

        const result = await callOpalosis(PATHS.solicitudes, {
          method: 'GET',
          query: { Buscar: buscar },
        });

        if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
          updatedItems.push(item);
          continue;
        }

        const match = (result.data as Array<Record<string, unknown>>).find((s) => {
          const cod = String(s.IngresoCod ?? '');
          return item.ingreso_cod ? cod === item.ingreso_cod : true;
        }) ?? (result.data as Array<Record<string, unknown>>)[0];

        const estado = String(match.Estado ?? '');
        const etapa = String(match.Etapa ?? '');
        const itemStatus = mapEstadoToItemStatus(estado);

        const { data: updated } = await supabaseAdmin
          .from('hr_outbound_ingreso_package_items')
          .update({
            opalosis_estado: estado || null,
            opalosis_etapa: etapa || null,
            item_status: itemStatus,
            empleado_id_rrhh: match.IngresoId ? Number(match.IngresoId) : item.empleado_id_rrhh,
            ingreso_cod: match.IngresoCod ? String(match.IngresoCod) : item.ingreso_cod,
            mensaje: `${estado}${etapa ? ` / ${etapa}` : ''}`,
          })
          .eq('id', item.id)
          .select('*')
          .single();

        updatedItems.push(updated ?? item);
      }

      // Derivar estado del paquete
      const statuses = (updatedItems as Array<Record<string, unknown>>).map((i) =>
        String(i.opalosis_estado ?? i.item_status ?? ''),
      );
      let newPkgStatus = pkg.status as string;
      if (statuses.every((s) => s.toLowerCase().includes('proces'))) newPkgStatus = 'procesado';
      else if (statuses.every((s) => s.toLowerCase().includes('rechaz'))) newPkgStatus = 'rechazado';
      else if (statuses.some((s) => s.toLowerCase().includes('observ'))) newPkgStatus = 'observado';
      else if (statuses.some((s) => s.toLowerCase().includes('proces')) &&
        statuses.some((s) => !s.toLowerCase().includes('proces'))) {
        newPkgStatus = 'parcialmente_procesado';
      }

      await supabaseAdmin
        .from('hr_outbound_ingreso_packages')
        .update({ status: newPkgStatus })
        .eq('id', packageId);

      return jsonResponse({
        packageId,
        status: newPkgStatus,
        simulated: false,
        items: updatedItems,
      });
    }

    // Compat: fetch-unidades → lugar-trabajo
    if (body.action === 'fetch-unidades') {
      if (mock) {
        const items = simulateCatalog('lugar-trabajo');
        return jsonResponse({
          units: items.map((u) => ({
            opalosisUnidadId: u.id,
            nombre: u.label,
            activo: true,
            fetchedAt: new Date().toISOString(),
          })),
          simulated: true,
        });
      }

      const result = await callOpalosis('/lugar-trabajo', {
        method: 'GET',
        query: { buscar: body.buscar || 'a' },
      });
      if (!result.ok) {
        return jsonResponse({ error: `HTTP ${result.status}`, details: result.data }, 502);
      }
      const items = normalizeCatalogItems('lugar-trabajo', result.data);
      return jsonResponse({
        units: items.map((u) => ({
          opalosisUnidadId: u.id,
          nombre: u.label,
          activo: true,
          fetchedAt: new Date().toISOString(),
        })),
        simulated: false,
      });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('Edge Function Error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500,
    );
  }
});
