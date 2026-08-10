import { supabase, handleSupabaseError } from './supabase';
import type {
  ComplementaryStatus,
  InboundHandoffDecisionOutbox,
  InboundHandoffItem,
  InboundHandoffItemStatus,
  InboundHandoffPackage,
  InboundHandoffPackageStatus,
  InboundHandoffPackageWithItems,
  PresentationOpsflowIntake,
  WorkerSnapshot,
  WorkerSnapshotComplementary,
} from '../types';
import {
  deriveComplementaryStatusFromData,
  hydrateComplementaryFromSnapshot,
} from '../utils/complementaryHydrate';

// ============================================
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

function asRecord(data: unknown): Record<string, unknown> {
  return (data ?? {}) as Record<string, unknown>;
}

function transformPackageFromDB(data: Record<string, unknown>): InboundHandoffPackage {
  return {
    id: data.id as string,
    sourceApp: (data.source_app as string) ?? 'Opalo ATS',
    sourcePackageId: data.source_package_id as string,
    status: data.status as InboundHandoffPackageStatus,
    purpose: (data.purpose as InboundHandoffPackage['purpose']) ?? null,
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
  const missing = data.complementary_missing_fields;
  const snapshot = data.worker_snapshot as WorkerSnapshot;
  const storedComplementary = (data.complementary as WorkerSnapshotComplementary) ?? null;
  const complementary = hydrateComplementaryFromSnapshot(snapshot, storedComplementary);
  const complementaryStatus = deriveComplementaryStatusFromData(
    complementary,
    (data.complementary_status as ComplementaryStatus) ?? null,
    Array.isArray(missing) ? (missing as string[]) : undefined,
  );

  return {
    id: data.id as string,
    packageId: data.package_id as string,
    sourceCandidateId: (data.source_candidate_id as string) ?? undefined,
    sourceProcessId: (data.source_process_id as string) ?? undefined,
    workerName: data.worker_name as string,
    workerSnapshot: snapshot,
    itemStatus: data.item_status as InboundHandoffItemStatus,
    purpose: (data.purpose as InboundHandoffItem['purpose']) ?? null,
    snapshotVersion: (data.snapshot_version as number) ?? undefined,
    complementary,
    complementaryStatus,
    complementaryFilledAt: (data.complementary_filled_at as string) ?? undefined,
    complementaryMissingFields: Array.isArray(missing)
      ? (missing as string[])
      : undefined,
    opsflowIntake: (data.opsflow_intake as PresentationOpsflowIntake) ?? null,
    decisionReason: (data.decision_reason as string) ?? undefined,
    decidedAt: (data.decided_at as string) ?? undefined,
    decidedByName: (data.decided_by_name as string) ?? undefined,
    assignedWorkUnitId: (data.assigned_work_unit_id as string) ?? undefined,
    assignedAt: (data.assigned_at as string) ?? undefined,
    createdResourceId: (data.created_resource_id as string) ?? undefined,
    createdAt: data.created_at as string,
    updatedAt: (data.updated_at as string) ?? undefined,
  };
}

function transformOutboxFromDB(data: Record<string, unknown>): InboundHandoffDecisionOutbox {
  return {
    id: data.id as string,
    handoffItemId: data.handoff_item_id as string,
    sourcePackageId: data.source_package_id as string,
    opsflowPackageId: data.opsflow_package_id as string,
    sourceCandidateId: (data.source_candidate_id as string) ?? undefined,
    sourceProcessId: (data.source_process_id as string) ?? undefined,
    status: data.status as 'approved' | 'rejected',
    decidedAt: data.decided_at as string,
    decidedByName: (data.decided_by_name as string) ?? undefined,
    reason: (data.reason as string) ?? undefined,
    deliveryStatus: data.delivery_status as InboundHandoffDecisionOutbox['deliveryStatus'],
    attempts: (data.attempts as number) ?? 0,
    lastError: (data.last_error as string) ?? undefined,
    payload: (data.payload as Record<string, unknown>) ?? {},
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

function deriveComplementaryStatus(
  complementary: WorkerSnapshotComplementary | null | undefined,
  missingFields: string[],
): ComplementaryStatus {
  if (!complementary || Object.keys(complementary).length === 0) return 'missing';
  if (missingFields.length > 0) return 'incomplete';
  return 'complete';
}

// ============================================
// SERVICIO DE RECEPCIÓN ATS
// ============================================

export const inboundWorkerHandoffService = {
  /**
   * Cuenta trabajo ATS de contratación pendiente (excluye presentaciones):
   * pending o accepted (sin registrar).
   */
  async countIncomplete(): Promise<{ openPackages: number; incompleteCandidates: number }> {
    try {
      const { data, error } = await supabase
        .from('inbound_worker_handoff_items')
        .select('id, package_id, purpose')
        .in('item_status', ['pending', 'accepted']);

      if (error) throw error;

      const rows = ((data ?? []) as unknown as Array<{ id: string; package_id: string; purpose?: string | null }>).filter(
        (row) => row.purpose !== 'presentation',
      );
      const packageIds = new Set(rows.map((row) => row.package_id));

      return {
        openPackages: packageIds.size,
        incompleteCandidates: rows.length,
      };
    } catch (error) {
      handleSupabaseError(error);
      return { openPackages: 0, incompleteCandidates: 0 };
    }
  },

  /** Presentaciones pendientes de decisión (pending_interview | in_review). */
  async countPresentationPending(): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('inbound_worker_handoff_items')
        .select('id', { count: 'exact', head: true })
        .eq('purpose', 'presentation')
        .in('item_status', ['pending_interview', 'in_review']);

      if (error) throw error;
      return count ?? 0;
    } catch (error) {
      handleSupabaseError(error);
      return 0;
    }
  },

  /**
   * Lista paquetes de contratación/legacy (excluye purpose=presentation).
   * includeUnresolvedCounts: false evita la 2.ª consulta (útil en modo archivo/consulta).
   */
  async listPackages(options?: {
    status?: InboundHandoffPackageStatus;
    includeUnresolvedCounts?: boolean;
  }): Promise<InboundHandoffPackage[]> {
    try {
      let query = supabase
        .from('inbound_worker_handoff_packages')
        .select('*')
        .or('purpose.is.null,purpose.neq.presentation')
        .order('received_at', { ascending: false });

      if (options?.status) {
        if (options.status === 'completed') {
          query = query.in('status', ['completed', 'partially_completed', 'rejected']);
        } else {
          query = query.eq('status', options.status);
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const packages = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) =>
        transformPackageFromDB(row),
      );

      if (packages.length === 0) return packages;

      if (options?.includeUnresolvedCounts === false) {
        return packages;
      }

      const packageIds = packages.map((pkg) => pkg.id);
      const { data: unresolvedRows, error: unresolvedError } = await supabase
        .from('inbound_worker_handoff_items')
        .select('package_id')
        .in('package_id', packageIds)
        .in('item_status', ['pending', 'accepted']);

      if (unresolvedError) throw unresolvedError;

      const counts = new Map<string, number>();
      for (const row of (unresolvedRows ?? []) as unknown as Array<{ package_id: string }>) {
        const packageId = row.package_id;
        counts.set(packageId, (counts.get(packageId) ?? 0) + 1);
      }

      return packages.map((pkg) => ({
        ...pkg,
        unresolvedCandidateCount: counts.get(pkg.id) ?? 0,
      }));
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
        ...transformPackageFromDB(asRecord(pkg)),
        items: (items ?? []).map((row) => transformItemFromDB(asRecord(row))),
      };
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  async getItemById(itemId: string): Promise<InboundHandoffItem | null> {
    try {
      const { data, error } = await supabase
        .from('inbound_worker_handoff_items')
        .select('*, inbound_worker_handoff_packages!inner(source_package_id, source_app, received_at)')
        .eq('id', itemId)
        .single();

      if (error) throw error;
      if (!data) return null;

      const row = asRecord(data);
      const pkg = row.inbound_worker_handoff_packages as Record<string, unknown> | undefined;
      const item = transformItemFromDB(row);
      return {
        ...item,
        sourcePackageId: (pkg?.source_package_id as string) ?? undefined,
        sourceApp: (pkg?.source_app as string) ?? undefined,
        packageReceivedAt: (pkg?.received_at as string) ?? undefined,
      };
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  /**
   * Lista ítems de presentación (purpose=presentation).
   * filter: pending = pending_interview|in_review; approved; rejected; all.
   */
  async listPresentationItems(options?: {
    filter?: 'pending' | 'approved' | 'rejected' | 'archived' | 'all';
  }): Promise<InboundHandoffItem[]> {
    try {
      const filter = options?.filter ?? 'pending';
      let query = supabase
        .from('inbound_worker_handoff_items')
        .select('*, inbound_worker_handoff_packages!inner(source_package_id, source_app, received_at)')
        .eq('purpose', 'presentation')
        .order('created_at', { ascending: false });

      if (filter === 'pending') {
        query = query.in('item_status', ['pending_interview', 'in_review']);
      } else if (filter === 'approved') {
        query = query.in('item_status', ['approved', 'assigned']);
      } else if (filter === 'rejected') {
        query = query.eq('item_status', 'rejected');
      } else if (filter === 'archived') {
        query = query.eq('item_status', 'archived_no_hire');
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((row) => {
        const record = asRecord(row);
        const pkg = record.inbound_worker_handoff_packages as Record<string, unknown> | undefined;
        const item = transformItemFromDB(record);
        return {
          ...item,
          sourcePackageId: (pkg?.source_package_id as string) ?? undefined,
          sourceApp: (pkg?.source_app as string) ?? undefined,
          packageReceivedAt: (pkg?.received_at as string) ?? undefined,
        };
      });
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async markProcessing(packageId: string): Promise<InboundHandoffPackage | null> {
    return this.updatePackageStatus(packageId, 'processing', {
      processing_started_at: new Date().toISOString(),
    });
  },

  /** Reabre un paquete cerrado para seguir trabajando candidatos pendientes. */
  async markReopened(packageId: string): Promise<InboundHandoffPackage | null> {
    return this.updatePackageStatus(packageId, 'processing', {
      processing_started_at: new Date().toISOString(),
      completed_at: null,
    });
  },

  async markCompleted(packageId: string, receiverNote?: string): Promise<InboundHandoffPackage | null> {
    return this.updatePackageStatus(packageId, 'completed', {
      completed_at: new Date().toISOString(),
      receiver_note: receiverNote?.trim() || null,
    });
  },

  /** @deprecated Preferir cerrar solo como completed; se mantiene por datos legacy. */
  async markRejected(packageId: string, receiverNote?: string): Promise<InboundHandoffPackage | null> {
    return this.updatePackageStatus(packageId, 'rejected', {
      completed_at: new Date().toISOString(),
      receiver_note: receiverNote?.trim() || null,
    });
  },

  /** @deprecated Preferir cerrar solo como completed; se mantiene por datos legacy. */
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
      return data ? transformItemFromDB(asRecord(data)) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  /**
   * Guarda avances de ficha complementaria (presentación).
   * Pasa pending_interview → in_review si aún no está decidido.
   */
  async savePresentationComplementary(
    itemId: string,
    complementary: WorkerSnapshotComplementary,
    options?: { missingFields?: string[]; complementaryStatus?: ComplementaryStatus },
  ): Promise<InboundHandoffItem | null> {
    try {
      const current = await this.getItemById(itemId);
      if (!current) return null;
      if (current.purpose !== 'presentation') {
        throw new Error('Solo se puede editar ficha en ítems de presentación');
      }
      if (current.itemStatus === 'approved' || current.itemStatus === 'rejected' || current.itemStatus === 'assigned') {
        throw new Error('La presentación ya fue decidida');
      }

      const missingFields = options?.missingFields ?? current.complementaryMissingFields ?? [];
      const complementaryStatus =
        options?.complementaryStatus ??
        deriveComplementaryStatus(complementary, missingFields);

      const nextSnapshot: WorkerSnapshot = {
        ...current.workerSnapshot,
        complementary,
        meta: {
          ...current.workerSnapshot.meta,
          complementaryStatus,
          complementaryMissingFields: missingFields,
          complementaryFilledAt:
            complementary.submittedAt ??
            current.complementaryFilledAt ??
            new Date().toISOString(),
        },
      };

      const nextStatus: InboundHandoffItemStatus =
        current.itemStatus === 'pending_interview' ? 'in_review' : current.itemStatus;

      const { data, error } = await supabase
        .from('inbound_worker_handoff_items')
        .update({
          complementary,
          complementary_status: complementaryStatus,
          complementary_missing_fields: missingFields,
          complementary_filled_at:
            complementary.submittedAt ??
            current.complementaryFilledAt ??
            new Date().toISOString(),
          worker_snapshot: nextSnapshot,
          item_status: nextStatus,
        })
        .eq('id', itemId)
        .select('*')
        .single();

      if (error) throw error;
      return data ? transformItemFromDB(asRecord(data)) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  /**
   * Guarda salario / días / horario / turno definidos por OpsFlow
   * (requeridos antes de registrar en unidad).
   */
  async savePresentationOpsflowIntake(
    itemId: string,
    intake: PresentationOpsflowIntake,
    updatedByName?: string,
  ): Promise<InboundHandoffItem | null> {
    try {
      const current = await this.getItemById(itemId);
      if (!current) return null;
      if (current.purpose !== 'presentation') {
        throw new Error('Solo aplica a presentaciones');
      }
      if (
        current.itemStatus === 'rejected' ||
        current.itemStatus === 'assigned' ||
        current.itemStatus === 'archived_no_hire'
      ) {
        throw new Error('No se puede editar estos datos en el estado actual');
      }

      const mobilityRaw = intake.mobilityBonus;
      const mobilityBonus =
        mobilityRaw === null ||
        mobilityRaw === undefined ||
        Number.isNaN(Number(mobilityRaw))
          ? null
          : Number(mobilityRaw);

      const payload: PresentationOpsflowIntake = {
        monthlySalary:
          intake.monthlySalary === null || intake.monthlySalary === undefined || Number.isNaN(Number(intake.monthlySalary))
            ? null
            : Number(intake.monthlySalary),
        workDays: Array.isArray(intake.workDays) ? intake.workDays.filter(Boolean) : [],
        entryTime: intake.entryTime?.trim() || '',
        exitTime: intake.exitTime?.trim() || '',
        shift: intake.shift?.trim() || '',
        jornadaType: intake.jornadaType?.trim() || '',
        laborRegime: intake.laborRegime?.trim() || '',
        mobilityBonus,
        familyAllowance:
          intake.familyAllowance === true
            ? true
            : intake.familyAllowance === false
              ? false
              : null,
        updatedAt: new Date().toISOString(),
        updatedByName: updatedByName?.trim() || undefined,
      };

      const { data, error } = await supabase
        .from('inbound_worker_handoff_items')
        .update({ opsflow_intake: payload })
        .eq('id', itemId)
        .select('*')
        .single();

      if (error) throw error;
      return data ? transformItemFromDB(asRecord(data)) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  async markPresentationInReview(itemId: string): Promise<InboundHandoffItem | null> {
    try {
      const { data, error } = await supabase
        .from('inbound_worker_handoff_items')
        .update({ item_status: 'in_review' })
        .eq('id', itemId)
        .eq('purpose', 'presentation')
        .eq('item_status', 'pending_interview')
        .select('*')
        .single();

      if (error) {
        // Ya no está pending_interview: no es error fatal
        if (error.code === 'PGRST116') {
          return this.getItemById(itemId);
        }
        throw error;
      }
      return data ? transformItemFromDB(asRecord(data)) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  /**
   * Aprueba presentación: estado approved + outbox ATS.
   * NO encola Opalosis (eso ocurre al registrar en unidad).
   */
  async approvePresentation(
    itemId: string,
    decidedByName?: string,
  ): Promise<InboundHandoffItem | null> {
    return this.decidePresentation(itemId, 'approved', { decidedByName });
  },

  /**
   * Rechaza presentación con motivo + outbox ATS.
   */
  async rejectPresentation(
    itemId: string,
    reason: string,
    decidedByName?: string,
  ): Promise<InboundHandoffItem | null> {
    const trimmed = reason.trim();
    if (!trimmed) {
      throw new Error('El motivo de rechazo es obligatorio');
    }
    return this.decidePresentation(itemId, 'rejected', {
      decidedByName,
      reason: trimmed,
    });
  },

  /**
   * Archiva presentación aprobada que nunca se registró en unidad
   * (sin ingreso, sin contrato). No encola Opalosis ni crea recurso.
   */
  async archivePresentationWithoutHire(
    itemId: string,
    reason: string,
    decidedByName?: string,
  ): Promise<InboundHandoffItem | null> {
    try {
      const trimmed = reason.trim();
      if (!trimmed) {
        throw new Error('Indica el motivo del archivo');
      }

      const current = await this.getItemById(itemId);
      if (!current) return null;
      if (current.purpose !== 'presentation') {
        throw new Error('Solo se puede archivar ítems de presentación');
      }
      if (current.itemStatus !== 'approved') {
        throw new Error('Solo se archivan presentaciones aprobadas sin unidad');
      }
      if (current.createdResourceId || current.itemStatus === 'assigned') {
        throw new Error('El candidato ya fue registrado en una unidad');
      }

      const decidedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('inbound_worker_handoff_items')
        .update({
          item_status: 'archived_no_hire',
          decision_reason: trimmed,
          decided_by_name: decidedByName?.trim() || current.decidedByName || null,
          decided_at: current.decidedAt ?? decidedAt,
        })
        .eq('id', itemId)
        .eq('item_status', 'approved')
        .select('*')
        .single();

      if (error) throw error;
      return data ? transformItemFromDB(asRecord(data)) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  async decidePresentation(
    itemId: string,
    decision: 'approved' | 'rejected',
    options?: { decidedByName?: string; reason?: string },
  ): Promise<InboundHandoffItem | null> {
    try {
      const current = await this.getItemById(itemId);
      if (!current) return null;
      if (current.purpose !== 'presentation') {
        throw new Error('Solo se puede decidir ítems de presentación');
      }
      if (
        current.itemStatus === 'approved' ||
        current.itemStatus === 'rejected' ||
        current.itemStatus === 'assigned'
      ) {
        throw new Error('La presentación ya fue decidida');
      }

      const decidedAt = new Date().toISOString();
      const decidedByName = options?.decidedByName?.trim() || null;
      const reason = options?.reason?.trim() || null;
      const nextStatus: InboundHandoffItemStatus =
        decision === 'approved' ? 'approved' : 'rejected';

      const { data, error } = await supabase
        .from('inbound_worker_handoff_items')
        .update({
          item_status: nextStatus,
          decided_at: decidedAt,
          decided_by_name: decidedByName,
          decision_reason: reason,
        })
        .eq('id', itemId)
        .select('*')
        .single();

      if (error) throw error;

      const sourcePackageId = current.sourcePackageId;
      if (sourcePackageId) {
        const payload = {
          sourcePackageId,
          opsflowPackageId: current.packageId,
          sourceCandidateId: current.sourceCandidateId ?? null,
          sourceProcessId: current.sourceProcessId ?? null,
          status: decision,
          decidedAt,
          decidedByName,
          reason,
        };

        const { error: outboxError } = await supabase
          .from('inbound_handoff_decision_outbox')
          .insert({
            handoff_item_id: itemId,
            source_package_id: sourcePackageId,
            opsflow_package_id: current.packageId,
            source_candidate_id: current.sourceCandidateId ?? null,
            source_process_id: current.sourceProcessId ?? null,
            status: decision,
            decided_at: decidedAt,
            decided_by_name: decidedByName,
            reason,
            delivery_status: 'pending',
            payload,
          });

        if (outboxError) {
          // Decisión ya guardada; outbox stub no debe revertir la acción operativa
          console.error('Failed to enqueue ATS decision outbox:', outboxError);
        }
      }

      return data ? transformItemFromDB(asRecord(data)) : null;
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
      return data ? transformItemFromDB(asRecord(data)) : null;
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
      return data ? transformItemFromDB(asRecord(data)) : null;
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
      return data ? transformPackageFromDB(asRecord(data)) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  async listDecisionOutbox(options?: {
    deliveryStatus?: InboundHandoffDecisionOutbox['deliveryStatus'];
  }): Promise<InboundHandoffDecisionOutbox[]> {
    try {
      let query = supabase
        .from('inbound_handoff_decision_outbox')
        .select('*')
        .order('created_at', { ascending: false });

      if (options?.deliveryStatus) {
        query = query.eq('delivery_status', options.deliveryStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => transformOutboxFromDB(asRecord(row)));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },
};
