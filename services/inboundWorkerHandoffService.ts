import { supabase, handleSupabaseError } from './supabase';
import type {
  InboundHandoffItem,
  InboundHandoffItemStatus,
  InboundHandoffPackage,
  InboundHandoffPackageStatus,
  InboundHandoffPackageWithItems,
  WorkerSnapshot,
} from '../types';

// ============================================
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

function transformPackageFromDB(data: Record<string, unknown>): InboundHandoffPackage {
  return {
    id: data.id as string,
    sourceApp: (data.source_app as string) ?? 'Opalo ATS',
    sourcePackageId: data.source_package_id as string,
    status: data.status as InboundHandoffPackageStatus,
    workerCount: data.worker_count as number,
    senderNote: (data.sender_note as string) ?? undefined,
    sourceCreatedByName: (data.source_created_by_name as string) ?? undefined,
    sourceSentAt: data.source_sent_at as string,
    payloadVersion: (data.payload_version as number) ?? 1,
    receivedAt: data.received_at as string,
    processingStartedAt: (data.processing_started_at as string) ?? undefined,
    completedAt: (data.completed_at as string) ?? undefined,
    receiverNote: (data.receiver_note as string) ?? undefined,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

function transformItemFromDB(data: Record<string, unknown>): InboundHandoffItem {
  return {
    id: data.id as string,
    packageId: data.package_id as string,
    sourceCandidateId: (data.source_candidate_id as string) ?? undefined,
    sourceProcessId: (data.source_process_id as string) ?? undefined,
    workerName: data.worker_name as string,
    workerSnapshot: data.worker_snapshot as WorkerSnapshot,
    itemStatus: data.item_status as InboundHandoffItemStatus,
    assignedWorkUnitId: (data.assigned_work_unit_id as string) ?? undefined,
    assignedAt: (data.assigned_at as string) ?? undefined,
    createdResourceId: (data.created_resource_id as string) ?? undefined,
    createdAt: data.created_at as string,
  };
}

// ============================================
// SERVICIO DE RECEPCIÓN ATS
// ============================================

export const inboundWorkerHandoffService = {
  async listPackages(options?: {
    status?: InboundHandoffPackageStatus;
  }): Promise<InboundHandoffPackage[]> {
    try {
      let query = supabase
        .from('inbound_worker_handoff_packages')
        .select('*')
        .order('received_at', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((row) => transformPackageFromDB(row as Record<string, unknown>));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async getPackageWithItems(packageId: string): Promise<InboundHandoffPackageWithItems | null> {
    try {
      const { data: pkg, error: pkgError } = await supabase
        .from('inbound_worker_handoff_packages')
        .select('*')
        .eq('id', packageId)
        .single();

      if (pkgError) throw pkgError;
      if (!pkg) return null;

      const { data: items, error: itemsError } = await supabase
        .from('inbound_worker_handoff_items')
        .select('*')
        .eq('package_id', packageId)
        .order('created_at', { ascending: true });

      if (itemsError) throw itemsError;

      return {
        ...transformPackageFromDB(pkg as Record<string, unknown>),
        items: (items ?? []).map((row) => transformItemFromDB(row as Record<string, unknown>)),
      };
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  async markProcessing(packageId: string): Promise<InboundHandoffPackage | null> {
    return this.updatePackageStatus(packageId, 'processing', {
      processing_started_at: new Date().toISOString(),
    });
  },

  async markCompleted(packageId: string, receiverNote?: string): Promise<InboundHandoffPackage | null> {
    return this.updatePackageStatus(packageId, 'completed', {
      completed_at: new Date().toISOString(),
      receiver_note: receiverNote?.trim() || null,
    });
  },

  async markRejected(packageId: string, receiverNote?: string): Promise<InboundHandoffPackage | null> {
    return this.updatePackageStatus(packageId, 'rejected', {
      completed_at: new Date().toISOString(),
      receiver_note: receiverNote?.trim() || null,
    });
  },

  async markPartiallyCompleted(
    packageId: string,
    receiverNote?: string,
  ): Promise<InboundHandoffPackage | null> {
    return this.updatePackageStatus(packageId, 'partially_completed', {
      completed_at: new Date().toISOString(),
      receiver_note: receiverNote?.trim() || null,
    });
  },

  async updateItemStatus(
    itemId: string,
    itemStatus: InboundHandoffItemStatus,
  ): Promise<InboundHandoffItem | null> {
    try {
      const updatePayload: Record<string, unknown> = { item_status: itemStatus };
      if (itemStatus === 'assigned') {
        updatePayload.assigned_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('inbound_worker_handoff_items')
        .update(updatePayload)
        .eq('id', itemId)
        .select('*')
        .single();

      if (error) throw error;
      return data ? transformItemFromDB(data as Record<string, unknown>) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  /** Registra el ítem como colaborador creado en una unidad OpsFlow */
  async registerItemAsResource(
    itemId: string,
    workUnitId: string,
    resourceId: string,
  ): Promise<InboundHandoffItem | null> {
    try {
      const { data, error } = await supabase
        .from('inbound_worker_handoff_items')
        .update({
          assigned_work_unit_id: workUnitId,
          created_resource_id: resourceId,
          assigned_at: new Date().toISOString(),
          item_status: 'assigned',
        })
        .eq('id', itemId)
        .select('*')
        .single();

      if (error) throw error;
      return data ? transformItemFromDB(data as Record<string, unknown>) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  /** Fase 2: asignar trabajador recibido a una unidad OpsFlow (sin crear recurso aún) */
  async assignItemToWorkUnit(itemId: string, workUnitId: string): Promise<InboundHandoffItem | null> {
    try {
      const { data, error } = await supabase
        .from('inbound_worker_handoff_items')
        .update({
          assigned_work_unit_id: workUnitId,
          assigned_at: new Date().toISOString(),
          item_status: 'assigned',
        })
        .eq('id', itemId)
        .select('*')
        .single();

      if (error) throw error;
      return data ? transformItemFromDB(data as Record<string, unknown>) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  async updatePackageStatus(
    packageId: string,
    status: InboundHandoffPackageStatus,
    extraFields: Record<string, unknown> = {},
  ): Promise<InboundHandoffPackage | null> {
    try {
      const { data, error } = await supabase
        .from('inbound_worker_handoff_packages')
        .update({ status, ...extraFields })
        .eq('id', packageId)
        .select('*')
        .single();

      if (error) throw error;
      return data ? transformPackageFromDB(data as Record<string, unknown>) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },
};
