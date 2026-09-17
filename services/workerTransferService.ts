import { supabase, handleSupabaseError } from './supabase';
import { Resource, ResourceType, WorkerUnitTransferMode } from '../types';
import { resourcesService } from './resourcesService';
import { authService } from './authService';
import { isUnitOperational } from '../utils/unitStatus';

export interface UnitTransferTarget {
  id: string;
  name: string;
  clientName: string;
  status: string;
}

export interface TransferWorkerParams {
  resourceId: string;
  fromUnitId: string;
  toUnitId: string;
  notes?: string;
  swappedResourceId?: string;
}

export interface TransferWorkerResult {
  worker: Resource;
  swappedWorker?: Resource;
  fromUnitId: string;
  toUnitId: string;
  mode: WorkerUnitTransferMode;
}

async function warnOnSideEffect(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error: any) {
    if (error?.code === '42P01' || error?.code === 'PGRST205') return;
    console.warn(`[workerTransferService] ${label}:`, error);
  }
}

async function applyUnitSideEffects(resourceId: string, fromUnitId: string, toUnitId: string): Promise<void> {
  await warnOnSideEffect('unit book member', async () => {
    const { unitBookService } = await import('./unitBookService');
    await unitBookService.moveMemberToUnit(resourceId, fromUnitId, toUnitId);
  });
  await warnOnSideEffect('expediente BPO', async () => {
    const { bpoPersonnelService } = await import('./bpoPersonnelService');
    await bpoPersonnelService.reassignUnit(resourceId, toUnitId);
  });
}

async function recordTransfer(params: {
  resourceId: string;
  fromUnitId: string;
  toUnitId: string;
  swappedResourceId?: string;
  mode: WorkerUnitTransferMode;
  notes?: string;
}): Promise<void> {
  const session = authService.getSession();
  const { error } = await supabase.from('worker_unit_transfers').insert({
    resource_id: params.resourceId,
    from_unit_id: params.fromUnitId,
    to_unit_id: params.toUnitId,
    swapped_resource_id: params.swappedResourceId || null,
    mode: params.mode,
    notes: params.notes?.trim() || null,
    transferred_by: session?.userId || null,
  });
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
    console.warn('[workerTransferService] No se pudo registrar auditoría de traslado:', error);
  }
}

async function auditMove(worker: Resource, fromUnitId: string, toUnitId: string, mode: WorkerUnitTransferMode): Promise<void> {
  try {
    const { auditService } = await import('./auditService');
    await auditService.log({
      actionType: 'UPDATE',
      entityType: 'RESOURCE',
      entityId: worker.id,
      entityName: worker.name,
      changes: {
        before: { unitId: fromUnitId },
        after: { unitId: toUnitId },
        fields: ['unit_id'],
      },
      description:
        mode === 'swap'
          ? `Intercambio de unidad de ${worker.name}`
          : `Traslado de ${worker.name} a otra unidad`,
    });
  } catch {
    // La auditoría no debe bloquear el traslado
  }
}

async function moveOneWorker(resourceId: string, fromUnitId: string, toUnitId: string): Promise<Resource> {
  const current = await resourcesService.getById(resourceId);
  if (!current) {
    throw new Error('No se encontró el trabajador a trasladar.');
  }
  if (current.type !== ResourceType.PERSONNEL) {
    throw new Error('Solo se puede trasladar personal operativo.');
  }
  if (current.archived) {
    throw new Error('No se puede trasladar un trabajador archivado. Recupérelo desde Archivo.');
  }

  const currentUnitId = current.unitId || fromUnitId;
  if (currentUnitId && currentUnitId !== fromUnitId) {
    throw new Error('El trabajador ya no pertenece a la unidad de origen. Actualice la vista e intente de nuevo.');
  }
  if (currentUnitId === toUnitId) {
    throw new Error('El trabajador ya pertenece a la unidad destino.');
  }

  const updated = await resourcesService.update(resourceId, { assignedZones: [] }, toUnitId);
  await applyUnitSideEffects(resourceId, fromUnitId, toUnitId);
  return { ...updated, unitId: toUnitId, assignedZones: [] };
}

export const workerTransferService = {
  async listDestinationUnits(excludeUnitId: string): Promise<UnitTransferTarget[]> {
    const { data, error } = await supabase
      .from('units')
      .select('id, name, client_name, status')
      .order('name', { ascending: true });

    if (error) {
      handleSupabaseError(error);
      throw error;
    }

    return (data || [])
      .filter((row: any) => row.id !== excludeUnitId && isUnitOperational({ status: row.status }))
      .map((row: any) => ({
        id: row.id as string,
        name: (row.name as string) || 'Sin nombre',
        clientName: (row.client_name as string) || '',
        status: (row.status as string) || '',
      }));
  },

  async listActivePersonnel(unitId: string): Promise<Resource[]> {
    const resources = await resourcesService.getByUnitId(unitId, false);
    return resources.filter(
      (r) =>
        r.type === ResourceType.PERSONNEL &&
        !r.archived &&
        r.personnelStatus !== 'cesado'
    );
  },

  async transferWorker(params: TransferWorkerParams): Promise<TransferWorkerResult> {
    const fromUnitId = params.fromUnitId?.trim();
    const toUnitId = params.toUnitId?.trim();
    if (!params.resourceId || !fromUnitId || !toUnitId) {
      throw new Error('Faltan datos para el traslado.');
    }
    if (fromUnitId === toUnitId) {
      throw new Error('Seleccione una unidad distinta a la actual.');
    }
    if (params.swappedResourceId && params.swappedResourceId === params.resourceId) {
      throw new Error('No se puede intercambiar un trabajador consigo mismo.');
    }

    const mode: WorkerUnitTransferMode = params.swappedResourceId ? 'swap' : 'transfer';

    const worker = await moveOneWorker(params.resourceId, fromUnitId, toUnitId);
    await recordTransfer({
      resourceId: params.resourceId,
      fromUnitId,
      toUnitId,
      swappedResourceId: params.swappedResourceId,
      mode,
      notes: params.notes,
    });
    await auditMove(worker, fromUnitId, toUnitId, mode);

    let swappedWorker: Resource | undefined;
    if (params.swappedResourceId) {
      try {
        swappedWorker = await moveOneWorker(params.swappedResourceId, toUnitId, fromUnitId);
        await recordTransfer({
          resourceId: params.swappedResourceId,
          fromUnitId: toUnitId,
          toUnitId: fromUnitId,
          swappedResourceId: params.resourceId,
          mode: 'swap',
          notes: params.notes,
        });
        await auditMove(swappedWorker, toUnitId, fromUnitId, 'swap');
      } catch (error) {
        try {
          await moveOneWorker(params.resourceId, toUnitId, fromUnitId);
        } catch (rollbackError) {
          console.error('[workerTransferService] Falló el rollback del primer trabajador:', rollbackError);
        }
        throw error;
      }
    }

    return {
      worker,
      swappedWorker,
      fromUnitId,
      toUnitId,
      mode,
    };
  },
};
