import { auditService, AuditActionType, AuditEntityType, AuditLog } from './auditService';

export type VacationAuditEntityType =
  | 'VACATION_PAPELETA'
  | 'VACATION_DAY_ENTRY'
  | 'VACATION_BALANCE';

export interface VacationAuditAuthorizer {
  id: string;
  name: string;
  email?: string;
}

export interface LogVacationChangeParams {
  actionType: AuditActionType;
  entityType: VacationAuditEntityType;
  entityId: string;
  entityName: string;
  description: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  authorizedBy?: VacationAuditAuthorizer;
  justification?: string;
  fields?: string[];
}

export const vacationAuditService = {
  async logChange(params: LogVacationChangeParams): Promise<void> {
    await auditService.log({
      actionType: params.actionType,
      entityType: params.entityType as AuditEntityType,
      entityId: params.entityId,
      entityName: params.entityName,
      description: params.description,
      changes: {
        before: params.before,
        after: params.after,
        fields: params.fields,
        ...(params.authorizedBy ? { authorizedBy: params.authorizedBy } : {}),
        ...(params.justification ? { justification: params.justification } : {}),
      },
    });
  },

  async getChangeLogs(filters?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<AuditLog[]> {
    return auditService.getVacationLogs(filters);
  },
};
