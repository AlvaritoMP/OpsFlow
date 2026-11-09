import { supabase } from './supabase';
import type { HrOutboundCese, HrOutboundCeseResult, HrOutboundCeseSyncStatus } from '../types';
import {
  buildRegistroCesePayload,
  documentForOpalosis,
  type RegistroCesePayload,
} from '../utils/opalosisCese';

export interface RegisterCeseInput {
  resourceId: string;
  opsflowUnitId?: string | null;
  workerName: string;
  documento?: string | null;
  fechaCese: string;
  terminationReason: string;
  personnelStatus: 'cesado' | 'archivado';
  usuarioOf?: string | null;
}

function errorMessageFromFunctionPayload(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as { error?: unknown };
  if (body.error == null) return null;
  return typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
}

async function readFunctionsInvokeError(
  error: { message?: string; context?: unknown } | null,
  data: unknown,
  fallback: string,
): Promise<string> {
  const fromBody = errorMessageFromFunctionPayload(data);
  if (fromBody) return fromBody;

  const context = error?.context as Response | undefined;
  if (context && typeof context.json === 'function') {
    try {
      const payload = await context.clone().json();
      const fromCtx = errorMessageFromFunctionPayload(payload);
      if (fromCtx) return fromCtx;
    } catch {
      try {
        const text = await context.clone().text();
        if (text.trim()) return text.trim().slice(0, 600);
      } catch {
        /* ignore */
      }
    }
  }
  return error?.message || fallback;
}

function asRecord(row: unknown): Record<string, unknown> {
  return (row ?? {}) as Record<string, unknown>;
}

