import { supabase, handleSupabaseError } from './supabase';
import { authService } from './authService';

// ============================================
// SERVICIO DE AUDITORÍA
// ============================================

export type AuditActionType = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'DELETE' 
  | 'LOGIN' 
  | 'LOGOUT' 
  | 'VIEW'
  | 'EXPORT'
  | 'IMPORT';

export type AuditEntityType = 
  | 'UNIT' 
  | 'USER' 
  | 'RESOURCE' 
  | 'LOG' 
  | 'REQUEST' 
  | 'ZONE' 
  | 'MANAGEMENT_STAFF'
  | 'SETTINGS'
  | 'PERMISSIONS';

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId?: string;
  entityName?: string;
  changes?: {
    before?: any;
    after?: any;
    fields?: string[];
  };
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface CreateAuditLogParams {
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId?: string;
  entityName?: string;
  changes?: {
    before?: any;
    after?: any;
    fields?: string[];
  };
  description?: string;
}

export const auditService = {
  // Registrar un log de auditoría
  async log(params: CreateAuditLogParams): Promise<void> {
    try {
      // Obtener información del usuario actual
      const user = await authService.getCurrentUser();
      if (!user) {
        console.warn('No hay usuario autenticado para registrar log de auditoría');
        return;
      }

      // Obtener IP y User Agent del navegador
      const ipAddress = await this.getClientIP();
      const userAgent = navigator.userAgent;

      // Insertar el log
      const { error } = await supabase
        .from('audit_logs')
        .insert({
          user_id: user.id,
          user_name: user.name || user.email?.split('@')[0] || 'Usuario',
          user_email: user.email || '',
          action_type: params.actionType,
          entity_type: params.entityType,
          entity_id: params.entityId || null,
          entity_name: params.entityName || null,
          changes: params.changes || null,
          description: params.description || null,
          ip_address: ipAddress || null,
          user_agent: userAgent || null,
        });

      if (error) {
        console.error('Error al registrar log de auditoría:', error);
        // No lanzar error para no interrumpir el flujo principal
      }
    } catch (error) {
      console.error('Error inesperado al registrar log de auditoría:', error);
      // No lanzar error para no interrumpir el flujo principal
    }
  },

  // Obtener todos los logs (solo para administradores)
  async getAll(filters?: {
    actionType?: AuditActionType;
    entityType?: AuditEntityType;
    userId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditLog[]> {
    try {
      // Verificar que el usuario actual es ADMIN o SUPER_ADMIN
      const currentUser = await authService.getCurrentUser();
      if (!currentUser || (currentUser.role !== 'ADMIN' && currentUser.role !== 'SUPER_ADMIN')) {
        console.warn('Usuario no autorizado para ver logs de auditoría');
        return [];
      }

      // Usar RPC o consulta directa para evitar problemas con RLS
      // Primero intentar con la consulta normal
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' }) // Agregar count para debugging
        .order('created_at', { ascending: false });

      if (filters?.actionType) {
        query = query.eq('action_type', filters.actionType);
      }

      if (filters?.entityType) {
        query = query.eq('entity_type', filters.entityType);
      }

      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 100) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('❌ Error al obtener logs de auditoría:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        handleSupabaseError(error);
        return [];
      }

      // Log para debugging
      console.log(`📊 Audit logs obtenidos: ${data?.length || 0} registros (count: ${count})`);
      if (data && data.length > 0) {
        const uniqueUsers = new Set(data.map((log: any) => log.user_id));
        const userNames = new Set(data.map((log: any) => log.user_name));
        console.log(`👥 Usuarios únicos en los logs: ${uniqueUsers.size}`, Array.from(uniqueUsers));
        console.log(`📝 Nombres de usuarios:`, Array.from(userNames));
        
        // Si solo hay un usuario, puede ser un problema de RLS
        if (uniqueUsers.size === 1) {
          console.warn('⚠️ ADVERTENCIA: Solo se están obteniendo logs de un usuario. Puede ser un problema de RLS o autenticación.');
        }
      } else {
        console.warn('⚠️ No se obtuvieron logs de auditoría');
      }

      return (data || []).map(transformAuditLogFromDB);
    } catch (error: any) {
      console.error('Error al obtener logs de auditoría:', error);
      throw new Error(error.message || 'Error al obtener logs de auditoría');
    }
  },

  // Obtener logs de una entidad específica
  async getByEntity(entityType: AuditEntityType, entityId: string): Promise<AuditLog[]> {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });

      if (error) {
        handleSupabaseError(error);
        return [];
      }

      return (data || []).map(transformAuditLogFromDB);
    } catch (error: any) {
      console.error('Error al obtener logs de entidad:', error);
      throw new Error(error.message || 'Error al obtener logs de entidad');
    }
  },

  // Obtener IP del cliente (simplificado, en producción usar un servicio externo)
  async getClientIP(): Promise<string | null> {
    try {
      // En producción, podrías usar un servicio como ipify.org
      // Por ahora, retornamos null ya que no podemos obtener la IP real del cliente desde el navegador
      return null;
    } catch {
      return null;
    }
  },
};

function transformAuditLogFromDB(data: any): AuditLog {
  return {
    id: data.id,
    userId: data.user_id,
    userName: data.user_name,
    userEmail: data.user_email,
    actionType: data.action_type,
    entityType: data.entity_type,
    entityId: data.entity_id,
    entityName: data.entity_name,
    changes: data.changes || undefined,
    description: data.description,
    ipAddress: data.ip_address,
    userAgent: data.user_agent,
    createdAt: data.created_at,
  };
}

