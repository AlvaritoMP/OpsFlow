import { supabase, handleSupabaseError } from './supabase';
import { authService } from './authService';
import { UserRole } from '../types';

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
  | 'PERMISSIONS'
  | 'VACATION_PAPELETA'
  | 'VACATION_DAY_ENTRY'
  | 'VACATION_BALANCE';

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

// Cache global para evitar logs duplicados
const lastLogCache: Map<string, number> = new Map();
const DUPLICATE_WINDOW_MS = 2000; // 2 segundos

export const auditService = {
  // Registrar un log de auditoría
  async log(params: CreateAuditLogParams): Promise<void> {
    try {
      // SOLUCIÓN DEFINITIVA: Usar directamente la sesión LOCAL (localStorage)
      // NO usar getCurrentUser() porque puede estar devolviendo el usuario incorrecto
      const session = authService.getSession();
      if (!session) {
        console.warn('⚠️ No hay sesión local para registrar log de auditoría');
        console.warn('⚠️ Parámetros del log:', params);
        console.warn('⚠️ localStorage completo:', {
          sessionKey: localStorage.getItem('OPSFLOW_SESSION'),
          allKeys: Object.keys(localStorage),
        });
        return;
      }
      
      console.log('🔍 auditService.log() - Sesión local encontrada:', {
        userId: session.userId,
        email: session.email,
        timestamp: new Date(session.timestamp).toISOString(),
        sessionAge: Date.now() - session.timestamp,
      });
      
      // Obtener usuario directamente de la BD usando el userId de la sesión local
      // NO usar getCurrentUser() porque puede tener problemas
      const { usersService } = await import('./usersService');
      let user = null;
      try {
        user = await usersService.getById(session.userId);
        if (user) {
          console.log('✅ auditService.log() - Usuario obtenido de BD:', {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          });
        } else {
          console.warn('⚠️ auditService.log() - Usuario no encontrado en BD con ID:', session.userId);
        }
      } catch (userError) {
        console.error('❌ Error al obtener usuario de BD:', userError);
      }
      
      // Si no se encontró el usuario en BD, usar la sesión local como fallback
      const finalUser = user || {
        id: session.userId,
        email: session.email,
        name: session.email.split('@')[0],
        role: 'OPERATIONS' as UserRole,
      };
      
      if (!user) {
        console.warn('⚠️ Usando datos de sesión local como fallback:', finalUser);
      }
      
      // Log detallado para debugging
      console.log('📝 Registrando log de auditoría:', {
        userId: finalUser.id,
        userName: finalUser.name,
        userEmail: finalUser.email,
        userRole: finalUser.role,
        actionType: params.actionType,
        entityType: params.entityType,
        entityName: params.entityName,
        sessionUserId: session.userId,
        sessionEmail: session.email,
        userFromDB: !!user,
      });

      // Crear una clave única para detectar duplicados
      const logKey = `${finalUser.id}-${params.actionType}-${params.entityType}-${params.entityId || 'none'}-${JSON.stringify(params.changes?.fields || [])}`;
      const now = Date.now();
      const lastLogTime = lastLogCache.get(logKey);

      // Si hay un log similar en los últimos 2 segundos, ignorarlo (probable duplicado)
      if (lastLogTime && (now - lastLogTime) < DUPLICATE_WINDOW_MS) {
        console.warn('⚠️ Log duplicado detectado, ignorando:', logKey);
        return;
      }

      // Actualizar cache
      lastLogCache.set(logKey, now);
      
      // Limpiar cache antiguo (mantener solo últimos 1000 registros)
      if (lastLogCache.size > 1000) {
        const oldestKey = Array.from(lastLogCache.entries())
          .sort((a, b) => a[1] - b[1])[0][0];
        lastLogCache.delete(oldestKey);
      }

      // Obtener IP y User Agent del navegador
      const ipAddress = await this.getClientIP();
      const userAgent = navigator.userAgent;

      // Intentar insertar el log directamente primero
      let insertError = null;
      const { error } = await supabase
        .from('audit_logs')
        .insert({
          user_id: finalUser.id,
          user_name: finalUser.name || finalUser.email?.split('@')[0] || 'Usuario',
          user_email: finalUser.email || '',
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
        insertError = error;
        console.error('❌ Error al registrar log de auditoría (inserción directa):', error);
        console.error('❌ Detalles del error:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        
        // Si falla la inserción directa, intentar usar RPC como fallback
        console.warn('⚠️ Intentando insertar log usando función RPC como fallback...');
        
        try {
          const { error: rpcError, data: rpcData } = await supabase.rpc('insert_audit_log', {
            p_user_id: finalUser.id,
            p_user_name: finalUser.name || finalUser.email?.split('@')[0] || 'Usuario',
            p_user_email: finalUser.email || '',
            p_action_type: params.actionType,
            p_entity_type: params.entityType,
            p_entity_id: params.entityId || null,
            p_entity_name: params.entityName || null,
            p_changes: params.changes || null,
            p_description: params.description || null,
            p_ip_address: ipAddress || null,
            p_user_agent: userAgent || null,
          });
          
          if (rpcError) {
            console.error('❌ Error al insertar log usando RPC:', rpcError);
          } else {
            console.log('✅ Log insertado exitosamente usando RPC (fallback)');
          }
        } catch (rpcErr) {
          console.error('❌ Error al intentar insertar log usando RPC:', rpcErr);
        }
      } else {
        console.log('✅ Log de auditoría registrado exitosamente');
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

      // Usar función RPC para bypass RLS y obtener TODOS los logs sin restricciones
      // Esta función usa SECURITY DEFINER para ejecutar con permisos elevados
      console.log('🔍 Ejecutando función RPC get_all_audit_logs para obtener TODOS los logs...');
      console.log('🔍 Filtros aplicados:', filters);

      // Construir parámetros para RPC (solo incluir los que no son null/undefined)
      const rpcParams: any = {
        p_limit_count: 10000
      };
      
      if (filters?.actionType) {
        rpcParams.p_action_type = filters.actionType;
      }
      if (filters?.entityType) {
        rpcParams.p_entity_type = filters.entityType;
      }
      if (filters?.userId) {
        rpcParams.p_user_id = filters.userId;
      }
      if (filters?.startDate) {
        rpcParams.p_start_date = filters.startDate;
      }
      if (filters?.endDate) {
        rpcParams.p_end_date = filters.endDate;
      }

      console.log('🔍 Parámetros RPC:', rpcParams);
      console.log('🔍 Usuario actual que solicita logs:', {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role
      });

      const { data, error } = await supabase.rpc('get_all_audit_logs', rpcParams);

      const count = data?.length || 0;

      if (error) {
        console.error('❌ Error al obtener logs de auditoría:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error hint:', error.hint);
        handleSupabaseError(error);
        return [];
      }

      // Log para debugging
      console.log(`📊 Audit logs obtenidos mediante RPC: ${data?.length || 0} registros`);
      if (data && data.length > 0) {
        const uniqueUsers = new Set(data.map((log: any) => log.user_id));
        const userNames = new Set(data.map((log: any) => log.user_name));
        const userEmails = new Set(data.map((log: any) => log.user_email));
        
        console.log(`👥 Usuarios únicos en los logs: ${uniqueUsers.size}`, Array.from(uniqueUsers));
        console.log(`📝 Nombres de usuarios:`, Array.from(userNames));
        console.log(`📧 Emails de usuarios:`, Array.from(userEmails));
        
        // Mostrar distribución de logs por usuario
        const logsByUser: Record<string, number> = {};
        data.forEach((log: any) => {
          const key = `${log.user_name} (${log.user_email})`;
          logsByUser[key] = (logsByUser[key] || 0) + 1;
        });
        console.log('📊 Distribución de logs por usuario:', logsByUser);
        
        // Verificar que estamos obteniendo logs de múltiples usuarios
        if (uniqueUsers.size > 1) {
          console.log(`✅ Éxito: Se están obteniendo logs de ${uniqueUsers.size} usuarios diferentes`);
        } else if (uniqueUsers.size === 1) {
          console.warn('⚠️ ADVERTENCIA: Solo se están obteniendo logs de un usuario. Verificar que otros usuarios hayan realizado acciones.');
          console.warn('⚠️ Usuario único encontrado:', Array.from(uniqueUsers)[0]);
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

  // Obtener logs de vacaciones (cambios en papeletas, días y saldos)
  async getVacationLogs(filters?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<AuditLog[]> {
    try {
      const types: AuditEntityType[] = [
        'VACATION_PAPELETA',
        'VACATION_DAY_ENTRY',
        'VACATION_BALANCE',
      ];
      let query = supabase
        .from('audit_logs')
        .select('*')
        .in('entity_type', types)
        .order('created_at', { ascending: false })
        .limit(filters?.limit ?? 5000);

      if (filters?.startDate) {
        query = query.gte('created_at', `${filters.startDate}T00:00:00`);
      }
      if (filters?.endDate) {
        query = query.lte('created_at', `${filters.endDate}T23:59:59`);
      }

      const { data, error } = await query;
      if (error) {
        handleSupabaseError(error);
        return [];
      }
      return (data || []).map(transformAuditLogFromDB);
    } catch (error) {
      console.error('Error al obtener historial de vacaciones:', error);
      return [];
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

