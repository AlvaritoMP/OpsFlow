import { supabase, handleSupabaseError } from './supabase';
import { generateUniqueRefOperaciones } from '../utils/hrIntegration';
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
  InboundHandoffItem,
  Resource,
  OpalosisCatalogItem,
  OpalosisCatalogName,
  Unit,
} from '../types';
import { ResourceType } from '../types';

const SYNC_RESOURCE_SELECT =
  'id, name, dni, unit_id, puesto, localidad, phone, birth_date, start_date, end_date, assigned_shift, monthly_salary, personnel_status, external_id, inbound_source_data, type';

function lightResourceFromRow(data: Record<string, unknown>): Resource {
  const birth = typeof data.birth_date === 'string' ? data.birth_date.split('T')[0] : undefined;
  const start = typeof data.start_date === 'string' ? data.start_date.split('T')[0] : undefined;
  const end = typeof data.end_date === 'string' ? data.end_date.split('T')[0] : undefined;
  return {
    id: data.id as string,
    name: String(data.name ?? ''),
    type: ResourceType.PERSONNEL,
    quantity: 1,
    unitId: (data.unit_id as string) || undefined,
    dni: (data.dni as string) || undefined,
    puesto: (data.puesto as string) || undefined,
    localidad: (data.localidad as string) || undefined,
    phone: (data.phone as string) || undefined,
    birthDate: birth,
    startDate: start,
    endDate: end,
    assignedShift: (data.assigned_shift as string) || undefined,
    monthlySalary:
      data.monthly_salary !== null && data.monthly_salary !== undefined
        ? Number(data.monthly_salary)
        : undefined,
    personnelStatus: (data.personnel_status as Resource['personnelStatus']) || undefined,
    externalId: (data.external_id as string) || undefined,
    inboundSourceData: (data.inbound_source_data as Resource['inboundSourceData']) ?? undefined,
    trainings: [],
    assignedAssets: [],
  };
}

function lightHandoffFromRow(data: Record<string, unknown>): InboundHandoffItem {
  return {
    id: data.id as string,
    packageId: (data.package_id as string) || '',
    workerName: String(data.worker_name ?? ''),
    workerSnapshot: (data.worker_snapshot as InboundHandoffItem['workerSnapshot']) || {},
    itemStatus: 'assigned',
    sourceCandidateId: (data.source_candidate_id as string) || undefined,
    sourceProcessId: (data.source_process_id as string) || undefined,
    createdResourceId: (data.created_resource_id as string) || undefined,
    createdAt: '',
  };
}

