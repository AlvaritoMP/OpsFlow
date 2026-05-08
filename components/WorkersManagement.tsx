import React, { useState, useMemo } from 'react';
import { Search, Filter, Users, Building, UserCheck, Archive as ArchiveIcon, X, Download, RefreshCw } from 'lucide-react';
import { Unit, Resource, ResourceType, Client } from '../types';
import { getLaborRelationshipDisplayDates } from '../utils/laborRelationshipDates';
import { SafeImage } from './SafeImage';

interface WorkersManagementProps {
  units: Unit[];
  clients: Client[];
  onUpdateUnit?: (unit: Unit) => void;
}

interface WorkerWithUnit extends Resource {
  unitId: string;
  unitName: string;
  clientName: string;
}

export const WorkersManagement: React.FC<WorkersManagementProps> = ({ units, clients, onUpdateUnit }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'activo' | 'cesado' | 'archivado'>('all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [selectedWorker, setSelectedWorker] = useState<WorkerWithUnit | null>(null);
  const getWorkerInitial = (name?: string) => (name?.trim().charAt(0) || '?').toUpperCase();

  // Obtener todos los trabajadores de todas las unidades
  const allWorkers = useMemo(() => {
    const workers: WorkerWithUnit[] = [];
    
    units.forEach(unit => {
      const unitWorkers = unit.resources
        .filter(r => r.type === ResourceType.PERSONNEL)
        .map(worker => ({
          ...worker,
          unitId: unit.id,
          unitName: unit.name,
          clientName: unit.clientName || 'Sin cliente'
        }));
      
      workers.push(...unitWorkers);
    });
    
    return workers;
  }, [units]);

  // Filtrar trabajadores
  const filteredWorkers = useMemo(() => {
    let filtered = allWorkers;

    // Filtro por estado
    if (statusFilter !== 'all') {
      if (statusFilter === 'archivado') {
        filtered = filtered.filter(w => w.archived === true);
      } else if (statusFilter === 'cesado') {
        filtered = filtered.filter(w => w.personnelStatus === 'cesado' && !w.archived);
      } else if (statusFilter === 'activo') {
        filtered = filtered.filter(w => w.personnelStatus === 'activo' && !w.archived);
      }
    }

    // Filtro por unidad
    if (unitFilter !== 'all') {
      filtered = filtered.filter(w => w.unitId === unitFilter);
    }

    // Filtro por cliente
    if (clientFilter !== 'all') {
      filtered = filtered.filter(w => w.clientName === clientFilter);
    }

    // Búsqueda por texto
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(w => 
        w.name.toLowerCase().includes(query) ||
        (w.dni && w.dni.toLowerCase().includes(query)) ||
        (w.puesto && w.puesto.toLowerCase().includes(query)) ||
        w.unitName.toLowerCase().includes(query) ||
        w.clientName.toLowerCase().includes(query)
      );
    }

    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [allWorkers, statusFilter, unitFilter, clientFilter, searchQuery]);

  // Obtener lista única de unidades y clientes para los filtros
  const uniqueUnits = useMemo(() => {
    const unitMap = new Map<string, string>();
    units.forEach(unit => {
      unitMap.set(unit.id, unit.name);
    });
    return Array.from(unitMap.entries()).map(([id, name]) => ({ id, name }));
  }, [units]);

  const uniqueClients = useMemo(() => {
    const clientSet = new Set<string>();
    units.forEach(unit => {
      if (unit.clientName) {
        clientSet.add(unit.clientName);
      }
    });
    return Array.from(clientSet).sort();
  }, [units]);

  // Obtener estadísticas
  const stats = useMemo(() => {
    const total = allWorkers.length;
    const activos = allWorkers.filter(w => w.personnelStatus === 'activo' && !w.archived).length;
    const cesados = allWorkers.filter(w => w.personnelStatus === 'cesado' && !w.archived).length;
    const archivados = allWorkers.filter(w => w.archived === true).length;
    const sinEstado = allWorkers.filter(w => !w.personnelStatus && !w.archived).length;

    return { total, activos, cesados, archivados, sinEstado };
  }, [allWorkers]);

  // Exportar a Excel
  const handleExport = () => {
    const data = filteredWorkers.map(worker => ({
      ...(function () {
        const rel = getLaborRelationshipDisplayDates(worker, worker.contractHistory);
        return {
          'Fecha Inicio': rel.start ? new Date(rel.start).toLocaleDateString('es-ES') : '-',
          'Fecha Fin': rel.end ? new Date(rel.end).toLocaleDateString('es-ES') : '-',
        };
      })(),
      'Nombre': worker.name,
      'DNI': worker.dni || '-',
      'Puesto': worker.puesto || '-',
      'Unidad': worker.unitName,
      'Cliente': worker.clientName,
      'Estado': worker.archived ? 'Archivado' : (worker.personnelStatus === 'cesado' ? 'Cesado' : worker.personnelStatus === 'activo' ? 'Activo' : 'Sin estado'),
      'Zonas Asignadas': worker.assignedZones?.join(', ') || '-',
      'Turno': worker.assignedShift || '-'
    }));

    // Crear CSV
    const headers = Object.keys(data[0] || {});
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `trabajadores_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (worker: WorkerWithUnit) => {
    if (worker.archived) {
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800">Archivado</span>;
    }
    if (worker.personnelStatus === 'cesado') {
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">Cesado</span>;
    }
    if (worker.personnelStatus === 'activo') {
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Activo</span>;
    }
    return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">Sin estado</span>;
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 md:w-8 md:h-8" />
            Gestión Global de Trabajadores
          </h1>
          <p className="text-slate-600 mt-1">Revisa y gestiona todos los trabajadores del sistema</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border border-slate-200">
          <div className="text-sm text-slate-600">Total</div>
          <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-slate-200">
          <div className="text-sm text-slate-600">Activos</div>
          <div className="text-2xl font-bold text-green-600">{stats.activos}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-slate-200">
          <div className="text-sm text-slate-600">Cesados</div>
          <div className="text-2xl font-bold text-red-600">{stats.cesados}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-slate-200">
          <div className="text-sm text-slate-600">Archivados</div>
          <div className="text-2xl font-bold text-amber-600">{stats.archivados}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-slate-200">
          <div className="text-sm text-slate-600">Sin Estado</div>
          <div className="text-2xl font-bold text-gray-600">{stats.sinEstado}</div>
        </div>
      </div>

      {/* Filtros y Búsqueda */}
      <div className="bg-white p-4 rounded-lg shadow border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Búsqueda */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por nombre, DNI, puesto, unidad o cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Filtro por Estado */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Estado</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Todos</option>
              <option value="activo">Activos</option>
              <option value="cesado">Cesados</option>
              <option value="archivado">Archivados</option>
            </select>
          </div>

          {/* Filtro por Unidad */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Unidad</label>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Todas las unidades</option>
              {uniqueUnits.map(unit => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Cliente */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Cliente</label>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Todos los clientes</option>
              {uniqueClients.map(client => (
                <option key={client} value={client}>{client}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Botón limpiar filtros */}
        {(searchQuery || statusFilter !== 'all' || unitFilter !== 'all' || clientFilter !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setUnitFilter('all');
              setClientFilter('all');
            }}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Resultados */}
      <div className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              {filteredWorkers.length} trabajador{filteredWorkers.length !== 1 ? 'es' : ''} encontrado{filteredWorkers.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">DNI</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Puesto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Unidad</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredWorkers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No se encontraron trabajadores con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredWorkers.map(worker => (
                  <tr key={worker.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center">
                        {worker.image ? (
                          <SafeImage
                            src={worker.image}
                            alt={worker.name}
                            bucket="unit-images"
                            className="w-12 h-12 rounded-full object-cover mr-4 shrink-0 bg-slate-200"
                            fallback={
                              <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-base font-bold text-slate-600 mr-4 shrink-0">
                                {getWorkerInitial(worker.name)}
                              </div>
                            }
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-base font-bold text-slate-600 mr-4 shrink-0">
                            {getWorkerInitial(worker.name)}
                          </div>
                        )}
                        <span className="text-sm font-medium text-slate-900">{worker.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{worker.dni || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{worker.puesto || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{worker.unitName}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{worker.clientName}</td>
                    <td className="px-4 py-3">
                      {getStatusBadge(worker)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedWorker(worker)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Ver detalles
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalles */}
      {selectedWorker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Detalles del Trabajador</h2>
              <button
                onClick={() => setSelectedWorker(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Nombre</label>
                  <div className="text-sm text-slate-900">{selectedWorker.name}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">DNI</label>
                  <div className="text-sm text-slate-900">{selectedWorker.dni || '-'}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Puesto</label>
                  <div className="text-sm text-slate-900">{selectedWorker.puesto || '-'}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Estado</label>
                  <div>{getStatusBadge(selectedWorker)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Unidad</label>
                  <div className="text-sm text-slate-900">{selectedWorker.unitName}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Cliente</label>
                  <div className="text-sm text-slate-900">{selectedWorker.clientName}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Fecha de Inicio</label>
                  <div className="text-sm text-slate-900">
                    {(() => {
                      const rel = getLaborRelationshipDisplayDates(selectedWorker, selectedWorker.contractHistory);
                      return rel.start ? new Date(rel.start).toLocaleDateString('es-ES') : '-';
                    })()}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Fecha de Fin</label>
                  <div className="text-sm text-slate-900">
                    {(() => {
                      const rel = getLaborRelationshipDisplayDates(selectedWorker, selectedWorker.contractHistory);
                      return rel.end ? new Date(rel.end).toLocaleDateString('es-ES') : '-';
                    })()}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Zonas Asignadas</label>
                  <div className="text-sm text-slate-900">
                    {selectedWorker.assignedZones?.length ? selectedWorker.assignedZones.join(', ') : '-'}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Turno</label>
                  <div className="text-sm text-slate-900">{selectedWorker.assignedShift || '-'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
