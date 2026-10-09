import { Resource, ResourceType, Unit } from '../types';
import { supabase } from './supabase';
import { resourcesService } from './resourcesService';
import { contractService } from './contractService';
import { hrOutboundIngresoService } from './hrOutboundIngresoService';
import { documentNumbersMatch, normalizeDocumentNumber } from '../utils/documentNumber';

/** worker_rehire_events todavía no está en los tipos generados del cliente. */
function fromTable(name: string) {
  return (supabase as any).from(name);
}

export const REHIRE_REASON_PRESETS = [
  'Nueva unidad',
  'Cambio de régimen o condiciones laborales',
] as const;

export interface RehirePersonnelInput {
  targetUnitId: string;
  rehireReason: string;
  puesto?: string;
  startDate: string;
  endDate?: string;
  monthlySalary?: number;
  workConditionAmount?: number;
  mobilityBonus?: number;
  familyAllowance?: boolean;
  jornadaType?: string;
  laborRegime?: string;
  workDays?: string[];
  entryTime?: string;
  exitTime?: string;
  assignedShift?: string;
  isShared?: boolean;
}

export interface WorkerRehireBadge {
  sourceResourceId: string;
  newResourceId: string;
  targetUnitId: string;
  rehireReason: string;
  createdAt: string;
  successorName: string;
  successorActive: boolean;
}

export interface ActivePersonnelMatch {
  id: string;
  name: string;
  unitId?: string;
}

export interface RehirePersonnelResult {
  resource: Resource;
  enqueued: boolean;
  enqueueWarning?: string;
}

const MIGRATION_HINT =
  'Falta aplicar la migración migrations/MIGRATION_WORKER_REHIRE.sql en Supabase.';

function isMissingRehireSchema(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /worker_rehire_events|rehired_from_resource_id|rehire_reason|schema cache|PGRST204|42703/i.test(
    message,
  );
}

function isOpenEmployment(row: {
  archived?: boolean | null;
  personnel_status?: string | null;
}): boolean {
  if (row.archived) return false;
  if (row.personnel_status === 'cesado' || row.personnel_status === 'archivado') return false;
  return true;
}

function documentVariants(dni: string): string[] {
  const normalized = normalizeDocumentNumber(dni);
  if (!normalized) return [];
  const variants = new Set<string>([normalized, dni.trim(), normalized.toLowerCase()]);
  const stripped = normalized.replace(/^0+/, '') || '0';
  variants.add(stripped);
  if (/^\d+$/.test(normalized) && normalized.length < 8) {
    variants.add(normalized.padStart(8, '0'));
  }
  if (/^\d+$/.test(stripped) && stripped.length < 8) {
    variants.add(stripped.padStart(8, '0'));
  }
  return [...variants].filter(Boolean);
}

export function buildRehireReason(preset: string, other: string): string {
  if (preset === 'Otro') return other.trim();
  return preset.trim();
}

export async function findActivePersonnelByDocument(
  dni?: string | null,
): Promise<ActivePersonnelMatch | null> {
  const variants = documentVariants(dni || '');
  if (variants.length === 0) return null;

  const { data, error } = await fromTable('resources')
    .select('id, name, dni, unit_id, archived, personnel_status')
    .eq('type', 'Personal')
    .eq('archived', false)
    .in('dni', variants);

  if (error) throw new Error(`No se pudo verificar el documento: ${error.message}`);

  const match = (data || []).find(
    (row) => isOpenEmployment(row) && documentNumbersMatch(row.dni, dni),
  );
  if (!match) return null;
  return {
    id: match.id as string,
    name: String(match.name || 'Trabajador'),
    unitId: (match.unit_id as string | null) || undefined,
  };
}

async function findActiveSuccessor(sourceResourceId: string): Promise<ActivePersonnelMatch | null> {
  const { data: events, error } = await fromTable('worker_rehire_events')
    .select('new_resource_id')
    .eq('source_resource_id', sourceResourceId);

  if (error) {
    if (isMissingRehireSchema(error)) throw new Error(MIGRATION_HINT);
    throw new Error(`No se pudo verificar recontrataciones previas: ${error.message}`);
  }

  const ids = [...new Set((events || []).map((row) => row.new_resource_id as string).filter(Boolean))];
  if (ids.length === 0) return null;

  const { data: successors, error: successorError } = await fromTable('resources')
    .select('id, name, unit_id, archived, personnel_status')
    .in('id', ids);

  if (successorError) {
    throw new Error(`No se pudo leer la relación recontratada: ${successorError.message}`);
  }

  const active = (successors || []).find((row) => isOpenEmployment(row));
  if (!active) return null;
  return {
    id: active.id as string,
    name: String(active.name || 'Trabajador'),
    unitId: (active.unit_id as string | null) || undefined,
  };
}

