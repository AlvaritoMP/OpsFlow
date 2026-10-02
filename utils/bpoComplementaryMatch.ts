import type {
  BpoDependentRelationship,
  BpoEducationLevel,
  BpoMaritalStatus,
  BpoPersonnelProfile,
  WorkerSnapshotComplementary,
  WorkerSnapshotEducacion,
  WorkerSnapshotFamiliar,
} from '../types';

export type BpoProfileMatchKey =
  | 'nationality'
  | 'gender'
  | 'maritalStatus'
  | 'address'
  | 'emergencyContactPhone'
  | 'emergencyContactRelationship'
  | 'afpName'
  | 'educationLevel'
  | 'educationInstitution'
  | 'educationCareer'
  | 'educationCompletionYear';

export interface BpoDependentDraft {
  relationship: BpoDependentRelationship;
  fullName: string;
  notes?: string;
}

const EDUCATION_RANK: BpoEducationLevel[] = [
  'sin_estudios',
  'primaria',
  'secundaria',
  'tecnico',
  'universitario_incompleto',
  'universitario_completo',
  'postgrado',
  'otro',
];

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isBlankProfileValue(value: unknown): boolean {
  return text(value) === '';
}

function mapMaritalStatus(value: string): BpoMaritalStatus | undefined {
  const key = fold(value);
  if (!key) return undefined;
  if (key.startsWith('solter')) return 'soltero';
  if (key.startsWith('casad')) return 'casado';
  if (key.startsWith('conviv')) return 'conviviente';
  if (key.startsWith('divorci')) return 'divorciado';
  if (key.startsWith('viud')) return 'viudo';
  return undefined;
}

function mapEducationLevel(nivel: string): BpoEducationLevel | undefined {
  const key = fold(nivel);
  if (!key) return undefined;
  if (key.includes('sin estudio') || key.includes('ningun')) return 'sin_estudios';
  if (key.includes('postgrado') || key.includes('maestr') || key.includes('doctor') || key.includes('mba')) {
    return 'postgrado';
  }
  if (key.includes('incomplet') || key.includes('trunca') || key.includes('cursando')) {
    return 'universitario_incompleto';
  }
  if (key.includes('universit') || key.includes('bachiller') || key.includes('licenciat')) {
    return 'universitario_completo';
  }
  if (key.includes('tecnic') || key.includes('instituto')) return 'tecnico';
  if (key.includes('secund') || key.includes('colegio')) return 'secundaria';
  if (key.includes('primar')) return 'primaria';
  return 'otro';
}

function mapAfpName(value: string): string | undefined {
  const key = fold(value);
  if (!key || key === 'afp') return undefined;
  if (key === 'onp') return 'ONP';
  if (key.includes('integra')) return 'Integra';
  if (key.includes('prima')) return 'Prima';
  if (key.includes('profuturo')) return 'Profuturo';
  if (key.includes('habitat')) return 'Habitat';
  return undefined;
}

export function mapFamiliarRelationship(parentesco: string): BpoDependentRelationship {
  const key = fold(parentesco);
  if (key.includes('conyug') || key.includes('espos') || key.includes('conviv')) return 'conyuge';
  if (key.includes('hija')) return 'hija';
  if (key.includes('hijo')) return 'hijo';
  if (key.includes('madre') || key.includes('mama')) return 'madre';
  if (key.includes('padre') || key.includes('papa')) return 'padre';
  if (key.includes('hermana')) return 'hermana';
  if (key.includes('hermano')) return 'hermano';
  return 'otro';
}

export function familiarFullName(familiar: WorkerSnapshotFamiliar): string {
  return [familiar.nombres, familiar.apellidoPaterno, familiar.apellidoMaterno]
    .map((part) => text(part))
    .filter(Boolean)
    .join(' ');
}

export function normalizePersonName(value: string): string {
  return fold(value);
}

function completionYear(periodo?: string): number | undefined {
  const years = text(periodo).match(/\b(?:19|20)\d{2}\b/g);
  if (!years?.length) return undefined;
  const year = Number(years[years.length - 1]);
  return year >= 1900 && year <= 2100 ? year : undefined;
}

