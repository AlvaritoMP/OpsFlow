import React, { useState, useEffect } from 'react';
import { FileText, Search, Filter, Download, Calendar, User, Activity, RefreshCw, Loader2 } from 'lucide-react';
import { auditService, AuditLog, AuditActionType, AuditEntityType } from '../services/auditService';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActionType, setFilterActionType] = useState<AuditActionType | ''>('');
  const [filterEntityType, setFilterEntityType] = useState<AuditEntityType | ''>('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 50;

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const startDate = filterStartDate ? `${filterStartDate}T00:00:00Z` : undefined;
      const endDate = filterEndDate ? `${filterEndDate}T23:59:59Z` : undefined;
      
      const data = await auditService.getAll({
        actionType: filterActionType || undefined,
        entityType: filterEntityType || undefined,
        startDate,
        endDate,
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
      });
      
      setLogs(data);
      setTotalCount(data.length); // En producción, esto vendría del backend
    } catch (err: any) {
      setError(err.message || 'Error al cargar logs de auditoría');
      console.error('Error loading audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [currentPage, filterActionType, filterEntityType, filterStartDate, filterEndDate]);

  const getActionColor = (action: AuditActionType) => {
    switch (action) {
      case 'CREATE':
        return 'bg-green-100 text-green-800';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800';
      case 'DELETE':
        return 'bg-red-100 text-red-800';
      case 'LOGIN':
        return 'bg-purple-100 text-purple-800';
      case 'LOGOUT':
        return 'bg-gray-100 text-gray-800';
      case 'VIEW':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const getActionLabel = (action: AuditActionType) => {
    const labels: Record<AuditActionType, string> = {
      CREATE: 'Crear',
      UPDATE: 'Actualizar',
      DELETE: 'Eliminar',
      LOGIN: 'Iniciar Sesión',
      LOGOUT: 'Cerrar Sesión',
      VIEW: 'Ver',
      EXPORT: 'Exportar',
      IMPORT: 'Importar',
    };
    return labels[action] || action;
  };

  const getEntityLabel = (entity: AuditEntityType) => {
    const labels: Record<AuditEntityType, string> = {
      UNIT: 'Unidad',
      USER: 'Usuario',
      RESOURCE: 'Recurso',
      LOG: 'Log Operativo',
      REQUEST: 'Solicitud',
      ZONE: 'Zona',
      MANAGEMENT_STAFF: 'Personal de Gestión',
      SETTINGS: 'Configuración',
      PERMISSIONS: 'Permisos',
    };
    return labels[entity] || entity;
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('es-ES', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
      }),
      time: date.toLocaleTimeString('es-ES', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      }),
    };
  };

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      log.userName.toLowerCase().includes(search) ||
      log.userEmail.toLowerCase().includes(search) ||
      log.entityName?.toLowerCase().includes(search) ||
      log.description?.toLowerCase().includes(search)
    );
  });

  const exportLogs = () => {
    const csv = [
      ['Fecha', 'Hora', 'Usuario', 'Email', 'Acción', 'Tipo de Entidad', 'Entidad', 'Descripción'].join(','),
      ...filteredLogs.map(log => {
        const { date, time } = formatDateTime(log.createdAt);
        return [
          date,
          time,
          `"${log.userName}"`,
          `"${log.userEmail}"`,
          getActionLabel(log.actionType),
          getEntityLabel(log.entityType),
          `"${log.entityName || ''}"`,
          `"${log.description || ''}"`,
        ].join(',');
      }),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <FileText className="text-white" size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Logs de Auditoría</h1>
                <p className="text-sm text-slate-600">Historial completo de cambios en el sistema</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={loadLogs}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors flex items-center space-x-2"
              >
                <RefreshCw size={16} />
                <span>Actualizar</span>
              </button>
              <button
                onClick={exportLogs}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Download size={16} />
                <span>Exportar CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex items-center space-x-2 mb-4">
            <Filter size={18} className="text-slate-600" />
            <h2 className="font-semibold text-slate-800">Filtros</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Búsqueda */}
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Búsqueda
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por usuario, entidad o descripción..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* Tipo de Acción */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tipo de Acción
              </label>
              <select
                value={filterActionType}
                onChange={(e) => {
                  setFilterActionType(e.target.value as AuditActionType | '');
                  setCurrentPage(1);
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="">Todos</option>
                <option value="CREATE">Crear</option>
                <option value="UPDATE">Actualizar</option>
                <option value="DELETE">Eliminar</option>
                <option value="LOGIN">Iniciar Sesión</option>
                <option value="LOGOUT">Cerrar Sesión</option>
                <option value="VIEW">Ver</option>
                <option value="EXPORT">Exportar</option>
                <option value="IMPORT">Importar</option>
              </select>
            </div>

            {/* Tipo de Entidad */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tipo de Entidad
              </label>
              <select
                value={filterEntityType}
                onChange={(e) => {
                  setFilterEntityType(e.target.value as AuditEntityType | '');
                  setCurrentPage(1);
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="">Todos</option>
                <option value="UNIT">Unidad</option>
                <option value="USER">Usuario</option>
                <option value="RESOURCE">Recurso</option>
                <option value="LOG">Log Operativo</option>
                <option value="REQUEST">Solicitud</option>
                <option value="ZONE">Zona</option>
                <option value="MANAGEMENT_STAFF">Personal de Gestión</option>
                <option value="SETTINGS">Configuración</option>
                <option value="PERMISSIONS">Permisos</option>
              </select>
            </div>

            {/* Fecha Inicio */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Fecha Inicio
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => {
                    setFilterStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* Fecha Fin */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Fecha Fin
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => {
                    setFilterEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tabla de Logs */}
        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <Loader2 className="animate-spin mx-auto mb-4 text-blue-600" size={32} />
            <p className="text-slate-600">Cargando logs de auditoría...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-600 font-semibold mb-2">Error</p>
            <p className="text-red-700 text-sm">{error}</p>
            <button
              onClick={loadLogs}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Reintentar
            </button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <FileText className="mx-auto mb-4 text-slate-400" size={48} />
            <p className="text-slate-600 font-medium mb-2">No se encontraron logs</p>
            <p className="text-slate-500 text-sm">Intenta ajustar los filtros de búsqueda</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Fecha y Hora
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Usuario
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Acción
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Entidad
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Descripción
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredLogs.map((log) => {
                    const { date, time } = formatDateTime(log.createdAt);
                    return (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-900">{date}</div>
                          <div className="text-xs text-slate-500">{time}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                              {log.userName.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-slate-900">{log.userName}</div>
                              <div className="text-xs text-slate-500">{log.userEmail}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.actionType)}`}>
                            <Activity size={12} className="mr-1" />
                            {getActionLabel(log.actionType)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-slate-900">
                            <span className="font-medium">{getEntityLabel(log.entityType)}</span>
                            {log.entityName && (
                              <span className="text-slate-500 ml-2">• {log.entityName}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-slate-700">{log.description || '-'}</div>
                          {log.changes && (
                            <details className="mt-2">
                              <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-700">
                                Ver cambios
                              </summary>
                              <pre className="mt-2 p-2 bg-slate-50 rounded text-xs overflow-x-auto">
                                {JSON.stringify(log.changes, null, 2)}
                              </pre>
                            </details>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalCount > itemsPerPage && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <div className="text-sm text-slate-600">
                  Mostrando {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalCount)} de {totalCount}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="px-4 py-2 text-sm text-slate-700">
                    Página {currentPage}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => p + 1)}
                    disabled={filteredLogs.length < itemsPerPage}
                    className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