export function transformCeseFromDB(row: Record<string, unknown>): HrOutboundCese {
  const fecha = typeof row.fecha_cese === 'string' ? row.fecha_cese.split('T')[0] : '';
  return {
    id: String(row.id),
    resourceId: String(row.resource_id),
    opsflowUnitId: (row.opsflow_unit_id as string) || undefined,
    workerName: String(row.worker_name ?? ''),
    documento: String(row.documento ?? ''),
    fechaCese: fecha,
    motivoCeseId: row.motivo_cese_id == null ? null : Number(row.motivo_cese_id),
    observaciones: (row.observaciones as string) || null,
    usuarioOf: (row.usuario_of as string) || null,
    personnelStatus: (row.personnel_status as string) || null,
    terminationReason: (row.termination_reason as string) || null,
    syncStatus: row.sync_status as HrOutboundCeseSyncStatus,
    ceseId: row.cese_id == null ? null : Number(row.cese_id),
    ceseCod: (row.cese_cod as string) || null,
    opalosisEstado: (row.opalosis_estado as string) || null,
    opalosisEtapa: (row.opalosis_etapa as string) || null,
    mensaje: (row.mensaje as string) || null,
    attemptCount: Number(row.attempt_count ?? 0),
    lastAttemptAt: (row.last_attempt_at as string) || null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export function describeCeseSync(
  cese: HrOutboundCese | null,
  simulated = false,
): Pick<HrOutboundCeseResult, 'userMessage' | 'notificationType'> {
  const sim = simulated ? ' (simulado)' : '';
  if (!cese) {
    return {
      notificationType: 'info',
      userMessage: 'No se pudo registrar el envío a Opalosis.',
    };
  }

  const code = cese.ceseCod ? ` (${cese.ceseCod})` : '';
  switch (cese.syncStatus) {
    case 'enviado':
      return {
        notificationType: 'success',
        userMessage: `Solicitud${code} enviada a la bandeja de Opalosis${sim}. RRHH aún debe procesarla.`,
      };
    case 'procesado':
      return {
        notificationType: 'success',
        userMessage: `Opalosis marcó el cese como procesado${code}${sim}.`,
      };
    case 'rechazo_negocio':
      return {
        notificationType: 'info',
        userMessage: `Opalosis no aceptó el cese: ${cese.mensaje || 'rechazo de negocio'}.`,
      };
    case 'rechazado_rrhh':
      return {
        notificationType: 'info',
        userMessage: `RRHH rechazó la solicitud${code} en Opalosis.`,
      };
    case 'error_tecnico':
    case 'pendiente':
      return {
        notificationType: 'info',
        userMessage:
          'Opalosis no respondió. El cese quedó en OpsFlow y el envío se puede reintentar desde la ficha.',
      };
    default:
      return {
        notificationType: 'info',
        userMessage: cese.mensaje || 'Estado de envío a Opalosis desconocido.',
      };
  }
}

function missingTableMessage(error: { message?: string; code?: string } | null): string | null {
  const msg = error?.message || '';
  const missingRelation =
    error?.code === '42P01' ||
    (/hr_outbound_cese/i.test(msg) && /does not exist|schema cache|Could not find/i.test(msg));
  if (missingRelation) {
    return 'Falta crear la tabla de ceses. Ejecute database/migrations/MIGRATION_HR_OPALOSIS_CESE.sql en Supabase.';
  }
  if (/403|permission|row-level security|RLS|Forbidden/i.test(msg)) {
    return 'Sin permiso para registrar el cese en Opalosis. Ejecute database/migrations/MIGRATION_HR_OPALOSIS_CESE.sql en Supabase.';
  }
  return null;
}

async function getById(id: string): Promise<HrOutboundCese | null> {
  const { data, error } = await supabase.from('hr_outbound_cese').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return transformCeseFromDB(asRecord(data));
}

export const hrOutboundCeseService = {
  async latestForResource(resourceId: string): Promise<HrOutboundCese | null> {
    const { data, error } = await supabase
      .from('hr_outbound_cese')
      .select('*')
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      const friendly = missingTableMessage(error);
      if (friendly) return null;
      throw error;
    }
    if (!data) return null;
    return transformCeseFromDB(asRecord(data));
  },

  async registerAndSend(input: RegisterCeseInput): Promise<HrOutboundCeseResult> {
    const fechaCese = (input.fechaCese || '').slice(0, 10);
    const documento = documentForOpalosis(input.documento);
    const payload = buildRegistroCesePayload({
      documento,
      fechaCese,
      terminationReason: input.terminationReason,
      personnelStatus: input.personnelStatus,
      usuarioOf: input.usuarioOf,
      resourceId: input.resourceId,
      unitId: input.opsflowUnitId,
    });

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaCese)) {
      return {
        cese: null,
        notificationType: 'info',
        userMessage: 'La fecha de cese no tiene el formato que Opalosis espera. El cese quedó solo en OpsFlow.',
      };
    }

    const { data: existing, error: existingError } = await supabase
      .from('hr_outbound_cese')
      .select('*')
      .eq('resource_id', input.resourceId)
      .eq('fecha_cese', fechaCese)
      .in('sync_status', ['pendiente', 'error_tecnico', 'enviado', 'procesado'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      const friendly = missingTableMessage(existingError);
      return {
        cese: null,
        notificationType: 'info',
        userMessage: friendly || `No se pudo preparar el envío a Opalosis: ${existingError.message}`,
      };
    }

    if (existing) {
      const current = transformCeseFromDB(asRecord(existing));
      if (current.syncStatus === 'enviado' || current.syncStatus === 'procesado') {
        const described = describeCeseSync(current);
        return { cese: current, ...described };
      }
      await supabase
        .from('hr_outbound_cese')
        .update({
          documento,
          worker_name: input.workerName,
          opsflow_unit_id: input.opsflowUnitId || null,
          motivo_cese_id: payload.MotivoCeseId,
          observaciones: payload.Observaciones,
          usuario_of: payload.UsuarioOf,
          personnel_status: input.personnelStatus,
          termination_reason: input.terminationReason,
          request_payload: payload,
          sync_status: 'pendiente',
          mensaje: null,
        })
        .eq('id', current.id);
      return this.dispatch(current.id);
    }

    const { data: inserted, error: insertError } = await supabase
      .from('hr_outbound_cese')
      .insert({
        resource_id: input.resourceId,
        opsflow_unit_id: input.opsflowUnitId || null,
        worker_name: input.workerName,
        documento,
        fecha_cese: fechaCese,
        motivo_cese_id: payload.MotivoCeseId,
        observaciones: payload.Observaciones,
        usuario_of: payload.UsuarioOf,
        personnel_status: input.personnelStatus,
        termination_reason: input.terminationReason,
        request_payload: payload as unknown as Record<string, unknown>,
        sync_status: documento ? 'pendiente' : 'rechazo_negocio',
        mensaje: documento
          ? null
          : 'El trabajador no tiene documento en OpsFlow. Complételo y reintente el envío a Opalosis.',
      })
      .select('*')
      .single();

    if (insertError || !inserted) {
      const friendly = missingTableMessage(insertError);
      return {
        cese: null,
        notificationType: 'info',
        userMessage: friendly || `No se pudo registrar el envío a Opalosis: ${insertError?.message || 'error'}`,
      };
    }

    const created = transformCeseFromDB(asRecord(inserted));
    if (!documento) {
      const described = describeCeseSync(created);
      return { cese: created, ...described };
    }
    return this.dispatch(created.id);
  },

  async retry(ceseId: string): Promise<HrOutboundCeseResult> {
    const current = await getById(ceseId);
    if (!current) {
      return {
        cese: null,
        notificationType: 'error',
        userMessage: 'No se encontró la solicitud de cese.',
      };
    }
    if (current.syncStatus === 'enviado' || current.syncStatus === 'procesado') {
      const described = describeCeseSync(current);
      return { cese: current, ...described };
    }

    const { data: resource } = await supabase
      .from('resources')
      .select('dni, name, end_date, termination_reason, personnel_status, unit_id')
      .eq('id', current.resourceId)
      .maybeSingle();

    const resourceRow = asRecord(resource);
    const documento = documentForOpalosis((resourceRow.dni as string) || current.documento);
    const fechaCese = (
      typeof resourceRow.end_date === 'string' ? resourceRow.end_date : current.fechaCese
    ).slice(0, 10);
    const terminationReason = String(resourceRow.termination_reason || current.terminationReason || '');
    const personnelStatus =
      resourceRow.personnel_status === 'archivado' || current.personnelStatus === 'archivado'
        ? 'archivado'
        : 'cesado';
    const payload: RegistroCesePayload = buildRegistroCesePayload({
      documento,
      fechaCese,
      terminationReason,
      personnelStatus,
      usuarioOf: current.usuarioOf,
      resourceId: current.resourceId,
      unitId: (resourceRow.unit_id as string) || current.opsflowUnitId,
    });

    const { error: updateError } = await supabase
      .from('hr_outbound_cese')
      .update({
        documento,
        worker_name: String(resourceRow.name || current.workerName),
        fecha_cese: fechaCese,
        motivo_cese_id: payload.MotivoCeseId,
        observaciones: payload.Observaciones,
        personnel_status: personnelStatus,
        termination_reason: terminationReason,
        request_payload: payload,
        sync_status: documento ? 'pendiente' : 'rechazo_negocio',
        mensaje: documento
          ? null
          : 'El trabajador no tiene documento en OpsFlow. Complételo y reintente el envío a Opalosis.',
      })
      .eq('id', current.id);

    if (updateError) {
      return {
        cese: current,
        notificationType: 'error',
        userMessage: `No se pudo reintentar el envío: ${updateError.message}`,
      };
    }

    if (!documento) {
      const refreshed = await getById(current.id);
      const described = describeCeseSync(refreshed);
      return { cese: refreshed, ...described };
    }
    return this.dispatch(current.id);
  },

  async refreshStatus(ceseId: string): Promise<HrOutboundCeseResult> {
    const { data, error } = await supabase.functions.invoke('hr-opalosis-integration', {
      body: { action: 'check-cese-status', ceseRowId: ceseId },
    });

    if (error || data?.error) {
      const message = await readFunctionsInvokeError(error, data, 'No se pudo consultar la bandeja de ceses');
      const current = await getById(ceseId);
      return {
        cese: current,
        notificationType: 'error',
        userMessage: message,
      };
    }

    const cese = data?.cese ? transformCeseFromDB(asRecord(data.cese)) : await getById(ceseId);
    if (data?.found === false) {
      return {
        cese,
        notificationType: 'info',
        userMessage: 'Opalosis no devolvió esta solicitud en la bandeja de ceses.',
        simulated: Boolean(data?.simulated),
      };
    }
    const described = describeCeseSync(cese, Boolean(data?.simulated));
    return { cese, ...described, simulated: Boolean(data?.simulated) };
  },

  async dispatch(ceseId: string): Promise<HrOutboundCeseResult> {
    const { data, error } = await supabase.functions.invoke('hr-opalosis-integration', {
      body: { action: 'send-cese', ceseRowId: ceseId },
    });

    if (error || data?.error) {
      const message = await readFunctionsInvokeError(error, data, 'No se pudo enviar el cese a Opalosis');
      await supabase
        .from('hr_outbound_cese')
        .update({
          sync_status: 'error_tecnico',
          mensaje: message.slice(0, 500),
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', ceseId);
      const cese = await getById(ceseId);
      return {
        cese,
        notificationType: 'info',
        userMessage:
          'Opalosis no respondió. El cese quedó en OpsFlow y el envío se puede reintentar desde la ficha.',
      };
    }

    const cese = data?.cese ? transformCeseFromDB(asRecord(data.cese)) : await getById(ceseId);
    const described = describeCeseSync(cese, Boolean(data?.simulated));
    return { cese, ...described, simulated: Boolean(data?.simulated) };
  },
};
