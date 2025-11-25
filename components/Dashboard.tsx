import React from 'react';
import { Unit, UnitStatus } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Building2, Users, AlertTriangle, CheckCircle } from 'lucide-react';

interface DashboardProps {
  units: Unit[];
  onSelectUnit: (unitId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ units, onSelectUnit }) => {
  // Calculate aggregations
  const totalUnits = units.length;
  const activeUnits = units.filter(u => u.status === UnitStatus.ACTIVE).length;
  const issueUnits = units.filter(u => u.status === UnitStatus.ISSUE).length;
  
  const chartData = units.map(u => ({
    name: u.name.split(' ').slice(0, 2).join(' '), // Short name
    score: u.complianceHistory[u.complianceHistory.length - 1].score,
    id: u.id
  }));

  return (
    <div className="p-6 md:p-8 space-y-6 animate-in fade-in duration-500">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Panel General de Operaciones</h1>
        <p className="text-slate-500">Visión global del cumplimiento y estado de unidades.</p>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
            <Building2 size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Unidades Totales</p>
            <p className="text-2xl font-bold text-slate-800">{totalUnits}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-4">
          <div className="p-3 bg-green-100 text-green-600 rounded-lg">
            <CheckCircle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Unidades Operativas</p>
            <p className="text-2xl font-bold text-slate-800">{activeUnits}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-4">
          <div className="p-3 bg-red-100 text-red-600 rounded-lg">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Con Incidencias</p>
            <p className="text-2xl font-bold text-slate-800">{issueUnits}</p>
          </div>
        </div>
      </div>

      {/* Charts Area */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Cumplimiento del Servicio (Mes Actual)</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis dataKey="name" type="category" width={120} />
              <Tooltip 
                cursor={{fill: 'transparent'}}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={30} onClick={(data) => onSelectUnit(data.id)} className="cursor-pointer hover:opacity-80 transition-opacity">
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.score >= 95 ? '#22c55e' : entry.score >= 90 ? '#eab308' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-400 mt-2 text-center">* Click en la barra para ver detalle de la unidad</p>
      </div>

      {/* Recent Activity Preview */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Últimas Actividades Críticas</h3>
        <div className="space-y-3">
          {units.flatMap(u => u.logs.map(l => ({...l, unitName: u.name}))).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3).map(log => (
            <div key={log.id} className="flex items-start space-x-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
               <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                 log.type === 'Incidencia' ? 'bg-red-500' : 
                 log.type === 'Supervision' ? 'bg-blue-500' : 'bg-slate-400'
               }`} />
               <div>
                 <p className="text-sm font-medium text-slate-800">{log.type} en <span className="font-bold">{log.unitName}</span></p>
                 <p className="text-sm text-slate-600 line-clamp-1">{log.description}</p>
                 <p className="text-xs text-slate-400 mt-1">{log.date} • {log.author}</p>
               </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};