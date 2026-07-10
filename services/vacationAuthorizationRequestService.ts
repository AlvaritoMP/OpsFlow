import { supabase, handleSupabaseError } from './supabase';
import {
  VacationAuthorizationRequest,
  VacationAuthRequestType,
  User,
} from '../types';
import { vacationService } from './vacationService';
import { toVerifiedAuthorizer, canActAsVacationAuthorizer } from './vacationAuthService';
import { vacationAuditService } from './vacationAuditService';

export interface CreateVacationAuthRequestParams {
  requestType: VacationAuthRequestType;
  requesterId: string;
  assignedAuthorizerId: string;
  summary: string;
  payload: Record<string, unknown>;
  justification?: string;
  resourceId?: string;
  unitId?: string;
}

function transformFromDB(row: any): VacationAuthorizationRequest {
  return {
    id: row.id,
    status: row.status,
    requestType: row.request_type,
    requesterId: row.requester_id,
    assignedAuthorizerId: row.assigned_authorizer_id,
    resourceId: row.resource_id ?? undefined,
    unitId: row.unit_id ?? undefined,
    payload: row.payload || {},
    justification: row.justification ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    summary: row.summary,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
  };
}

async function enrichWithUserNames(
  requests: VacationAuthorizationRequest[]
): Promise<VacationAuthorizationRequest[]> {
  if (!requests.length) return requests;
  const userIds = new Set<string>();
  requests.forEach(r => {
    userIds.add(r.requesterId);
    userIds.add(r.assignedAuthorizerId);
    if (r.resolvedBy) userIds.add(r.resolvedBy);
  });
  const { data: users } = await supabase
    .from('users')
    .select('id, name')
    .in('id', [...userIds]);
  const nameMap = new Map((users || []).map(u => [u.id, u.name as string]));
  return requests.map(r => ({
    ...r,
    requesterName: nameMap.get(r.requesterId),
    assignedAuthorizerName: nameMap.get(r.assignedAuthorizerId),
    resolvedByName: r.resolvedBy ? nameMap.get(r.resolvedBy) : undefined,
  }));
}

async function getRequestById(id: string): Promise<VacationAuthorizationRequest | null> {
  const { data, error } = await supabase
    .from('vacation_authorization_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    handleSupabaseError(error);
    return null;
  }
  if (!data) return null;
  const [enriched] = await enrichWithUserNames([transformFromDB(data)]);
  return enriched;
}

async function assertNoDuplicatePending(
  requestType: VacationAuthRequestType,
  payload: Record<string, unknown>
): Promise<void> {
  if (requestType === 'cancel_papeleta' && payload.papeletaId) {
    const { data } = await supabase
      .from('vacation_authorization_requests')
      .select('id')
      .eq('status', 'pending')
      .eq('request_type', 'cancel_papeleta')
      .filter('payload->>papeletaId', 'eq', String(payload.papeletaId))
      .maybeSingle();
    if (data) throw new Error('Ya existe una solicitud pendiente para anular esta papeleta');
  }
  if (requestType === 'cancel_day_entry' && payload.dayEntryId) {
    const { data } = await supabase
      .from('vacation_authorization_requests')
      .select('id')
      .eq('status', 'pending')
      .eq('request_type', 'cancel_day_entry')
      .filter('payload->>dayEntryId', 'eq', String(payload.dayEntryId))
      .maybeSingle();
    if (data) throw new Error('Ya existe una solicitud pendiente para anular este día');
  }
}