function educationRank(nivel: string): number {
  const level = mapEducationLevel(nivel);
  if (!level || level === 'otro') return text(nivel) ? 0 : -1;
  return EDUCATION_RANK.indexOf(level);
}

function pickEducation(entries: WorkerSnapshotEducacion[] | undefined): WorkerSnapshotEducacion | undefined {
  const usable = (entries || []).filter((entry) =>
    text(entry.nivel) || text(entry.institucion) || text(entry.grado) || text(entry.periodo),
  );
  if (usable.length === 0) return undefined;
  return usable.reduce((best, entry) => {
    const bestRank = educationRank(text(best.nivel));
    const nextRank = educationRank(text(entry.nivel));
    return nextRank >= bestRank ? entry : best;
  });
}

function composeAddress(complementary: WorkerSnapshotComplementary): string {
  return [complementary.direccion, complementary.distrito, complementary.provincia, complementary.departamento]
    .map((part) => text(part))
    .filter(Boolean)
    .join(', ');
}

/** Campos de la ficha complementaria que pueden copiarse a un expediente BPO vacío. */
export function matchComplementaryToBpoProfile(
  complementary: WorkerSnapshotComplementary,
  current: Partial<BpoPersonnelProfile>,
): Partial<Pick<BpoPersonnelProfile, BpoProfileMatchKey>> {
  const patch: Partial<Pick<BpoPersonnelProfile, BpoProfileMatchKey>> = {};
  const fill = <K extends BpoProfileMatchKey>(key: K, value: BpoPersonnelProfile[K] | undefined) => {
    if (value === undefined || text(value) === '') return;
    if (!isBlankProfileValue(current[key])) return;
    patch[key] = value;
  };

  fill('nationality', text(complementary.nacionalidad) || undefined);
  fill('gender', text(complementary.sexo) || undefined);
  fill('maritalStatus', mapMaritalStatus(text(complementary.estadoCivil)));
  fill('address', composeAddress(complementary) || undefined);
  fill('emergencyContactPhone', text(complementary.emergenciaTelefono) || undefined);
  fill('emergencyContactRelationship', text(complementary.emergenciaParentesco) || undefined);

  const pension = text(complementary.sistemaPensionesDeseado) || text(complementary.sistemaPensionesAnterior);
  fill('afpName', mapAfpName(pension));

  const education = pickEducation(complementary.educacion);
  if (education) {
    fill('educationLevel', mapEducationLevel(text(education.nivel)));
    fill('educationInstitution', text(education.institucion) || undefined);
    fill('educationCareer', text(education.grado) || undefined);
    fill('educationCompletionYear', completionYear(education.periodo));
  }

  return patch;
}

export function matchComplementaryDependents(
  complementary: WorkerSnapshotComplementary,
  existingNames: string[],
): BpoDependentDraft[] {
  const taken = new Set(existingNames.map(normalizePersonName).filter(Boolean));
  const drafts: BpoDependentDraft[] = [];

  for (const familiar of complementary.familiares || []) {
    const fullName = familiarFullName(familiar);
    const key = normalizePersonName(fullName);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    const notes = [
      text(familiar.edad) ? `Edad: ${text(familiar.edad)}` : '',
      text(familiar.telefono) ? `Tel: ${text(familiar.telefono)}` : '',
    ]
      .filter(Boolean)
      .join('. ');
    drafts.push({
      relationship: mapFamiliarRelationship(text(familiar.parentesco)),
      fullName,
      notes: notes || undefined,
    });
  }

  return drafts;
}

export function complementaryHasExpedienteSource(complementary: WorkerSnapshotComplementary): boolean {
  if (text(complementary.nacionalidad)) return true;
  if (text(complementary.sexo)) return true;
  if (text(complementary.estadoCivil)) return true;
  if (composeAddress(complementary)) return true;
  if (text(complementary.emergenciaTelefono) || text(complementary.emergenciaParentesco)) return true;
  if (mapAfpName(text(complementary.sistemaPensionesDeseado) || text(complementary.sistemaPensionesAnterior))) {
    return true;
  }
  if (pickEducation(complementary.educacion)) return true;
  return (complementary.familiares || []).some((familiar) => familiarFullName(familiar));
}
