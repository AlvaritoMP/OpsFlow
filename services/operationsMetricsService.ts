import { supabase, handleSupabaseError } from './supabase';
import { Unit, OperationalLog, ClientRequest, User, UserRole } from '../types';
import { auditService, AuditLog } from './auditService';

// ============================================
// SERVICIO DE MÉTRICAS DE OPERACIONES
// ============================================

export interface UserMetrics {
  userId: string;
  userName: string;
  userEmail: string;
  role: UserRole;
  
  // Logs operacionales
  totalLogs: number;
  logsByType: Record<string, number>;
  visitsCount: number; // Logs de tipo "Visita Cliente"
  
  // Solicitudes de clientes
  requestsResolved: number;
  requestsPending: number;
  requestsInProgress: number;
  averageResponseTime: number; // En horas
  totalResponseTime: number; // Tiempo total en horas
  
  // Actividad general
  totalActions: number; // Desde audit logs
  actionsByType: Record<string, number>;
  
  // Período
  periodStart: string;
  periodEnd: string;
}

export interface OperationsMetrics {
  periodStart: string;
  periodEnd: string;
  userMetrics: UserMetrics[];
  totalRequests: number;
  totalLogs: number;
  averageResponseTime: number;
}

export const operationsMetricsService = {
  // Obtener métricas para un usuario específico
  async getUserMetrics(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<UserMetrics | null> {
    try {
      const user = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (!user.data) return null;

      const periodStart = startDate || this.getDefaultStartDate();
      const periodEnd = endDate || new Date().toISOString().split('T')[0];

      // Obtener logs operacionales del usuario
      const { data: logsData } = await supabase
        .from('operational_logs')
        .select('*, units!inner(id, name)')
        .eq('author', user.data.name)
        .gte('date', periodStart)
        .lte('date', periodEnd);

      const logs = logsData || [];
      const visitsCount = logs.filter((l: any) => l.type === 'Visita Cliente').length;
      
      const logsByType: Record<string, number> = {};
      logs.forEach((log: any) => {
        logsByType[log.type] = (logsByType[log.type] || 0) + 1;
      });

      // Obtener audit logs del usuario para encontrar acciones en solicitudes
      const auditLogs = await auditService.getAll({
        userId,
        startDate: periodStart,
        endDate: periodEnd,
      });

      // Obtener todas las solicitudes y calcular tiempos de respuesta
      const { data: allRequestsData } = await supabase
        .from('client_requests')
        .select('*, request_comments(*)')
        .gte('date', periodStart)
        .lte('date', periodEnd);

      const allRequests = allRequestsData || [];
      
      // Filtrar solicitudes donde el usuario participó
      // 1. Solicitudes con comentarios del usuario
      // 2. Solicitudes actualizadas por el usuario (desde audit logs)
      const userRequestIds = new Set<string>();
      
      allRequests.forEach((req: any) => {
        const hasUserComment = req.request_comments?.some((c: any) => 
          c.author === user.data.name || c.role === user.data.role
        );
        if (hasUserComment) {
          userRequestIds.add(req.id);
        }
      });

      // Incluir requests actualizadas por el usuario (desde audit logs)
      auditLogs
        .filter(log => log.actionType === 'UPDATE' && log.entityType === 'REQUEST' && log.entityId)
        .forEach(log => {
          userRequestIds.add(log.entityId!);
        });

      // Si no hay requests específicas del usuario, usar todas las requests del período
      // para calcular métricas generales (esto es útil para supervisores que gestionan todas)
      const userRequests = userRequestIds.size > 0 
        ? allRequests.filter((r: any) => userRequestIds.has(r.id))
        : allRequests; // Si es supervisor, puede ver todas las requests
      
      const requestsResolved = userRequests.filter((r: any) => r.status === 'RESOLVED').length;
      const requestsPending = userRequests.filter((r: any) => r.status === 'PENDING').length;
      const requestsInProgress = userRequests.filter((r: any) => r.status === 'IN_PROGRESS').length;

      // Calcular tiempo promedio de respuesta
      let totalResponseTime = 0;
      let resolvedWithTime = 0;
      
      userRequests
        .filter((r: any) => r.status === 'RESOLVED' && r.resolved_date)
        .forEach((req: any) => {
          const requestDate = new Date(req.date);
          const resolvedDate = new Date(req.resolved_date);
          const hours = (resolvedDate.getTime() - requestDate.getTime()) / (1000 * 60 * 60);
          if (hours > 0) {
            totalResponseTime += hours;
            resolvedWithTime++;
          }
        });

      const averageResponseTime = resolvedWithTime > 0 ? totalResponseTime / resolvedWithTime : 0;

      // Obtener actividad general desde audit logs
      const actionsByType: Record<string, number> = {};
      auditLogs.forEach(log => {
        const key = `${log.actionType}_${log.entityType}`;
        actionsByType[key] = (actionsByType[key] || 0) + 1;
      });

      return {
        userId: user.data.id,
        userName: user.data.name,
        userEmail: user.data.email,
        role: user.data.role as UserRole,
        totalLogs: logs.length,
        logsByType,
        visitsCount,
        requestsResolved,
        requestsPending,
        requestsInProgress,
        averageResponseTime,
        totalResponseTime,
        totalActions: auditLogs.length,
        actionsByType,
        periodStart,
        periodEnd,
      };
    } catch (error) {
      console.error('Error al obtener métricas del usuario:', error);
      handleSupabaseError(error);
      return null;
    }
  },

  // Obtener métricas para todos los usuarios de Operaciones y Supervisores
  async getAllOperationsMetrics(
    startDate?: string,
    endDate?: string
  ): Promise<OperationsMetrics> {
    try {
      const periodStart = startDate || this.getDefaultStartDate();
      const periodEnd = endDate || new Date().toISOString().split('T')[0];

      // Obtener todos los usuarios de Operaciones y Supervisores
      const { data: usersData } = await supabase
        .from('users')
        .select('*')
        .in('role', ['OPERATIONS', 'OPERATIONS_SUPERVISOR']);

      if (!usersData || usersData.length === 0) {
        return {
          periodStart,
          periodEnd,
          userMetrics: [],
          totalRequests: 0,
          totalLogs: 0,
          averageResponseTime: 0,
        };
      }

      // Obtener métricas para cada usuario
      const userMetricsPromises = usersData.map(user =>
        this.getUserMetrics(user.id, periodStart, periodEnd)
      );
      const userMetrics = (await Promise.all(userMetricsPromises)).filter(
        (m): m is UserMetrics => m !== null
      );

      // Calcular totales
      const totalRequests = userMetrics.reduce((sum, m) => sum + m.requestsResolved + m.requestsPending + m.requestsInProgress, 0);
      const totalLogs = userMetrics.reduce((sum, m) => sum + m.totalLogs, 0);
      
      const totalResponseTime = userMetrics.reduce((sum, m) => sum + m.totalResponseTime, 0);
      const totalResolved = userMetrics.reduce((sum, m) => sum + m.requestsResolved, 0);
      const averageResponseTime = totalResolved > 0 ? totalResponseTime / totalResolved : 0;

      return {
        periodStart,
        periodEnd,
        userMetrics,
        totalRequests,
        totalLogs,
        averageResponseTime,
      };
    } catch (error) {
      console.error('Error al obtener métricas de operaciones:', error);
      handleSupabaseError(error);
      return {
        periodStart: startDate || this.getDefaultStartDate(),
        periodEnd: endDate || new Date().toISOString().split('T')[0],
        userMetrics: [],
        totalRequests: 0,
        totalLogs: 0,
        averageResponseTime: 0,
      };
    }
  },

  // Obtener fecha de inicio por defecto (últimos 30 días)
  getDefaultStartDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  },
};