async function executeApprovedRequest(
  request: VacationAuthorizationRequest,
  approver: User
): Promise<{ papeletaId?: string }> {
  const authorizer = toVerifiedAuthorizer(approver);
  const p = request.payload;

  switch (request.requestType) {
    case 'create_papeleta': {
      const mode = p.mode as string;
      if (mode === 'accumulated') {
        const result = await vacationService.createPapeletaFromAccumulated({
          resourceId: String(p.resourceId),
          unitId: String(p.unitId),
          unitName: String(p.unitName),
          workerName: String(p.workerName),
          workerDni: p.workerDni ? String(p.workerDni) : undefined,
          startDate: String(p.startDate),
          endDate: String(p.endDate),
          returnDate: String(p.returnDate),
          dayEntryIds: (p.selectedDayIds as string[]) || [],
          notes: p.notes ? String(p.notes) : undefined,
          justification: request.justification,
          issuedBy: request.requesterId,
          authorizedBy: authorizer,
          weeklyRestDay: p.weeklyRestDay != null ? Number(p.weeklyRestDay) : undefined,
        });
        return { papeletaId: result.id };
      }
      const result = await vacationService.createDirectPapeleta({
        resourceId: String(p.resourceId),
        unitId: String(p.unitId),
        unitName: String(p.unitName),
        workerName: String(p.workerName),
        workerDni: p.workerDni ? String(p.workerDni) : undefined,
        startDate: String(p.startDate),
        endDate: String(p.endDate),
        returnDate: String(p.returnDate),
        notes: p.notes ? String(p.notes) : undefined,
        justification: request.justification,
        issuedBy: request.requesterId,
        authorizedBy: authorizer,
        requestedWorkDays: p.requestedWorkDays ? Number(p.requestedWorkDays) : undefined,
        weeklyRestDay: p.weeklyRestDay != null ? Number(p.weeklyRestDay) : undefined,
      });
      return { papeletaId: result.id };
    }
    case 'cancel_papeleta': {
      await vacationService.cancelPapeleta(
        String(p.papeletaId),
        request.requesterId,
        authorizer,
        `Anulación autorizada — solicitud ${request.id}`
      );
      return {};
    }
    case 'cancel_day_entry': {
      await vacationService.cancelDayEntry(
        String(p.dayEntryId),
        String(p.resourceId),
        request.requesterId,
        authorizer,
        `Anulación autorizada — solicitud ${request.id}`
      );
      return {};
    }
    default:
      throw new Error('Tipo de solicitud no soportado');
  }
}

