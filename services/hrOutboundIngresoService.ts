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
  'id, name, dni, unit_id, puesto, localidad, phone, birth_date, start_date, end_date, assigned_shift, monthly_salary, personnel_status, external_id, inbound_source_data, type, jornada_type, labor_regime, mobility_bonus, family_allowance, work_days, entry_time, exit_time';

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
    jornadaType: (data.jornada_type as string) || undefined,
    laborRegime: (data.labor_regime as string) || undefined,
    mobilityBonus:
      data.mobility_bonus !== null && data.mobility_bonus !== undefined
        ? Number(data.mobility_bonus)
        : undefined,
    familyAllowance:
      data.family_allowance === true
        ? true
        : data.family_allowance === false
          ? false
          : undefined,
    workDays: Array.isArray(data.work_days)
      ? (data.work_days as string[]).filter(Boolean)
      : undefined,
    entryTime: (data.entry_time as string) || undefined,
    exitTime: (data.exit_time as string) || undefined,
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
    opsflowIntake: (data.opsflow_intake as InboundHandoffItem['opsflowIntake']) ?? null,
    createdAt: '',
  };
}

async function loadQueuedResourceIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    // Solo bloquean re-encolado los activos; «excluido» se puede reabrir
    const { data, error } = await supabase
      .from('hr_outbound_ingreso_queue')
      .select('resource_id')
      .in('queue_status', ['pendiente_envio', 'incluido_paquete'])
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
        'id, package_id, worker_name, worker_snapshot, source_candidate_id, source_process_id, created_resource_id, opsflow_intake',
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
      .select('id, queue_status, ref_operaciones')
      .eq('resource_id', input.resource.id)
      .maybeSingle();

    if (existing.error) {
      throw new Error(`No se pudo verificar la cola Opalosis: ${existing.error.message}`);
    }

    const existingRow = existing.data as
      | { id: string; queue_status: string; ref_operaciones: string }
      | null;

    // Ya activo en cola o ya enviado en paquete → no duplicar
    if (
      existingRow &&
      (existingRow.queue_status === 'pendiente_envio' ||
        existingRow.queue_status === 'incluido_paquete')
    ) {
      return null;
    }

    const mapping = await this.getUnitMapping(input.unit.id);
    const refOperaciones =
      existingRow?.queue_status === 'excluido' && existingRow.ref_operaciones
        ? existingRow.ref_operaciones
        : generateUniqueRefOperaciones();
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

    const payload = {
      resource_id: input.resource.id,
      inbound_handoff_item_id: input.handoffItem?.id ?? null,
      opsflow_unit_id: input.unit.id,
      worker_name: input.resource.name,
      assigned_at: new Date().toISOString(),
      report_date: todayReportDate(),
      worker_snapshot: workerSnapshot,
      hr_fields: hrFields,
      ref_operaciones: refOperaciones,
      queue_status: 'pendiente_envio' as const,
      exclusion_note: null,
      package_id: null,
    };

    // Reabrir fila excluida (UNIQUE resource_id impide INSERT)
    if (existingRow?.queue_status === 'excluido') {
      const { data, error } = await supabase
        .from('hr_outbound_ingreso_queue')
        .update(payload)
        .eq('id', existingRow.id)
        .eq('queue_status', 'excluido')
        .select('*')
        .single();

      if (error) {
        throw new Error(`No se pudo reabrir en cola Opalosis: ${error.message}`);
      }
      return transformQueueFromDB(data as unknown as Record<string, unknown>);
    }

    const { data, error } = await supabase
      .from('hr_outbound_ingreso_queue')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
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
   * Encola solo Presentaciones ATS registradas en unidad (últimos 7 días).
   * No incluye la nómina completa ni altas antiguas.
   */
  async syncMissingFromAssignedPresentations(units: Unit[]): Promise<{
    enqueued: number;
    skipped: number;
    errors: string[];
  }> {
    const candidates: Array<{ resourceId: string; workerName: string }> = [];
    const seenResources = new Set<string>();

    const presentationsSince = new Date();
    presentationsSince.setDate(presentationsSince.getDate() - 7);

    const { data: presentationRows, error: presentationError } = await supabase
      .from('inbound_worker_handoff_items')
      .select('id, worker_name, created_resource_id')
      .not('created_resource_id', 'is', null)
      .gte('updated_at', presentationsSince.toISOString())
      .order('updated_at', { ascending: false })
      .limit(200);

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

    return this.enqueueCandidateResources(candidates, units);
  },

  /**
   * Encola trabajadores exactos por DNI (p. ej. lote a enviar a Opalosis).
   * Acepta DNIs con o sin ceros a la izquierda.
   */
  async enqueueByDnis(
    dnis: string[],
    units: Unit[],
  ): Promise<{ enqueued: number; skipped: number; errors: string[]; notFound: string[] }> {
    const normalized = [
      ...new Set(
        dnis
          .map((d) => String(d).trim())
          .filter(Boolean)
          .map((d) => d.replace(/\s+/g, '')),
      ),
    ];
    if (normalized.length === 0) {
      return { enqueued: 0, skipped: 0, errors: [], notFound: [] };
    }

    const variants = new Set<string>();
    for (const dni of normalized) {
      variants.add(dni);
      const stripped = dni.replace(/^0+/, '') || '0';
      variants.add(stripped);
      if (/^\d+$/.test(dni) && dni.length < 8) {
        variants.add(dni.padStart(8, '0'));
      }
      if (/^\d+$/.test(stripped) && stripped.length < 8) {
        variants.add(stripped.padStart(8, '0'));
      }
    }

    const { data: rows, error } = await supabase
      .from('resources')
      .select(SYNC_RESOURCE_SELECT)
      .eq('type', 'Personal')
      .in('dni', [...variants]);

    if (error) {
      throw new Error(`No se pudieron buscar DNIs: ${error.message}`);
    }

    const byDni = new Map<string, Resource>();
    for (const row of ((rows ?? []) as unknown as Array<Record<string, unknown>>)) {
      const resource = lightResourceFromRow(row);
      const key = String(resource.dni ?? '').trim();
      if (key) byDni.set(key, resource);
    }

    const matchResource = (dni: string): Resource | undefined => {
      if (byDni.has(dni)) return byDni.get(dni);
      const stripped = dni.replace(/^0+/, '') || '0';
      for (const [key, resource] of byDni) {
        if (key === dni || key === stripped) return resource;
        if ((key.replace(/^0+/, '') || '0') === stripped) return resource;
      }
      return undefined;
    };

    const candidates: Array<{ resourceId: string; workerName: string }> = [];
    const notFound: string[] = [];
    const seen = new Set<string>();

    for (const dni of normalized) {
      const resource = matchResource(dni);
      if (!resource) {
        notFound.push(dni);
        continue;
      }
      if (seen.has(resource.id)) continue;
      seen.add(resource.id);
      candidates.push({
        resourceId: resource.id,
        workerName: resource.name || dni,
      });
    }

    const result = await this.enqueueCandidateResources(candidates, units);
    return { ...result, notFound };
  },

  async enqueueCandidateResources(
    candidates: Array<{ resourceId: string; workerName: string }>,
    units: Unit[],
  ): Promise<{ enqueued: number; skipped: number; errors: string[] }> {
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

  /** Vacía la cola pendiente (DELETE) para liberar UNIQUE(resource_id). */
  async excludeAllPending(note?: string): Promise<number> {
    // Conservamos el nombre del método (UI); borramos pendientes en vez de
    // marcar excluido, para que un sync posterior pueda reencolar correctamente.
    void note;
    const { data, error } = await supabase
      .from('hr_outbound_ingreso_queue')
      .delete()
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
