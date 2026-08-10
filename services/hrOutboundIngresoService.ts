import { supabase, handleSupabaseError } from './supabase';
import { generateRefOperaciones } from '../utils/hrIntegration';
import {
  buildOutboundWorkerSnapshot,
  mapSnapshotToHrFields,
  normalizeHrFields,
  type EnqueueAssignmentInput,
} from '../utils/hrOpalosisMapper';
import type {
  HrOpalosisIngresoFields,
  HrOutboundIngresoPackage,
  HrOutboundIngresoPackageItem,
  HrOutboundIngresoPackageWithItems,
  HrOutboundIngresoQueueItem,
  HrUnitCacheEntry,
  HrUnitMapping,
  OpalosisCatalogItem,
  OpalosisCatalogName,
  Unit,
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
    hrFields: normalizeHrFields(data.hr_fields) ?? undefined,
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
    hrFields: normalizeHrFields(data.hr_fields) ?? undefined,
    itemStatus: data.item_status as HrOutboundIngresoPackageItem['itemStatus'],
    mensaje: (data.mensaje as string) ?? undefined,
    empleadoIdRrhh: (data.empleado_id_rrhh as number) ?? undefined,
    ingresoCod: (data.ingreso_cod as string) ?? undefined,
    opalosisEstado: (data.opalosis_estado as string) ?? undefined,
    opalosisEtapa: (data.opalosis_etapa as string) ?? undefined,
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
        id: (data as any).id as string,
        opsflowUnitId: (data as any).opsflow_unit_id as string,
        opalosisUnidadId: (data as any).opalosis_unidad_id as number,
        opalosisUnidadNombre: ((data as any).opalosis_unidad_nombre as string) ?? undefined,
        empresaCodigo: ((data as any).empresa_codigo as number) ?? undefined,
        activo: (data as any).activo as boolean,
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

  async enqueueFromAssignment(input: EnqueueAssignmentInput): Promise<HrOutboundIngresoQueueItem | null> {
    const existing = await supabase
      .from('hr_outbound_ingreso_queue')
      .select('id')
      .eq('resource_id', input.resource.id)
      .maybeSingle();

    if (existing.error) {
      throw new Error(`No se pudo verificar la cola Opalosis: ${existing.error.message}`);
    }
    if (existing.data) {
      return null; // ya estaba encolado
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
      usuarioOf: input.usuarioOf ?? 'opsflow',
    });

    if (mapping?.opalosisUnidadNombre) {
      hrFields.labels = {
        ...hrFields.labels,
        lugarTrabajo: mapping.opalosisUnidadNombre,
      };
    }

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

    if (error) {
      throw new Error(`No se pudo encolar para Envío Opalosis: ${error.message}`);
    }
    return transformQueueFromDB(data as unknown as Record<string, unknown>);
  },

  /**
   * Recupera presentaciones ya registradas en unidad que no llegaron a la cola Opalosis
   * (p. ej. fallos silenciosos previos del encolado).
   */
  async syncMissingFromAssignedPresentations(units: Unit[]): Promise<{
    enqueued: number;
    skipped: number;
    errors: string[];
  }> {
    const { inboundWorkerHandoffService } = await import('./inboundWorkerHandoffService');
    const { resourcesService } = await import('./resourcesService');

    const { data: rows, error } = await supabase
      .from('inbound_worker_handoff_items')
      .select('id, worker_name, created_resource_id, item_status')
      .not('created_resource_id', 'is', null)
      .in('item_status', ['assigned', 'approved'])
      .order('updated_at', { ascending: false })
      .limit(150);

    if (error) {
      throw new Error(`No se pudieron leer presentaciones asignadas: ${error.message}`);
    }

    // También recursos creados hoy (por si el ítem no quedó en status assigned)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: todayResources, error: todayErr } = await supabase
      .from('resources')
      .select('id, name, created_at')
      .gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);
    if (todayErr) {
      console.warn('syncMissing: no se pudieron listar resources de hoy', todayErr.message);
    }

    const candidates: Array<{ itemId?: string; resourceId: string; workerName: string }> = [];
    const seenResources = new Set<string>();

    for (const raw of rows ?? []) {
      const resourceId = raw.created_resource_id as string | null;
      if (!resourceId || seenResources.has(resourceId)) continue;
      // Solo encolar si ya hay recurso creado (registro en unidad)
      if (raw.item_status !== 'assigned' && raw.item_status !== 'approved') continue;
      // approved sin assigned no debería tener created_resource_id, pero por si acaso
      if (raw.item_status === 'approved') continue;
      seenResources.add(resourceId);
      candidates.push({
        itemId: raw.id as string,
        resourceId,
        workerName: String(raw.worker_name ?? resourceId),
      });
    }

    for (const res of todayResources ?? []) {
      const resourceId = res.id as string;
      if (seenResources.has(resourceId)) continue;
      // Buscar handoff ligado
      const { data: linked } = await supabase
        .from('inbound_worker_handoff_items')
        .select('id, worker_name')
        .eq('created_resource_id', resourceId)
        .maybeSingle();
      if (!linked) continue;
      seenResources.add(resourceId);
      candidates.push({
        itemId: linked.id as string,
        resourceId,
        workerName: String(linked.worker_name ?? res.name ?? resourceId),
      });
    }

    let enqueued = 0;
    let skipped = 0;
    const errors: string[] = [];
    const unitById = new Map(units.map((u) => [u.id, u]));

    for (const candidate of candidates) {
      const { resourceId, workerName, itemId } = candidate;
      try {
        const existing = await supabase
          .from('hr_outbound_ingreso_queue')
          .select('id')
          .eq('resource_id', resourceId)
          .maybeSingle();
        if (existing.data) {
          skipped += 1;
          continue;
        }

        const resource = await resourcesService.getById(resourceId);
        if (!resource) {
          errors.push(`${workerName}: recurso no encontrado`);
          continue;
        }

        let handoffItem = itemId
          ? await inboundWorkerHandoffService.getItemById(itemId)
          : null;
        if (!handoffItem) {
          const { data: linked } = await supabase
            .from('inbound_worker_handoff_items')
            .select('id')
            .eq('created_resource_id', resourceId)
            .maybeSingle();
          if (linked?.id) {
            handoffItem = await inboundWorkerHandoffService.getItemById(linked.id as string);
          }
        }
        if (!handoffItem) {
          errors.push(`${workerName}: ítem de presentación no encontrado`);
          continue;
        }

        const unit = resource.unitId ? unitById.get(resource.unitId) : undefined;
        if (!unit) {
          errors.push(`${workerName}: unidad no encontrada en OpsFlow`);
          continue;
        }

        const created = await this.enqueueFromAssignment({
          resource,
          unit,
          handoffItem,
          sourcePackageId: handoffItem.packageId,
          sourceApp: resource.inboundSourceData?.sourceApp,
        });
        if (created) enqueued += 1;
        else skipped += 1;
      } catch (e) {
        errors.push(`${workerName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { enqueued, skipped, errors };
  },

  async updateQueueItemHrFields(
    queueItemId: string,
    hrFields: HrOpalosisIngresoFields,
  ): Promise<HrOutboundIngresoQueueItem> {
    const { data, error } = await supabase
      .from('hr_outbound_ingreso_queue')
      .update({
        hr_fields: hrFields,
        worker_name: `${hrFields.apellidoPaterno} ${hrFields.apellidoMaterno} ${hrFields.nombres}`.trim(),
      })
      .eq('id', queueItemId)
      .eq('queue_status', 'pendiente_envio')
      .select('*')
      .single();

    if (error) throw error;
    return transformQueueFromDB(data as unknown as Record<string, unknown>);
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

      return (data ?? []).map((row) => transformQueueFromDB(row as unknown as Record<string, unknown>));
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
      return (data ?? []).map((row) => transformPackageFromDB(row as unknown as Record<string, unknown>));
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
        ...transformPackageFromDB(pkg as unknown as Record<string, unknown>),
        items: (items ?? []).map((row) => transformPackageItemFromDB(row as unknown as Record<string, unknown>)),
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
  }): Promise<{ package: HrOutboundIngresoPackage; simulated: boolean; partial?: boolean }> {
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
      partial: Boolean(data.partial),
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

  async testRegistroIngreso(testPayload?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.functions.invoke('hr-opalosis-integration', {
      body: {
        action: 'test-registro-ingreso',
        testPayload: testPayload ?? null,
      },
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    return data as Record<string, unknown>;
  },

  async fetchCatalog(options: {
    catalog: OpalosisCatalogName;
    buscar?: string;
    departamentoId?: number;
    provinciaId?: number;
  }): Promise<{ items: OpalosisCatalogItem[]; simulated: boolean }> {
    const { data, error } = await supabase.functions.invoke('hr-opalosis-integration', {
      body: {
        action: 'fetch-catalog',
        catalog: options.catalog,
        buscar: options.buscar ?? null,
        departamentoId: options.departamentoId ?? null,
        provinciaId: options.provinciaId ?? null,
      },
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));

    return {
      items: (data.items ?? []) as OpalosisCatalogItem[],
      simulated: Boolean(data.simulated),
    };
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

      return (data ?? []).map((row: any) => ({
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