export const vacationAuthorizationRequestService = {
  async createRequest(params: CreateVacationAuthRequestParams): Promise<VacationAuthorizationRequest> {
    if (params.requesterId === params.assignedAuthorizerId) {
      throw new Error('El autorizador debe ser un usuario diferente al solicitante');
    }

    const { data: authorizer } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', params.assignedAuthorizerId)
      .maybeSingle();

    if (!authorizer || !canActAsVacationAuthorizer(authorizer.role)) {
      throw new Error('El usuario seleccionado no puede autorizar operaciones de vacaciones');
    }

    await assertNoDuplicatePending(params.requestType, params.payload);

    const { data, error } = await supabase
      .from('vacation_authorization_requests')
      .insert({
        request_type: params.requestType,
        requester_id: params.requesterId,
        assigned_authorizer_id: params.assignedAuthorizerId,
        resource_id: params.resourceId ?? null,
        unit_id: params.unitId ?? null,
        payload: params.payload,
        justification: params.justification?.trim() || null,
        summary: params.summary,
      })
      .select('*')
      .single();

    if (error) {
      handleSupabaseError(error);
      throw error;
    }

    const [result] = await enrichWithUserNames([transformFromDB(data)]);
    await vacationAuditService.logChange({
      actionType: 'CREATE',
      entityType: 'VACATION_PAPELETA',
      entityId: result.id,
      entityName: result.summary.slice(0, 80),
      description: `Solicitud de autorización enviada a ${result.assignedAuthorizerName || 'autorizador'}`,
      after: { requestType: result.requestType, status: result.status, summary: result.summary },
      justification: result.justification,
    });
    return result;
  },

  async listPendingForAuthorizer(authorizerId: string): Promise<VacationAuthorizationRequest[]> {
    const { data, error } = await supabase
      .from('vacation_authorization_requests')
      .select('*')
      .eq('assigned_authorizer_id', authorizerId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) {
      handleSupabaseError(error);
      return [];
    }
    return enrichWithUserNames((data || []).map(transformFromDB));
  },

  async listPendingByRequester(requesterId: string): Promise<VacationAuthorizationRequest[]> {
    const { data, error } = await supabase
      .from('vacation_authorization_requests')
      .select('*')
      .eq('requester_id', requesterId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) {
      handleSupabaseError(error);
      return [];
    }
    return enrichWithUserNames((data || []).map(transformFromDB));
  },

  async countPendingForAuthorizer(authorizerId: string): Promise<number> {
    const { count, error } = await supabase
      .from('vacation_authorization_requests')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_authorizer_id', authorizerId)
      .eq('status', 'pending');
    if (error) {
      handleSupabaseError(error);
      return 0;
    }
    return count ?? 0;
  },

  async approve(requestId: string, approver: User): Promise<{ papeletaId?: string }> {
    const request = await getRequestById(requestId);
    if (!request) throw new Error('Solicitud no encontrada');
    if (request.status !== 'pending') throw new Error('La solicitud ya fue resuelta');
    if (
      request.assignedAuthorizerId !== approver.id &&
      approver.role !== 'SUPER_ADMIN'
    ) {
      throw new Error('No está autorizado para resolver esta solicitud');
    }

    const outcome = await executeApprovedRequest(request, approver);

    const { error } = await supabase
      .from('vacation_authorization_requests')
      .update({
        status: 'approved',
        resolved_at: new Date().toISOString(),
        resolved_by: approver.id,
      })
      .eq('id', requestId)
      .eq('status', 'pending');

    if (error) {
      handleSupabaseError(error);
      throw error;
    }

    await vacationAuditService.logChange({
      actionType: 'UPDATE',
      entityType: 'VACATION_PAPELETA',
      entityId: requestId,
      entityName: request.summary.slice(0, 80),
      description: `Solicitud aprobada por ${approver.name}`,
      before: { status: 'pending' },
      after: { status: 'approved', requestType: request.requestType },
      authorizedBy: { id: approver.id, name: approver.name, email: approver.email },
      justification: request.justification,
    });

    return outcome;
  },

  async reject(
    requestId: string,
    approver: User,
    reason?: string
  ): Promise<void> {
    const request = await getRequestById(requestId);
    if (!request) throw new Error('Solicitud no encontrada');
    if (request.status !== 'pending') throw new Error('La solicitud ya fue resuelta');
    if (
      request.assignedAuthorizerId !== approver.id &&
      approver.role !== 'SUPER_ADMIN'
    ) {
      throw new Error('No está autorizado para resolver esta solicitud');
    }

    const { error } = await supabase
      .from('vacation_authorization_requests')
      .update({
        status: 'rejected',
        rejection_reason: reason?.trim() || null,
        resolved_at: new Date().toISOString(),
        resolved_by: approver.id,
      })
      .eq('id', requestId)
      .eq('status', 'pending');

    if (error) {
      handleSupabaseError(error);
      throw error;
    }

    await vacationAuditService.logChange({
      actionType: 'UPDATE',
      entityType: 'VACATION_PAPELETA',
      entityId: requestId,
      entityName: request.summary.slice(0, 80),
      description: `Solicitud rechazada por ${approver.name}${reason ? `: ${reason}` : ''}`,
      before: { status: 'pending' },
      after: { status: 'rejected', rejectionReason: reason },
      authorizedBy: { id: approver.id, name: approver.name, email: approver.email },
    });
  },

  async cancelByRequester(requestId: string, requesterId: string): Promise<void> {
    const { error } = await supabase
      .from('vacation_authorization_requests')
      .update({
        status: 'cancelled',
        resolved_at: new Date().toISOString(),
        resolved_by: requesterId,
      })
      .eq('id', requestId)
      .eq('requester_id', requesterId)
      .eq('status', 'pending');

    if (error) {
      handleSupabaseError(error);
      throw error;
    }
  },
};
