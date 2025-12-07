import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  Activity, Clock, CheckCircle, AlertCircle, Users, TrendingUp, 
  Calendar, Filter, Download, FileText, MessageSquare, MapPin 
} from 'lucide-react';
import { User, UserRole } from '../types';
import { operationsMetricsService, UserMetrics, OperationsMetrics } from '../services/operationsMetricsService';

interface OperationsDashboardProps {
  currentUser: User;
  users: User[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export const OperationsDashboard: React.FC<OperationsDashboardProps> = ({ currentUser, users }) => {
  const [metrics, setMetrics] = useState<OperationsMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(
    currentUser.role === 'OPERATIONS' || currentUser.role === 'OPERATIONS_SUPERVISOR' 
      ? currentUser.id 
      : null
  );

  useEffect(() => {
    loadMetrics();
  }, [startDate, endDate, selectedUserId]);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      if (selectedUserId) {
        // Métricas de un usuario específico
        const userMetrics = await operationsMetricsService.getUserMetrics(
          selectedUserId,
          startDate,
          endDate
        );
        if (userMetrics) {
          setMetrics({
            periodStart: startDate,
            periodEnd: endDate,
            userMetrics: [userMetrics],
            totalRequests: userMetrics.requestsResolved + userMetrics.requestsPending + userMetrics.requestsInProgress,
            totalLogs: userMetrics.totalLogs,
            averageResponseTime: userMetrics.averageResponseTime,
          });
        }
      } else {
        // Métricas de todos los usuarios
        const allMetrics = await operationsMetricsService.getAllOperationsMetrics(
          startDate,
          endDate
        );
        setMetrics(allMetrics);
      }
    } catch (error) {
      console.error('Error al cargar métricas:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatHours = (hours: number): string => {
    if (hours < 24) {
      return `${Math.round(hours)}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return `${days}d ${remainingHours}h`;
  };

  const exportMetrics = () => {
    if (!metrics) return;
    
    const csv = [
      ['Usuario', 'Email', 'Rol', 'Logs Totales', 'Visitas', 'Solicitudes Resueltas', 'Solicitudes Pendientes', 'Tiempo Promedio Respuesta (h)'],
      ...metrics.userMetrics.map(m => [
        m.userName,
        m.userEmail,
        m.role,
        m.totalLogs.toString(),
        m.visitsCount.toString(),
        m.requestsResolved.toString(),
        m.requestsPending.toString(),
        m.averageResponseTime.toFixed(2),
      ]),
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metricas-operaciones-${startDate}-${endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Activity className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando métricas...</p>
        </div>
      </div>
    );
  }

  if (!metrics || metrics.userMetrics.length === 0) {
    return (
      <div className="p-6 md:p-8 space-y-6 animate-in fade-in duration-500">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Dashboard de Operaciones</h1>
          <p className="text-slate-500">Métricas de gestión y rendimiento</p>
        </header>
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
          <p className="text-slate-500">No hay datos disponibles para el período seleccionado.</p>
        </div>
      </div>
    );
  }

  // Preparar datos para gráficos
  const logsByTypeData = Object.entries(
    metrics.userMetrics.reduce((acc, m) => {
      Object.entries(m.logsByType).forEach(([type, count]) => {
        acc[type] = (acc[type] || 0) + count;
      });
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  const userPerformanceData = metrics.userMetrics.map(m => ({
    name: m.userName.split(' ').slice(0, 2).join(' '),
    logs: m.totalLogs,
    requests: m.requestsResolved,
    visits: m.visitsCount,
    avgResponseTime: m.averageResponseTime,
  }));

  const requestsStatusData = [
    { name: 'Resueltas', value: metrics.userMetrics.reduce((sum, m) => sum + m.requestsResolved, 0), color: '#10b981' },
    { name: 'En Progreso', value: metrics.userMetrics.reduce((sum, m) => sum + m.requestsInProgress, 0), color: '#f59e0b' },
    { name: 'Pendientes', value: metrics.userMetrics.reduce((sum, m) => sum + m.requestsPending, 0), color: '#ef4444' },
  ].filter(item => item.value > 0);

  return (
    <div className="p-6 md:p-8 space-y-6 animate-in fade-in duration-500">
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard de Operaciones</h1>
          <p className="text-slate-500">Métricas de gestión y rendimiento de usuarios</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportMetrics}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
          >
            <Download size={16} />
            Exportar CSV
          </button>
        </div>
      </header>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Usuario</label>
            <select
              value={selectedUserId || ''}
              onChange={(e) => setSelectedUserId(e.target.value || null)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={currentUser.role === 'OPERATIONS' || currentUser.role === 'OPERATIONS_SUPERVISOR'}
            >
              <option value="">Todos los usuarios</option>
              {users
                .filter(u => u.role === 'OPERATIONS' || u.role === 'OPERATIONS_SUPERVISOR')
                .map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.role === 'OPERATIONS' ? 'Operaciones' : 'Supervisor'})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total de Logs</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{metrics.totalLogs}</p>
            </div>
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <FileText size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Solicitudes Totales</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{metrics.totalRequests}</p>
            </div>
            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
              <MessageSquare size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Tiempo Promedio Respuesta</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {formatHours(metrics.averageResponseTime)}
              </p>
            </div>
            <div className="p-3 bg-yellow-100 text-yellow-600 rounded-lg">
              <Clock size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Visitas</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {metrics.userMetrics.reduce((sum, m) => sum + m.visitsCount, 0)}
              </p>
            </div>
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
              <MapPin size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de métricas por usuario */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Métricas por Usuario</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Usuario</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Rol</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Logs</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Visitas</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Solicitudes Resueltas</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Pendientes</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Tiempo Promedio</th>
              </tr>
            </thead>
            <tbody>
              {metrics.userMetrics.map((userMetric) => (
                <tr key={userMetric.userId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div>
                      <p className="font-medium text-slate-800">{userMetric.userName}</p>
                      <p className="text-xs text-slate-500">{userMetric.userEmail}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">
                      {userMetric.role === 'OPERATIONS' ? 'Operaciones' : 'Supervisor'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-semibold text-slate-800">{userMetric.totalLogs}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-semibold text-slate-800">{userMetric.visitsCount}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-semibold text-green-600">{userMetric.requestsResolved}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-semibold text-red-600">{userMetric.requestsPending}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-semibold text-slate-800">
                      {formatHours(userMetric.averageResponseTime)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de rendimiento por usuario */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Rendimiento por Usuario</h3>
          {userPerformanceData.length > 0 ? (
            <div className="h-64" style={{ minHeight: '256px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={userPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="logs" fill="#3b82f6" name="Logs" />
                  <Bar dataKey="requests" fill="#10b981" name="Solicitudes Resueltas" />
                  <Bar dataKey="visits" fill="#8b5cf6" name="Visitas" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">No hay datos para mostrar</p>
          )}
        </div>

        {/* Gráfico de tipos de logs */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Distribución de Logs por Tipo</h3>
          {logsByTypeData.length > 0 ? (
            <div className="h-64" style={{ minHeight: '256px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={logsByTypeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {logsByTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">No hay datos para mostrar</p>
          )}
        </div>

        {/* Gráfico de estado de solicitudes */}
        {requestsStatusData.length > 0 && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Estado de Solicitudes</h3>
            <div className="h-64" style={{ minHeight: '256px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={requestsStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {requestsStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Gráfico de tiempo de respuesta */}
        {userPerformanceData.length > 0 && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Tiempo Promedio de Respuesta</h3>
            <div className="h-64" style={{ minHeight: '256px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={userPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatHours(value)} />
                  <Bar dataKey="avgResponseTime" fill="#f59e0b" name="Tiempo Promedio (h)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