export async function listRehireBadges(
  sourceIds: string[],
): Promise<Map<string, WorkerRehireBadge>> {
  const map = new Map<string, WorkerRehireBadge>();
  if (sourceIds.length === 0) return map;

  try {
    const events: Array<Record<string, unknown>> = [];
    for (let i = 0; i < sourceIds.length; i += 80) {
      const chunk = sourceIds.slice(i, i + 80);
      const { data, error } = await fromTable('worker_rehire_events')
        .select('source_resource_id, new_resource_id, target_unit_id, rehire_reason, created_at')
        .in('source_resource_id', chunk);
      if (error) throw error;
      events.push(...((data || []) as Array<Record<string, unknown>>));
    }
    if (events.length === 0) return map;

    const successorById = new Map<string, { name: string; active: boolean }>();
    const newIds = [...new Set(events.map((row) => String(row.new_resource_id || '')).filter(Boolean))];
    for (let i = 0; i < newIds.length; i += 80) {
      const chunk = newIds.slice(i, i + 80);
      const { data, error } = await fromTable('resources')
        .select('id, name, archived, personnel_status')
        .in('id', chunk);
      if (error) throw error;
      for (const row of (data || []) as Array<Record<string, unknown>>) {
        successorById.set(String(row.id), {
          name: String(row.name || 'Trabajador'),
          active: isOpenEmployment({
            archived: row.archived as boolean | null,
            personnel_status: row.personnel_status as string | null,
          }),
        });
      }
    }

    const sorted = [...events].sort((a, b) =>
      String(a.created_at || '').localeCompare(String(b.created_at || '')),
    );
    for (const row of sorted) {
      const sourceId = String(row.source_resource_id || '');
      const newId = String(row.new_resource_id || '');
      if (!sourceId || !newId) continue;
      const successor = successorById.get(newId);
      const badge: WorkerRehireBadge = {
        sourceResourceId: sourceId,
        newResourceId: newId,
        targetUnitId: String(row.target_unit_id || ''),
        rehireReason: String(row.rehire_reason || ''),
        createdAt: String(row.created_at || ''),
        successorName: successor?.name || 'Trabajador',
        successorActive: successor?.active ?? false,
      };
      const previous = map.get(sourceId);
      if (previous?.successorActive && !badge.successorActive) continue;
      map.set(sourceId, badge);
    }
    return map;
  } catch (error) {
    console.warn('No se pudo leer el historial de recontrataciones:', error);
    return map;
  }
}

/**
 * Abre una relación laboral nueva a partir de un cesado o archivado.
 * La ficha de origen no se modifica: el cese sigue en el archivo y queda copiado en worker_rehire_events.
 */