async function loadQueuedResourceIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('hr_outbound_ingreso_queue')
      .select('resource_id')
      .range(from, from + pageSize - 1);
    if (error) {
      const msg = error.message || String(error);
      if (/403|permission|row-level security|RLS|Forbidden/i.test(msg)) {
        throw new Error(
          `Sin permiso RLS en hr_outbound_ingreso_queue. Ejecute database/migrations/MIGRATION_HR_OPALOSIS_RLS.sql en Supabase. Detalle: ${msg}`,
        );
      }
      throw new Error(`No se pudo leer la cola Opalosis: ${msg}`);
    }
    if (!data?.length) break;
    for (const row of ((data ?? []) as unknown as Array<{ resource_id?: string }>)) {
      if (row.resource_id) ids.add(row.resource_id);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

async function loadResourcesByIds(resourceIds: string[]): Promise<Map<string, Resource>> {
  const map = new Map<string, Resource>();
  const chunkSize = 100;
  for (let i = 0; i < resourceIds.length; i += chunkSize) {
    const chunk = resourceIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('resources')
      .select(SYNC_RESOURCE_SELECT)
      .in('id', chunk);
    if (error) {
      throw new Error(`No se pudieron cargar recursos para sincronizar: ${error.message}`);
    }
    for (const row of ((data ?? []) as unknown as Array<Record<string, unknown>>)) {
      map.set(row.id as string, lightResourceFromRow(row));
    }
  }
  return map;
}

async function loadHandoffsByResourceIds(
  resourceIds: string[],
): Promise<Map<string, InboundHandoffItem>> {
  const map = new Map<string, InboundHandoffItem>();
  const chunkSize = 100;
  for (let i = 0; i < resourceIds.length; i += chunkSize) {
    const chunk = resourceIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('inbound_worker_handoff_items')
      .select(
        'id, package_id, worker_name, worker_snapshot, source_candidate_id, source_process_id, created_resource_id',
      )
      .in('created_resource_id', chunk);
    if (error) {
      // Presentaciones opcionales: no abortar sync de altas directas
      console.warn('No se pudieron cargar handoffs ATS para sync Opalosis:', error.message);
      continue;
    }
    for (const row of ((data ?? []) as unknown as Array<Record<string, unknown>>)) {
      const resourceId = row.created_resource_id as string | null;
      if (!resourceId || map.has(resourceId)) continue;
      map.set(resourceId, lightHandoffFromRow(row));
    }
  }
  return map;
}

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
    const refOperaciones = generateUniqueRefOperaciones();
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
        inbound_handoff_item_id: input.handoffItem?.id ?? null,
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
      // Ya encolado (unique resource_id) o carrera de ref → omitir
      const status = (error as { status?: number }).status;
      if (
        error.code === '23505' ||
        status === 409 ||
        /duplicate|conflict|409|unique/i.test(error.message || '')
      ) {
        return null;
      }
      throw new Error(`No se pudo encolar para Envío Opalosis: ${error.message}`);
    }
    return transformQueueFromDB(data as unknown as Record<string, unknown>);
  },

  /**
   * Encola pendientes reales de envío a Opalosis (no toda la nómina):
   * 1) Presentaciones ATS registradas en unidad en los últimos 30 días.
   * 2) Altas directas de personal creadas en los últimos 14 días (aún no encoladas).
   */
  async syncMissingFromAssignedPresentations(units: Unit[]): Promise<{
    enqueued: number;
    skipped: number;
    errors: string[];
  }> {
    const candidates: Array<{ resourceId: string; workerName: string }> = [];
    const seenResources = new Set<string>();

    const presentationsSince = new Date();
    presentationsSince.setDate(presentationsSince.getDate() - 30);
    const personalSince = new Date();
    personalSince.setDate(personalSince.getDate() - 14);

    // 1) Presentaciones ATS recientes con recurso creado
    const { data: presentationRows, error: presentationError } = await supabase
      .from('inbound_worker_handoff_items')
      .select('id, worker_name, created_resource_id')
      .not('created_resource_id', 'is', null)
      .gte('updated_at', presentationsSince.toISOString())
      .order('updated_at', { ascending: false })
      .limit(500);

    if (presentationError) {
      throw new Error(
        `No se pudieron leer presentaciones ATS: ${presentationError.message}`,
      );
    }

    for (const raw of ((presentationRows ?? []) as unknown as Array<Record<string, unknown>>)) {
      const resourceId = raw.created_resource_id as string | null;
      if (!resourceId || seenResources.has(resourceId)) continue;
      seenResources.add(resourceId);
      candidates.push({
        resourceId,
        workerName: String(raw.worker_name ?? resourceId),
      });
    }

    // 2) Solo altas recientes en unidad (no la nómina histórica completa)
    const { data: personnelRows, error: personnelError } = await supabase
      .from('resources')
      .select('id, name, unit_id, type, archived, personnel_status, created_at')
      .eq('type', 'Personal')
      .not('unit_id', 'is', null)
      .or('archived.is.null,archived.eq.false')
      .gte('created_at', personalSince.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);

    if (personnelError) {
      throw new Error(
        `No se pudo leer personal de unidades: ${personnelError.message}`,
      );
    }

    for (const row of ((personnelRows ?? []) as unknown as Array<Record<string, unknown>>)) {
      const resourceId = row.id as string;
      if (seenResources.has(resourceId)) continue;
      if (row.personnel_status === 'archivado' || row.personnel_status === 'cesado') continue;
      seenResources.add(resourceId);
      candidates.push({
        resourceId,
        workerName: String(row.name ?? resourceId),
      });
    }

    const queuedIds = await loadQueuedResourceIds();
    const pending = candidates.filter((c) => !queuedIds.has(c.resourceId));
    let skipped = candidates.length - pending.length;
    let enqueued = 0;
    const errors: string[] = [];

    if (pending.length === 0) {
      return { enqueued, skipped, errors };
    }

    const pendingIds = pending.map((p) => p.resourceId);
    const [resourceById, handoffByResourceId] = await Promise.all([
      loadResourcesByIds(pendingIds),
      loadHandoffsByResourceIds(pendingIds),
    ]);

    const unitById = new Map(units.map((u) => [u.id, u]));

    const resolveUnit = async (unitId: string): Promise<Unit | null> => {
      const cached = unitById.get(unitId);
      if (cached) return cached;
      const { data: unitRow, error: unitErr } = await supabase
        .from('units')
        .select('id, name, client_name, status')
        .eq('id', unitId)
        .maybeSingle();
      if (unitErr || !unitRow) return null;
      const ur = unitRow as unknown as Record<string, unknown>;
      const unit = {
        id: ur.id as string,
        name: String(ur.name ?? 'Unidad'),
        clientName: String(ur.client_name ?? ''),
        status: ur.status,
      } as Unit;
      unitById.set(unit.id, unit);
      return unit;
    };

    for (const candidate of pending) {
      const { resourceId, workerName } = candidate;
      try {
        const resource = resourceById.get(resourceId);
        if (!resource) {
          errors.push(`${workerName}: recurso no encontrado`);
          continue;
        }

        const unitId = resource.unitId;
        if (!unitId) {
          errors.push(`${workerName}: el recurso no tiene unidad asignada`);
          continue;
        }

        const unit = await resolveUnit(unitId);
        if (!unit) {
          errors.push(`${workerName}: unidad ${unitId} no encontrada en OpsFlow`);
          continue;
        }

        const handoffItem = handoffByResourceId.get(resourceId) ?? null;
        const created = await this.enqueueFromAssignment({
          resource,
          unit,
          handoffItem,
          sourcePackageId: handoffItem?.packageId,
          sourceApp:
            resource.inboundSourceData?.sourceApp ?? (handoffItem ? 'Opalo ATS' : 'OpsFlow'),
        });
        if (created) enqueued += 1;
        else skipped += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${workerName}: ${msg}`);
        if (/403|permission|row-level security|RLS|Forbidden/i.test(msg)) {
          errors.push(
            'Se detuvo la sincronización: falta política RLS en tablas hr_outbound_*. Ejecute database/migrations/MIGRATION_HR_OPALOSIS_RLS.sql en Supabase.',
          );
          break;
        }
      }
    }

    return { enqueued, skipped, errors };
  },

  /** Excluye todos los pendientes actuales (p. ej. limpieza tras sync masivo erróneo). */
  async excludeAllPending(note?: string): Promise<number> {
    const { data, error } = await supabase
      .from('hr_outbound_ingreso_queue')
      .update({
        queue_status: 'excluido',
        exclusion_note: note?.trim() || 'Limpieza cola masiva',
      })
      .eq('queue_status', 'pendiente_envio')
      .select('id');

    if (error) throw error;
    return (data ?? []).length;
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
