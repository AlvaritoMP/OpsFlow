import React, { useState, useEffect, useMemo } from 'react';
import { Unit, UnitStatus, ResourceType } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Building2, Users, AlertTriangle, CheckCircle, Sun, Moon, Clock, Shield, UserPlus } from 'lucide-react';

interface DashboardProps {
  units: Unit[];
  onSelectUnit: (unitId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ units, onSelectUnit }) => {
  // States for new metrics
  const [workersByShift, setWorkersByShift] = useState({ day: 0, afternoon: 0, night: 0 });
  const [retenCoverages, setRetenCoverages] = useState(0);
  const [newWorkersThisMonth, setNewWorkersThisMonth] = useState(0);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  // Calculate aggregations
  const totalUnits = units.length;
  const activeUnits = units.filter(u => u.status === UnitStatus.ACTIVE).length;
  const issueUnits = units.filter(u => u.status === UnitStatus.ISSUE).length;
  const totalWorkers = units.reduce((total, unit) => {
    return total + unit.resources.filter(r => r.type === ResourceType.PERSONNEL && !r.archived).length;
  }, 0);
  
  const chartData = units
    .filter(u => u.complianceHistory && u.complianceHistory.length > 0)
    .map(u => ({
      name: u.name.split(' ').slice(0, 2).join(' '), // Short name
      score: u.complianceHistory[u.complianceHistory.length - 1]?.score || 0,
      id: u.id
    }));

  // Calculate workers by shift based on assignedShift field (not rostering)
  const workersByShiftCount = useMemo(() => {
    let dayCount = 0;
    let afternoonCount = 0;
    let nightCount = 0;

    units.forEach(unit => {
      unit.resources
        .filter(r => r.type === ResourceType.PERSONNEL && !r.archived)
        .forEach(r => {
          const shift = r.assignedShift?.toLowerCase() || '';
          
          // Map assignedShift values to turnos
          // "Diurno" -> Día
          // "Tarde" -> Tarde
          // "Nocturno" -> Noche
          // "Mixto" -> could be counted in multiple or none, for now we'll skip it
          
          if (shift.includes('diurno') || shift === 'día' || shift === 'dia' || shift === 'day' || shift === 'morning') {
            dayCount++;
          } else if (shift.includes('tarde') || shift === 'afternoon') {
            afternoonCount++;
          } else if (shift.includes('nocturno') || shift === 'noche' || shift === 'night') {
            nightCount++;
          }
          // "Mixto" is not counted in any specific shift
        });
    });

    return { day: dayCount, afternoon: afternoonCount, night: nightCount };
  }, [units]);

  useEffect(() => {
    setWorkersByShift(workersByShiftCount);
    setLoadingMetrics(false);
  }, [workersByShiftCount]);

  // Calculate reten coverages (all assignments in the month)
  useEffect(() => {
    const loadRetenMetrics = async () => {
      try {
        const { retenesService } = await import('../services/retenesService');
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        
        const startDate = firstDayOfMonth.toISOString().split('T')[0];
        const endDate = lastDayOfMonth.toISOString().split('T')[0];
        
        // Get all assignments in the month (not just completed ones)
        const assignments = await retenesService.getAssignmentsByDateRange(startDate, endDate);
        // Count all assignments, regardless of status
        setRetenCoverages(assignments.length);
      } catch (error) {
        console.error('Error loading reten metrics:', error);
      }
    };

    loadRetenMetrics();
  }, []);

  // Note: setLoadingMetrics(false) is now handled in loadShiftMetrics finally block

  // Calculate new workers this month
  const newWorkersCount = useMemo(() => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayStr = firstDayOfMonth.toISOString().split('T')[0];
    
    const newWorkers = units.reduce((count, unit) => {
      return count + unit.resources.filter(r => {
        if (r.type !== ResourceType.PERSONNEL || r.archived) return false;
        if (!r.startDate) return false;
        // Check if startDate is in current month
        const startDate = new Date(r.startDate);
        return startDate >= firstDayOfMonth && startDate <= today;
      }).length;
    }, 0);
    
    return newWorkers;
  }, [units]);

  useEffect(() => {
    setNewWorkersThisMonth(newWorkersCount);
  }, [newWorkersCount]);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 animate-in fade-in duration-500">
      <header className="mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Panel General de Operaciones</h1>
        <p className="text-sm md:text-base text-slate-500">Visión global del cumplimiento y estado de unidades.</p>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4">
          <div className="p-2 md:p-3 bg-blue-100 text-blue-600 rounded-lg shrink-0">
            <Building2 size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Unidades Totales</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{totalUnits}</p>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4">
          <div className="p-2 md:p-3 bg-green-100 text-green-600 rounded-lg shrink-0">
            <CheckCircle size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Unidades Operativas</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{activeUnits}</p>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4">
          <div className="p-2 md:p-3 bg-purple-100 text-purple-600 rounded-lg shrink-0">
            <Users size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Total Trabajadores</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{totalWorkers}</p>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4">
          <div className="p-2 md:p-3 bg-red-100 text-red-600 rounded-lg shrink-0">
            <AlertTriangle size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Con Incidencias</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{issueUnits}</p>
          </div>
        </div>
        
        {/* New Cards */}
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4">
          <div className="p-2 md:p-3 bg-yellow-100 text-yellow-600 rounded-lg shrink-0">
            <Sun size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Turno Día</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{loadingMetrics ? '...' : workersByShift.day}</p>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4">
          <div className="p-2 md:p-3 bg-orange-100 text-orange-600 rounded-lg shrink-0">
            <Clock size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Turno Tarde</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{loadingMetrics ? '...' : workersByShift.afternoon}</p>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4">
          <div className="p-2 md:p-3 bg-indigo-100 text-indigo-600 rounded-lg shrink-0">
            <Moon size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Turno Noche</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{loadingMetrics ? '...' : workersByShift.night}</p>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4">
          <div className="p-2 md:p-3 bg-teal-100 text-teal-600 rounded-lg shrink-0">
            <Shield size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Coberturas Retenes</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{loadingMetrics ? '...' : retenCoverages}</p>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4">
          <div className="p-2 md:p-3 bg-pink-100 text-pink-600 rounded-lg shrink-0">
            <UserPlus size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Nuevos este Mes</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{newWorkersThisMonth}</p>
          </div>
        </div>
      </div>

      {/* Charts Area */}
      {chartData.length > 0 ? (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4">Cumplimiento del Servicio (Mes Actual)</h3>
          <div className="h-64 md:h-80 w-full overflow-x-auto" style={{ minHeight: '256px', minWidth: '100%' }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={256}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 40, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                <Tooltip 
                  cursor={{fill: 'transparent'}}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={25} onClick={(data) => onSelectUnit(data.id)} className="cursor-pointer hover:opacity-80 transition-opacity">
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.score >= 95 ? '#22c55e' : entry.score >= 90 ? '#eab308' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] md:text-xs text-slate-400 mt-2 text-center">* Click en la barra para ver detalle de la unidad</p>
        </div>
      ) : (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4">Cumplimiento del Servicio</h3>
          <p className="text-sm md:text-base text-slate-500 text-center py-6 md:py-8">No hay datos de cumplimiento disponibles para mostrar.</p>
        </div>
      )}

      {/* Recent Activity Preview */}
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4">Últimas Actividades Críticas</h3>
        <div className="space-y-2 md:space-y-3">
          {units.flatMap(u => u.logs.map(l => ({...l, unitName: u.name}))).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3).map(log => (
            <div key={log.id} className="flex items-start space-x-2 md:space-x-3 p-2 md:p-3 hover:bg-slate-50 rounded-lg transition-colors">
               <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                 log.type === 'Incidencia' ? 'bg-red-500' : 
                 log.type === 'Supervision' ? 'bg-blue-500' : 'bg-slate-400'
               }`} />
               <div className="min-w-0 flex-1">
                 <p className="text-xs md:text-sm font-medium text-slate-800 truncate">{log.type} en <span className="font-bold">{log.unitName}</span></p>
                 <p className="text-xs md:text-sm text-slate-600 line-clamp-2">{log.description}</p>
                 <p className="text-[10px] md:text-xs text-slate-400 mt-1">{log.date} • {log.author}</p>
               </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};