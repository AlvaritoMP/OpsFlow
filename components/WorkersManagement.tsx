import React, { useState, useMemo } from 'react';
import { Search, Filter, Users, Building, UserCheck, Archive as ArchiveIcon, X, Download, RefreshCw, FileDown } from 'lucide-react';
import { Unit, Resource, ResourceType, Client } from '../types';
import { getLaborRelationshipDisplayDates } from '../utils/laborRelationshipDates';
import { formatDateDisplay } from '../utils/dateFormat';
import { downloadOpaloPersonnelFicha } from '../utils/generateOpaloPersonnelFichaPdf';
import { SafeImage } from './SafeImage';
import { DateInput } from './DateInput';

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

type SortBy = 'name' | 'ingreso-desc' | 'ingreso-asc';
type DatePreset = '7d' | '30d' | 'month' | null;

const toIsoLocal = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getWorkerIngresoDate = (worker: Pick<Resource, 'startDate' | 'endDate' | 'contractHistory'>): string | undefined => {
  return getLaborRelationshipDisplayDates(worker, worker.contractHistory).start?.slice(0, 10);
};

export const WorkersManagement: React.FC<WorkersManagementProps> = ({ units, clients, onUpdateUnit }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'activo' | 'cesado' | 'archivado'>('all');
  const [unitFilter, setUnitFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [ingresoFrom, setIngresoFrom] = useState('');
  const [ingresoTo, setIngresoTo] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [datePreset, setDatePreset] = useState<DatePreset>(null);
  const [selectedWorker, setSelectedWorker] = useState<WorkerWithUnit | null>(null);
  const [downloadingFichaId, setDownloadingFichaId] = useState<string | null>(null);
  const getWorkerInitial = (name?: string) => (name?.trim().charAt(0) || '?').toUpperCase();

  const applyRecentPreset = (preset: Exclude<DatePreset, null>) => {
    const today = new Date();
    const to = toIsoLocal(today);
    let from: string;
    if (preset === 'month') {
      from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    } else {
      const days = preset === '7d' ? 7 : 30;
      const start = new Date(today);
      start.setDate(start.getDate() - (days - 1));
      from = toIsoLocal(start);
    }
    setIngresoFrom(from);
    setIngresoTo(to);
    setStatusFilter('activo');
    setSortBy('ingreso-desc');
    setDatePreset(preset);
  };

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
        (w.phone && w.phone.toLowerCase().includes(query)) ||
        (w.email && w.email.toLowerCase().includes(query)) ||
        (w.localidad && w.localidad.toLowerCase().includes(query)) ||
        w.unitName.toLowerCase().includes(query) ||
        w.clientName.toLowerCase().includes(query)
      );
    }

    // Filtro por fecha de ingreso
    if (ingresoFrom || ingresoTo) {
      filtered = filtered.filter(w => {
        const ingreso = getWorkerIngresoDate(w);
        if (!ingreso) return false;
        if (ingresoFrom && ingreso < ingresoFrom) return false;
        if (ingresoTo && ingreso > ingresoTo) return false;
        return true;
      });
    }

    return filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'es');
      }
      const aDate = getWorkerIngresoDate(a) || '';
      const bDate = getWorkerIngresoDate(b) || '';
      if (!aDate && !bDate) return a.name.localeCompare(b.name, 'es');
      if (!aDate) return 1;
      if (!bDate) return -1;
      const cmp = aDate.localeCompare(bDate);
      if (cmp !== 0) return sortBy === 'ingreso-desc' ? -cmp : cmp;
      return a.name.localeCompare(b.name, 'es');
    });
  }, [allWorkers, statusFilter, unitFilter, clientFilter, searchQuery, ingresoFrom, ingresoTo, sortBy]);

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
          'Fecha Ingreso': rel.start ? formatDateDisplay(rel.start) : '-',
          'Fecha Fin': rel.end ? formatDateDisplay(rel.end) : '-',
        };
      })(),
      'Nombre': worker.name,
      'DNI': worker.dni || '-',
      'Puesto': worker.puesto || '-',
      'Teléfono': worker.phone || '-',
      'Correo': worker.email || '-',
      'Localidad': worker.localidad || '-',
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

  const handleDownloadFicha = async (worker: WorkerWithUnit) => {
    if (downloadingFichaId) return;
    setDownloadingFichaId(worker.id);
    try {
      await downloadOpaloPersonnelFicha(worker, {
        unitName: worker.unitName,
        clientName: worker.clientName,
      });
    } catch (err) {
      console.error('Error al generar Ficha Opalo:', err);
      alert('No se pudo generar la Ficha de Personal. Intente nuevamente.');
    } finally {
      setDownloadingFichaId(null);
    }
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
              placeholder="Buscar por nombre, DNI, puesto, teléfono, unidad o cliente..."
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ingreso desde</label>
            <DateInput
              value={ingresoFrom}
              onChange={(v) => {
                setIngresoFrom(v);
                setDatePreset(null);
              }}
              max={ingresoTo || undefined}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ingreso hasta</label>
            <DateInput
              value={ingresoTo}
              onChange={(v) => {
                setIngresoTo(v);
                setDatePreset(null);
              }}
              min={ingresoFrom || undefined}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ordenar por</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="name">Nombre A-Z</option>
              <option value="ingreso-desc">Ingreso más reciente</option>
              <option value="ingreso-asc">Ingreso más antiguo</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600 mr-1">Activados recientes:</span>
          <button
            type="button"
            onClick={() => applyRecentPreset('7d')}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              datePreset === '7d'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            Últimos 7 días
          </button>
          <button
            type="button"
            onClick={() => applyRecentPreset('30d')}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              datePreset === '30d'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            Últimos 30 días
          </button>
          <button
            type="button"
            onClick={() => applyRecentPreset('month')}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              datePreset === 'month'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            Este mes
          </button>
        </div>

        {/* Botón limpiar filtros */}
        {(searchQuery || statusFilter !== 'all' || unitFilter !== 'all' || clientFilter !== 'all' || ingresoFrom || ingresoTo || sortBy !== 'name') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setUnitFilter('all');
              setClientFilter('all');
              setIngresoFrom('');
              setIngresoTo('');
              setSortBy('name');
              setDatePreset(null);
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
              {sortBy === 'ingreso-desc' ? ' · más recientes primero' : sortBy === 'ingreso-asc' ? ' · más antiguos primero' : ''}
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Teléfono</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Correo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Unidad</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Ingreso</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredWorkers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
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
                            className="w-16 h-16 rounded-full object-cover mr-4 shrink-0 bg-slate-200"
                            fallback={
                              <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-lg font-bold text-slate-600 mr-4 shrink-0">
                                {getWorkerInitial(worker.name)}
                              </div>
                            }
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-lg font-bold text-slate-600 mr-4 shrink-0">
                            {getWorkerInitial(worker.name)}
                          </div>
                        )}
                        <span className="text-sm font-medium text-slate-900">{worker.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{worker.dni || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{worker.puesto || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">{worker.phone || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 break-all">{worker.email || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{worker.unitName}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{worker.clientName}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      {formatDateDisplay(getWorkerIngresoDate(worker)) || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(worker)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedWorker(worker)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Ver detalles
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDownloadFicha(worker)}
                          disabled={downloadingFichaId === worker.id}
                          className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 text-sm font-medium disabled:opacity-50"
                          title="Descargar Ficha de Personal Opalo"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          {downloadingFichaId === worker.id ? 'Generando…' : 'Ficha PDF'}
                        </button>
                      </div>
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
            <div className="p-6 border-b border-slate-200 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-slate-900">Detalles del Trabajador</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownloadFicha(selectedWorker)}
                  disabled={downloadingFichaId === selectedWorker.id}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  <FileDown className="w-4 h-4" />
                  {downloadingFichaId === selectedWorker.id ? 'Generando…' : 'Descargar Ficha Opalo'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedWorker(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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
                  <label className="text-sm font-medium text-slate-700">Teléfono</label>
                  <div className="text-sm text-slate-900 font-mono">{selectedWorker.phone || '-'}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Correo electrónico</label>
                  <div className="text-sm text-slate-900 break-all">
                    {selectedWorker.email ? (
                      <a href={`mailto:${selectedWorker.email}`} className="text-blue-600 hover:underline">
                        {selectedWorker.email}
                      </a>
                    ) : (
                      '-'
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Localidad</label>
                  <div className="text-sm text-slate-900">{selectedWorker.localidad || '-'}</div>
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
                    {formatDateDisplay(getLaborRelationshipDisplayDates(selectedWorker, selectedWorker.contractHistory).start) || '-'}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Fecha de Fin</label>
                  <div className="text-sm text-slate-900">
                    {formatDateDisplay(getLaborRelationshipDisplayDates(selectedWorker, selectedWorker.contractHistory).end) || '-'}
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
