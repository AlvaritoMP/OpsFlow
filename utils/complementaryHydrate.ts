import type {
  ComplementaryStatus,
  WorkerSnapshot,
  WorkerSnapshotComplementary,
} from '../types';

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return text;
}

function pickText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return undefined;
}

/** Campos canónicos de ficha que suelen venir en identity/fields del ATS. */
const CORE_FICHA_KEYS: (keyof WorkerSnapshotComplementary)[] = [
  'nombres',
  'apellidoPaterno',
  'apellidoMaterno',
  'nroDocumento',
  'fechaNacimiento',
  'sexo',
  'email',
  'telefono',
  'direccion',
  'distrito',
  'provincia',
];

/**
 * Completa complementary vacío/parcial con identity + fields del snapshot.
 * No pisa valores ya presentes en complementary.
 */
export function hydrateComplementaryFromSnapshot(
  snapshot?: WorkerSnapshot | null,
  stored?: WorkerSnapshotComplementary | null,
): WorkerSnapshotComplementary {
  const complementary = { ...(stored ?? snapshot?.complementary ?? {}) };
  const identity = snapshot?.identity ?? {};
  const fields = snapshot?.fields ?? {};

  const fill = (key: keyof WorkerSnapshotComplementary, ...candidates: unknown[]) => {
    if (asText(complementary[key])) return;
    const value = pickText(...candidates);
    if (value !== undefined) complementary[key] = value;
  };

  fill('nombres', identity.nombres, fields.nombres, fields.firstName);
  fill(
    'apellidoPaterno',
    identity.apellidoPaterno,
    fields.apellidoPaterno,
    fields.apPaterno,
    fields.apellido_paterno,
  );
  fill(
    'apellidoMaterno',
    identity.apellidoMaterno,
    fields.apellidoMaterno,
    fields.apMaterno,
    fields.apellido_materno,
  );
  fill('nroDocumento', complementary.nroDocumento, identity.dni, fields.dni, fields.nroDocumento);
  fill(
    'fechaNacimiento',
    fields.fechaNacimiento,
    fields.fNac,
    fields.birthDate,
    fields.fecha_nacimiento,
  );
  fill('edad', fields.edad, fields.age);
  fill('sexo', fields.sexo, fields.sex, fields.gender);
  fill('email', identity.email, fields.email);
  fill('telefono', identity.phone, identity.phone2, fields.phone, fields.telefono);
  fill('direccion', fields.direccion, fields.address);
  fill('distrito', fields.distrito, fields.district, fields.Distrito, fields.District);
  fill('provincia', fields.provincia, fields.province, fields.Provincia, fields.Province);
  fill(
    'departamento',
    fields.departamento,
    fields.department,
    fields.departamentoNombre,
    fields.Departamento,
    fields.Department,
  );
  // Solo el campo explícito de ficha; no copiar processTitle (proceso ATS) ni puesto OpsFlow.
  fill('puestoContrato', fields.puestoContrato);
  // Solo unidad de destaque de ficha; no copiar fields.unidad ni unidad OpsFlow.
  fill('unidadDestaque', fields.unidadDestaque);
  fill('bancoSueldo', fields.bancoSueldo, fields.banco);
  fill('bancoCts', fields.bancoCts);
  fill('estadoCivil', fields.estadoCivil, fields.estado_civil);
  fill('nacionalidad', fields.nacionalidad, fields.nationality);
  fill(
    'comoSeEnteroEmpleo',
    fields.source,
    fields.Fuente,
    fields.fuente,
    fields.Source,
    fields.FUENTE,
    fields.comoSeEnteroEmpleo,
  );

  // Fallback: buscar por etiqueta "Fuente" en fieldLabels del ATS
  if (!asText(complementary.comoSeEnteroEmpleo)) {
    const labels = snapshot?.meta?.fieldLabels ?? {};
    for (const [key, label] of Object.entries(labels)) {
      if (asText(label).toLowerCase() === 'fuente' && asText(fields[key])) {
        complementary.comoSeEnteroEmpleo = asText(fields[key]);
        break;
      }
    }
  }
  if (!asText(complementary.comoSeEnteroEmpleo)) {
    for (const [key, value] of Object.entries(fields)) {
      if (/fuente|^source$/i.test(key) && asText(value)) {
        complementary.comoSeEnteroEmpleo = asText(value);
        break;
      }
    }
  }

  if (!asText(complementary.tipoDocumento) && asText(complementary.nroDocumento || identity.dni)) {
    complementary.tipoDocumento = 'DNI';
  }

  return complementary;
}

export function deriveComplementaryStatusFromData(
  complementary: WorkerSnapshotComplementary | null | undefined,
  metaStatus?: ComplementaryStatus | null,
  missingFields?: string[],
): ComplementaryStatus {
  if (missingFields && missingFields.length > 0) return 'incomplete';
  if (!complementary || Object.keys(complementary).length === 0) {
    return metaStatus ?? 'missing';
  }

  const filledCore = CORE_FICHA_KEYS.filter((key) => asText(complementary[key])).length;
  if (filledCore === 0) return metaStatus === 'complete' ? 'incomplete' : metaStatus ?? 'missing';
  if (filledCore < Math.ceil(CORE_FICHA_KEYS.length * 0.6)) return 'incomplete';
  return metaStatus ?? 'complete';
}
