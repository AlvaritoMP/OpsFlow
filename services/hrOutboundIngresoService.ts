import { supabase, handleSupabaseError } from './supabase';
import { generateRefOperaciones } from '../utils/hrIntegration';
import {
  buildOutboundWorkerSnapshot,
  mapSnapshotToHrFields,
  type EnqueueAssignmentInput,
} from '../utils/hrOpalosisMapper';
import type {
  HrOutboundIngresoPackage,
  HrOutboundIngresoPackageItem,
  HrOutboundIngresoPackageWithItems,
  HrOutboundIngresoQueueItem,
  HrUnitCacheEntry,
  HrUnitMapping,
} from '../types';

function transformQueueFromDB(data: Record<string, unknown>): HrOutboundIngresoQueueItem {
  return {
    id: data.id as string,
    resourceId: data.resource_id as string,
    inboundHandoffItemId: (data.inbound_handoff_item_id as string) ?? undefined,
    opsflowUnitId: data.opsflow_unit_id as string,
    workerName: data.worker_name as string,
    assignedAt: data.assigned_at as string,
    reportDate: data.report_date as string,
    workerSnapshot: data.worker_snapshot as HrOutboundIngresoQueueItem['workerSnapshot'],
    hrFields: (data.hr_fields as HrOutboundIngresoQueueItem['hrFields']) ?? undefined,
    refOperaciones: data.ref_operaciones as string,
    queueStatus: data.queue_status as HrOutboundIngresoQueueItem['queueStatus'],
    packageId: (data.package_id as string) ?? undefined,
    exclusionNote: (data.exclusion_note as string) ?? undefined,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

function transformPackageFromDB(data: Record<string, unknown>): HrOutboundIngresoPackage {
  return {
    id: data.id as string,
    sourcePackageId: data.source_package_id as string,
    reportDate: data.report_date as string,
    workerCount: data.worker_count as number,
    status: data.status as HrOutboundIngresoPackage['status'],
    senderNote: (data.sender_note as string) ?? undefined,
    sentByName: (data.sent_by_name as string) ?? undefined,
    sentAt: (data.sent_at as string) ?? undefined,
    fechaRecepcion: (data.fecha_recepcion as string) ?? undefined,
    opalosisResponse: (data.opalosis_response as Record<string, unknown>) ?? undefined,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

function transformPackageItemFromDB(data: Record<string, unknown>): HrOutboundIngresoPackageItem {
  return {
    id: data.id as string,
    packageId: data.package_id as string,
    queueItemId: (data.queue_item_id as string) ?? undefined,
    refOperaciones: data.ref_operaciones as string,
    resourceId: data.resource_id as string,
    workerName: data.worker_name as string,
    workerSnapshot: data.worker_snapshot as HrOutboundIngresoPackageItem['workerSnapshot'],
    hrFields: (data.hr_fields as HrOutboundIngresoPackageItem['hrFields']) ?? undefined,
    itemStatus: data.item_status as HrOutboundIngresoPackageItem['itemStatus'],
    mensaje: (data.mensaje as string) ?? undefined,
    empleadoIdRrhh: (data.empleado_id_rrhh as number) ?? undefined,
    createdAt: data.created_at as string,
  };
}

function todayReportDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const hrOutboundIngresoService = {
  async getUnitMapping(opsflowUnitId: string): Promise<HrUnitMapping | null> {
    try {
      const { data, error } = await supabase
        .from('hr_unit_mappings')
        .select('*')
        .eq('opsflow_unit_id', opsflowUnitId)
        .eq('activo', true)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id as string,
        opsflowUnitId: data.opsflow_unit_id as string,
        opalosisUnidadId: data.opalosis_unidad_id as number,
        opalosisUnidadNombre: (data.opalosis_unidad_nombre as string) ?? undefined,
        empresaCodigo: (data.empresa_codigo as number) ?? undefined,
        activo: data.activo as boolean,
      };
    } catch {
      return null;
    }
  },

  async countQueueItemsToday(): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('hr_outbound_ingreso_queue')
        .select('*', { count: 'exact', head: true })
        .eq('report_date', todayReportDate());

      if (error) throw error;
      return count ?? 0;
    } catch {
      return 0;
    }
  },

  /** Encola trabajador tras asignación ATS → unidad. */
  async enqueueFromAssignment(input: EnqueueAssignmentInput): Promise<HrOutboundIngresoQueueItem | null> {
    try {
      const existing = await supabase
        .from('hr_outbound_ingreso_queue')
        .select('id')
        .eq('resource_id', input.resource.id)
        .maybeSingle();

      if (existing.data) {
        return null;
      }

      const mapping = await this.getUnitMapping(input.unit.id);
      const sequence = (await this.countQueueItemsToday()) + 1;
      const refOperaciones = generateRefOperaciones(sequence);
      const workerSnapshot = buildOutboundWorkerSnapshot({
        ...input,
        opalosisUnidadId: mapping?.opalosisUnidadId ?? input.opalosisUnidadId,
        empresaCodigo: mapping?.empresaCodigo ?? input.empresaCodigo,
      });
      const hrFields = mapSnapshotToHrFields(workerSnapshot, refOperaciones, {
        opalosisUnidadId: mapping?.opalosisUnidadId ?? null,
        empresaCodigo: mapping?.empresaCodigo ?? 103,
      });

      const { data, error } = await supabase
        .from('hr_outbound_ingreso_queue')
        .insert({
          resource_id: input.resource.id,
          inbound_handoff_item_id: input.handoffItem.id,
          opsflow_unit_id: input.unit.id,
          worker_name: input.resource.name,
          assigned_at: new Date().toISOString(),
          report_date: todayReportDate(),
          worker_snapshot: workerSnapshot,
          hr_fields: hrFields,
          ref_operaciones: refOperaciones,
          queue_status: 'pendiente_envio',
        })
        .select('*')
        .single();

      if (error) throw error;
      return transformQueueFromDB(data as Record<string, unknown>);
    } catch (error) {
      console.error('enqueueFromAssignment error:', error);
      return null;
    }
  },

  async listQueueItems(options?: {
    reportDate?: string;
    reportDateFrom?: string;
    reportDateTo?: string;
    status?: HrOutboundIngresoQueueItem['queueStatus'];
  }): Promise<HrOutboundIngresoQueueItem[]> {
    try {
      let query = supabase
        .from('hr_outbound_ingreso_queue')
        .select('*')
        .order('assigned_at', { ascending: false });

      if (options?.status) {
        query = query.eq('queue_status', options.status);
      } else {
        query = query.eq('queue_status', 'pendiente_envio');
      }

      if (options?.reportDate) {
        query = query.eq('report_date', options.reportDate);
      } else {
        if (options?.reportDateFrom) {
          query = query.gte('report_date', options.reportDateFrom);
        }
        if (options?.reportDateTo) {
          query = query.lte('report_date', options.reportDateTo);
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((row) => transformQueueFromDB(row as Record<string, unknown>));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async excludeQueueItem(queueItemId: string, note?: string): Promise<void> {
    const { error } = await supabase
      .from('hr_outbound_ingreso_queue')
      .update({
        queue_status: 'excluido',
        exclusion_note: note?.trim() || null,
      })
      .eq('id', queueItemId)
      .eq('queue_status', 'pendiente_envio');

    if (error) throw error;
  },

  async listPackages(limit = 50): Promise<HrOutboundIngresoPackage[]> {
    try {
      const { data, error } = await supabase
        .from('hr_outbound_ingreso_packages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map((row) => transformPackageFromDB(row as Record<string, unknown>));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async getPackageWithItems(packageId: string): Promise<HrOutboundIngresoPackageWithItems | null> {
    try {
      const { data: pkg, error: pkgError } = await supabase
        .from('hr_outbound_ingreso_packages')
        .select('*')
        .eq('id', packageId)
        .single();

      if (pkgError) throw pkgError;
      if (!pkg) return null;

      const { data: items, error: itemsError } = await supabase
        .from('hr_outbound_ingreso_package_items')
        .select('*')
        .eq('package_id', packageId)
        .order('created_at', { ascending: true });

      if (itemsError) throw itemsError;

      return {
        ...transformPackageFromDB(pkg as Record<string, unknown>),
        items: (items ?? []).map((row) => transformPackageItemFromDB(row as Record<string, unknown>)),
      };
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  async sendPackage(options: {
    queueItemIds: string[];
    reportDate: string;
    senderNote?: string;
    sentByName?: string;
  }): Promise<{ package: HrOutboundIngresoPackage; simulated: boolean }> {
    if (options.queueItemIds.length === 0) {
      throw new Error('Seleccione al menos un trabajador para enviar.');
    }

    const { data, error } = await supabase.functions.invoke('hr-opalosis-integration', {
      body: {
        action: 'send-package',
        queueItemIds: options.queueItemIds,
        reportDate: options.reportDate,
        senderNote: options.senderNote ?? null,
        sentByName: options.sentByName ?? null,
      },
    });

    if (error) {
      throw new Error(error.message || 'Error al enviar paquete a Opalosis');
    }
    if (data?.error) {
      throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    }

    return {
      package: transformPackageFromDB(data.package as Record<string, unknown>),
      simulated: Boolean(data.simulated),
    };
  },

  async checkPackageStatus(packageId: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.functions.invoke('hr-opalosis-integration', {
      body: { action: 'check-package-status', packageId },
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data as Record<string, unknown>;
  },

  async fetchUnidadesFromOpalosis(): Promise<{ units: HrUnitCacheEntry[]; simulated: boolean }> {
    const { data, error } = await supabase.functions.invoke('hr-opalosis-integration', {
      body: { action: 'fetch-unidades' },
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);

    return {
      units: (data.units ?? []) as HrUnitCacheEntry[],
      simulated: Boolean(data.simulated),
    };
  },

  async listCachedUnits(): Promise<HrUnitCacheEntry[]> {
    try {
      const { data, error } = await supabase
        .from('hr_units_cache')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;

      return (data ?? []).map((row) => ({
        opalosisUnidadId: row.opalosis_unidad_id as number,
        nombre: row.nombre as string,
        activo: row.activo as boolean,
        fetchedAt: row.fetched_at as string,
      }));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },
};