export async function rehirePersonnel(
  source: Resource & { originalUnitId?: string },
  input: RehirePersonnelInput,
  context: { unit: Unit; usuarioOf?: string | null },
): Promise<RehirePersonnelResult> {
  const closed =
    source.archived ||
    source.personnelStatus === 'cesado' ||
    source.personnelStatus === 'archivado';
  if (!closed) {
    throw new Error('Solo se puede recontratar a un trabajador cesado o archivado.');
  }
  if (!input.targetUnitId || input.targetUnitId !== context.unit.id) {
    throw new Error('Seleccione la unidad de la nueva relación laboral.');
  }
  if (context.unit.status === 'Desactivado') {
    throw new Error('No se puede recontratar en una unidad desactivada.');
  }
  if (!input.startDate) {
    throw new Error('Indique la fecha de inicio de la nueva contratación.');
  }
  if (!input.rehireReason.trim()) {
    throw new Error('Indique el motivo de la recontratación.');
  }
  if (input.endDate && input.endDate < input.startDate) {
    throw new Error('La fecha de fin no puede ser anterior al inicio.');
  }

  const activeByDocument = await findActivePersonnelByDocument(source.dni);
  if (activeByDocument && activeByDocument.id !== source.id) {
    throw new Error(
      `${source.name} ya tiene una relación laboral activa (${activeByDocument.name}). El cese de esta ficha se conserva. Cese esa relación antes de recontratar de nuevo.`,
    );
  }

  const activeSuccessor = await findActiveSuccessor(source.id);
  if (activeSuccessor) {
    throw new Error(
      `Ya existe una recontratación activa de ${source.name} (${activeSuccessor.name}). El cese original permanece en el archivo.`,
    );
  }

  let created: Resource;
  try {
    created = await resourcesService.create(
      {
        name: source.name,
        type: ResourceType.PERSONNEL,
        quantity: 1,
        status: 'Activo',
        image: source.image,
        dni: source.dni,
        localidad: source.localidad,
        phone: source.phone,
        email: source.email,
        birthDate: source.birthDate,
        inboundSourceData: source.inboundSourceData,
        trainings: source.trainings?.length ? source.trainings : undefined,
        puesto: input.puesto?.trim() || undefined,
        startDate: input.startDate,
        endDate: input.endDate || undefined,
        personnelStatus: 'activo',
        archived: false,
        contractGenerated: false,
        inTraining: false,
        isShared: input.isShared ?? false,
        assignedShift: input.assignedShift?.trim() || undefined,
        monthlySalary: input.monthlySalary,
        workConditionAmount: input.workConditionAmount,
        mobilityBonus: input.mobilityBonus,
        familyAllowance: input.familyAllowance,
        jornadaType: input.jornadaType?.trim() || undefined,
        laborRegime: input.laborRegime?.trim() || undefined,
        workDays: input.workDays?.length ? input.workDays : undefined,
        entryTime: input.entryTime?.trim() || undefined,
        exitTime: input.exitTime?.trim() || undefined,
        rehiredFromResourceId: source.id,
        rehireReason: input.rehireReason.trim(),
        assignedAssets: [],
      },
      context.unit.id,
    );
  } catch (error) {
    if (isMissingRehireSchema(error)) throw new Error(MIGRATION_HINT);
    throw error;
  }

  if (input.startDate && input.endDate) {
    try {
      const history = await contractService.getContractHistory(created.id);
      const initial = history.find((contract) => contract.contractNumber === 1) || history[0];
      if (initial) {
        await contractService.updateContract(initial.id, {
          startDate: input.startDate,
          endDate: input.endDate,
          notes: 'Contrato inicial por recontratación',
          monthlySalary: input.monthlySalary ?? null,
          workConditionAmount: input.workConditionAmount ?? null,
        });
      } else {
        await contractService.createContract(
          created.id,
          input.startDate,
          input.endDate,
          'Contrato inicial por recontratación',
          {
            monthlySalary: input.monthlySalary,
            workConditionAmount: input.workConditionAmount,
          },
        );
      }
    } catch (error) {
      console.error('La recontratación quedó creada, pero no el contrato inicial:', error);
    }
  }

  const { error: eventError } = await fromTable('worker_rehire_events').insert({
    source_resource_id: source.id,
    new_resource_id: created.id,
    source_unit_id: source.unitId || source.originalUnitId || null,
    target_unit_id: context.unit.id,
    source_personnel_status: source.personnelStatus || (source.archived ? 'archivado' : 'cesado'),
    source_start_date: source.startDate || null,
    source_end_date: source.endDate || null,
    termination_reason: source.terminationReason || null,
    source_puesto: source.puesto || null,
    source_monthly_salary: source.monthlySalary ?? null,
    source_work_condition_amount: source.workConditionAmount ?? null,
    source_labor_regime: source.laborRegime || null,
    source_jornada_type: source.jornadaType || null,
    rehire_reason: input.rehireReason.trim(),
  });

  if (eventError) {
    if (isMissingRehireSchema(eventError)) {
      throw new Error(
        `${source.name} ya fue dado de alta en ${context.unit.name}, pero ${MIGRATION_HINT}`,
      );
    }
    throw new Error(
      `${source.name} ya fue dado de alta en ${context.unit.name}, pero no se pudo guardar el historial del cese: ${eventError.message}`,
    );
  }

  let enqueued = false;
  let enqueueWarning: string | undefined;
  try {
    const queueItem = await hrOutboundIngresoService.enqueueFromDirectOpsflowCreate(
      { ...created, unitId: created.unitId || context.unit.id },
      context.unit,
      context.usuarioOf,
    );
    enqueued = Boolean(queueItem);
    if (!queueItem) {
      enqueueWarning =
        'La ficha nueva ya estaba en la cola o en un paquete. Revise Envío Opalosis.';
    }
  } catch (error) {
    enqueueWarning = error instanceof Error ? error.message : String(error);
  }

  return { resource: created, enqueued, enqueueWarning };
}
