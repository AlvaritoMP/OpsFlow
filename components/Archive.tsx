import React, { useState, useEffect } from 'react';
import { Unit, Resource, UserRole } from '../types';
import { resourcesService } from '../services/resourcesService';
import { unitsService } from '../services/unitsService';
import { Archive as ArchiveIcon, User, Building, Calendar, Mail, Phone, FileText, RefreshCw, ArrowRight, Search, X, CheckCircle, AlertCircle, Edit2, Download } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { checkPermission } from '../services/permissionService';
import { getLaborRelationshipDisplayDates } from '../utils/laborRelationshipDates';
import { filterOperationalUnits } from '../utils/unitStatus';
import { DateInput } from './DateInput';
import { excelService } from '../services/excelService';
import { formatDateDisplay } from '../utils/dateFormat';
import {
  TERMINATION_REASON_PRESETS,
  buildTerminationReason,
  isTerminationReasonComplete,
  splitTerminationReason,
} from '../utils/terminationReason';

interface ArchiveProps {
  currentUserRole?: UserRole;
  onRestoreWorker?: () => void; // Callback para refrescar unidades después de recuperar un trabajador
}

interface ArchivedPersonnel extends Resource {
  originalUnitId: string;
  originalUnitName: string;
}

export const Archive: React.FC<ArchiveProps> = ({ currentUserRole, onRestoreWorker }) => {
  const [archivedPersonnel, setArchivedPersonnel] = useState<ArchivedPersonnel[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPersonnel, setSelectedPersonnel] = useState<ArchivedPersonnel | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [restoring, setRestoring] = useState(false);
  
  // Estados para cambiar estado
  const [showChangeStatusModal, setShowChangeStatusModal] = useState(false);
  const [selectedPersonnelForStatusChange, setSelectedPersonnelForStatusChange] = useState<ArchivedPersonnel | null>(null);
  const [terminationType, setTerminationType] = useState<'cesado' | 'archivado'>('cesado');
  const [terminationDate, setTerminationDate] = useState<string>('');
  const [terminationReasonPreset, setTerminationReasonPreset] = useState('');
  const [terminationReasonOther, setTerminationReasonOther] = useState('');
  const [changingStatus, setChangingStatus] = useState(false);
  const [exporting, setExporting] = useState(false);

  const canView = checkPermission(currentUserRole || 'OPERATIONS', 'ARCHIVE', 'view');
  const canEdit = checkPermission(currentUserRole || 'OPERATIONS', 'ARCHIVE', 'edit');

  useEffect(() => {
    if (!canView) return;
    
    loadData();
  }, [canView]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [archived, allUnits] = await Promise.all([
        resourcesService.getAllArchivedPersonnel(),
        unitsService.getAll(),
      ]);
      setArchivedPersonnel(archived);
      setUnits(allUnits);
    } catch (error) {
      console.error('Error al cargar datos del archivo:', error);
      alert('Error al cargar los datos del archivo');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = (personnel: ArchivedPersonnel) => {
    setSelectedPersonnel(personnel);
    setSelectedUnitId(personnel.originalUnitId);
    setShowRestoreModal(true);
  };

  const handleConfirmRestore = async () => {
    if (!selectedPersonnel || !selectedUnitId) return;

    setRestoring(true);
    try {
      // Actualizar el recurso: desarchivar, cambiar estado a activo, y mover a la unidad seleccionada
      await resourcesService.update(
        selectedPersonnel.id,
        {
          archived: false,
          personnelStatus: 'activo',
          endDate: null, // Eliminar fecha de fin si existe (null se guarda en BD)
          terminationReason: null,
        },
        selectedUnitId // Nuevo unit_id
      );

      alert(`✅ ${selectedPersonnel.name} ha sido recuperado y asignado a la unidad seleccionada.`);
      setShowRestoreModal(false);
      setSelectedPersonnel(null);
      setSelectedUnitId('');
      await loadData(); // Recargar datos del archivo
      
      // Notificar al componente padre para refrescar las unidades
      // Esto asegura que el trabajador recuperado aparezca en su unidad
      if (onRestoreWorker) {
        onRestoreWorker();
      }
    } catch (error) {
      console.error('Error al recuperar trabajador:', error);
      alert('Error al recuperar el trabajador. Por favor, intente nuevamente.');
    } finally {
      setRestoring(false);
    }
  };

  const handleChangeStatus = (personnel: ArchivedPersonnel) => {
    setSelectedPersonnelForStatusChange(personnel);
    setTerminationType(personnel.personnelStatus === 'cesado' ? 'cesado' : 'archivado');
    setTerminationDate(personnel.endDate || new Date().toISOString().split('T')[0]);
    const split = splitTerminationReason(personnel.terminationReason);
    setTerminationReasonPreset(split.preset);
    setTerminationReasonOther(split.other);
    setShowChangeStatusModal(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!selectedPersonnelForStatusChange) return;
    if (!isTerminationReasonComplete(terminationReasonPreset, terminationReasonOther)) {
      alert('Indique el motivo del cese.');
      return;
    }

    setChangingStatus(true);
    try {
      const updateData: any = {
        personnelStatus: terminationType === 'cesado' ? 'cesado' : 'archivado',
        terminationReason: buildTerminationReason(terminationReasonPreset, terminationReasonOther),
      };
      
      if (terminationDate) {
        updateData.endDate = terminationDate;
      }
      
      await resourcesService.update(selectedPersonnelForStatusChange.id, updateData);
      
      alert(`✅ Estado de ${selectedPersonnelForStatusChange.name} actualizado a ${terminationType === 'cesado' ? 'Cesado' : 'Archivado'} correctamente.`);
      setShowChangeStatusModal(false);
      setSelectedPersonnelForStatusChange(null);
      setTerminationReasonPreset('');
      setTerminationReasonOther('');
      await loadData(); // Recargar datos
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      alert('Error al cambiar el estado del trabajador. Por favor, intente nuevamente.');
    } finally {
      setChangingStatus(false);
    }
  };

  const filteredPersonnel = archivedPersonnel.filter(personnel => {
    const searchLower = searchTerm.toLowerCase();
    return (
      personnel.name.toLowerCase().includes(searchLower) ||
      personnel.dni?.toLowerCase().includes(searchLower) ||
      personnel.puesto?.toLowerCase().includes(searchLower) ||
      personnel.originalUnitName.toLowerCase().includes(searchLower) ||
      personnel.terminationReason?.toLowerCase().includes(searchLower)
    );
  });

  const getPersonnelStatusLabel = (personnel: ArchivedPersonnel): string => {
    if (personnel.personnelStatus === 'cesado') return 'Cesado';
    if (personnel.personnelStatus === 'archivado' || personnel.archived) return 'Archivado';
    return 'Desconocido';
  };

  const handleExportToExcel = async () => {
    if (filteredPersonnel.length === 0) {
      alert('No hay trabajadores para exportar con los filtros actuales.');
      return;
    }

    setExporting(true);
    try {
      const headers = [
        'Trabajador',
        'DNI',
        'Puesto',
        'Unidad de Origen',
        'Fecha Inicio',
        'Fecha Fin',
        'Fecha de Cese',
        'Estado',
        'Motivo del Cese',
        'Fecha de Nacimiento',
      ];

      const data = filteredPersonnel.map((personnel) => {
        const dates = getLaborRelationshipDisplayDates(personnel, personnel.contractHistory);
        const endDate = dates.end ? formatDateDisplay(dates.end) : '';
        return {
          'Trabajador': personnel.name,
          'DNI': personnel.dni || '',
          'Puesto': personnel.puesto || '',
          'Unidad de Origen': personnel.originalUnitName || '',
          'Fecha Inicio': dates.start ? formatDateDisplay(dates.start) : '',
          'Fecha Fin': endDate,
          'Fecha de Cese': endDate,
          'Estado': getPersonnelStatusLabel(personnel),
          'Motivo del Cese': personnel.terminationReason || '',
          'Fecha de Nacimiento': personnel.birthDate ? formatDateDisplay(personnel.birthDate) : '',
        };
      });

      const filterSuffix = searchTerm.trim() ? '_filtrado' : '';
      const filename = `archivo_personal${filterSuffix}_${new Date().toISOString().split('T')[0]}.xlsx`;

      await excelService.exportToExcel(data, headers, {
        filename,
        sheetName: 'Archivo de Personal',
      });
    } catch (error) {
      console.error('Error al exportar archivo de personal a Excel:', error);
      alert('Error al exportar a Excel. Por favor, intente nuevamente.');
    } finally {
      setExporting(false);
    }
  };

  if (!canView) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">No tiene permisos para ver esta sección.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full p-6 bg-slate-50">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center mb-2">
          <ArchiveIcon className="mr-3" size={28} />
          Archivo de Personal
        </h1>
        <p className="text-slate-600">Trabajadores cesados o archivados</p>
      </div>

      {/* Barra de búsqueda y exportación */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nombre, DNI, puesto, unidad o motivo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleExportToExcel}
          disabled={loading || exporting || filteredPersonnel.length === 0}
          className="inline-flex items-center justify-center px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm whitespace-nowrap"
          title={searchTerm.trim()
            ? `Exportar a Excel los ${filteredPersonnel.length} trabajadores que coinciden con la búsqueda`
            : `Exportar a Excel los ${filteredPersonnel.length} trabajadores mostrados`}
        >
          {exporting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Exportando...
            </>
          ) : (
            <>
              <Download size={18} className="mr-2" />
              Exportar Excel{filteredPersonnel.length > 0 ? ` (${filteredPersonnel.length})` : ''}
            </>
          )}
        </button>
      </div>
      {!loading && archivedPersonnel.length > 0 && (
        <p className="mb-4 text-sm text-slate-500">
          {searchTerm.trim()
            ? `Mostrando ${filteredPersonnel.length} de ${archivedPersonnel.length} trabajadores. La exportación usará esta lista filtrada.`
            : `${archivedPersonnel.length} trabajador${archivedPersonnel.length !== 1 ? 'es' : ''} en archivo. La exportación incluirá todos los registros en pantalla.`}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mr-3"></div>
          <span className="text-slate-600">Cargando archivo...</span>
        </div>
      ) : filteredPersonnel.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <ArchiveIcon className="mx-auto mb-4 text-slate-300" size={64} />
          <p className="text-slate-500 text-lg">
            {searchTerm ? 'No se encontraron trabajadores que coincidan con la búsqueda' : 'No hay trabajadores archivados'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Trabajador</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">DNI</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Puesto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Unidad de Origen</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fechas</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fecha de Cese</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Motivo del Cese</th>
                  {canEdit && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredPersonnel.map((personnel) => (
                  <tr key={personnel.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-100 flex-shrink-0 mr-4">
                          <SafeImage
                            src={personnel.image}
                            alt={personnel.name}
                            className="w-full h-full object-cover"
                            bucket="unit-images"
                            fallback={
                              <div className="w-full h-full flex items-center justify-center font-bold text-slate-400 text-lg">
                                {personnel.name.charAt(0).toUpperCase()}
                              </div>
                            }
                          />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">{personnel.name}</div>
                          {personnel.birthDate && (
                            <div className="text-xs text-slate-500">
                              Cumpleaños: {formatDateDisplay(personnel.birthDate)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                      {personnel.dni || <span className="text-slate-300 italic">-</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {personnel.puesto || <span className="text-slate-300 italic">-</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-slate-600">
                        <Building className="mr-2" size={16} />
                        {personnel.originalUnitName}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                      {(() => {
                        const dates = getLaborRelationshipDisplayDates(personnel, personnel.contractHistory);
                        return (
                          <>
                            {dates.start && (
                              <div className="mb-1">
                                <span className="text-slate-400">Inicio:</span>{' '}
                                {formatDateDisplay(dates.start)}
                              </div>
                            )}
                            {dates.end && (
                              <div className="text-red-600">
                                <span className="text-slate-400">Fin:</span>{' '}
                                {formatDateDisplay(dates.end)}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                      {(() => {
                        const end = getLaborRelationshipDisplayDates(personnel, personnel.contractHistory).end;
                        return end ? (
                          <div className="text-red-600 font-medium">
                            {formatDateDisplay(end)}
                          </div>
                        ) : (
                          <span className="text-slate-300 italic">-</span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        getPersonnelStatusLabel(personnel) === 'Cesado'
                          ? 'bg-red-100 text-red-800'
                          : getPersonnelStatusLabel(personnel) === 'Archivado'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        {getPersonnelStatusLabel(personnel)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs">
                      {personnel.terminationReason ? (
                        <span className="line-clamp-2" title={personnel.terminationReason}>
                          {personnel.terminationReason}
                        </span>
                      ) : (
                        <span className="text-slate-300 italic">Sin motivo registrado</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleChangeStatus(personnel)}
                            className="text-blue-600 hover:text-blue-900 p-2 rounded hover:bg-blue-50 transition-colors"
                            title="Editar estado o motivo del cese"
                            disabled={changingStatus}
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleRestore(personnel)}
                            className="text-green-600 hover:text-green-900 p-2 rounded hover:bg-green-50 transition-colors"
                            title="Recuperar trabajador"
                            disabled={restoring}
                          >
                            <RefreshCw size={18} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal para recuperar trabajador */}
      {showRestoreModal && selectedPersonnel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800 flex items-center">
                  <RefreshCw className="mr-2" size={24} />
                  Recuperar Trabajador
                </h2>
                <button
                  onClick={() => {
                    setShowRestoreModal(false);
                    setSelectedPersonnel(null);
                    setSelectedUnitId('');
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <div className="flex items-center mb-4">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-100 flex-shrink-0 mr-4">
                    <SafeImage
                      src={selectedPersonnel.image}
                      alt={selectedPersonnel.name}
                      className="w-full h-full object-cover"
                      bucket="unit-images"
                      fallback={
                        <div className="w-full h-full flex items-center justify-center font-bold text-slate-400 text-lg">
                          {selectedPersonnel.name.charAt(0).toUpperCase()}
                        </div>
                      }
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{selectedPersonnel.name}</h3>
                    <p className="text-sm text-slate-600">{selectedPersonnel.puesto || 'Sin puesto'}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      <Building className="inline mr-1" size={12} />
                      Unidad de origen: {selectedPersonnel.originalUnitName}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-bold text-slate-700 mb-3">Información del Trabajador</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {selectedPersonnel.dni && (
                      <div>
                        <span className="text-slate-500">DNI:</span>{' '}
                        <span className="font-mono font-medium">{selectedPersonnel.dni}</span>
                      </div>
                    )}
                    {selectedPersonnel.birthDate && (
                      <div>
                        <span className="text-slate-500">Cumpleaños:</span>{' '}
                        <span className="font-medium">
                          {formatDateDisplay(selectedPersonnel.birthDate)}
                        </span>
                      </div>
                    )}
                    {getLaborRelationshipDisplayDates(selectedPersonnel, selectedPersonnel.contractHistory).start && (
                      <div>
                        <span className="text-slate-500">Inicio:</span>{' '}
                        <span className="font-medium">
                          {formatDateDisplay(getLaborRelationshipDisplayDates(selectedPersonnel, selectedPersonnel.contractHistory).start)}
                        </span>
                      </div>
                    )}
                    {getLaborRelationshipDisplayDates(selectedPersonnel, selectedPersonnel.contractHistory).end && (
                      <div>
                        <span className="text-slate-500">Fin:</span>{' '}
                        <span className="font-medium text-red-600">
                          {formatDateDisplay(getLaborRelationshipDisplayDates(selectedPersonnel, selectedPersonnel.contractHistory).end)}
                        </span>
                      </div>
                    )}
                    {selectedPersonnel.terminationReason && (
                      <div className="col-span-2">
                        <span className="text-slate-500">Motivo:</span>{' '}
                        <span className="font-medium">{selectedPersonnel.terminationReason}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Asignar a Unidad:
                  </label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">Seleccione una unidad...</option>
                    {filterOperationalUnits(units).map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name} {unit.id === selectedPersonnel.originalUnitId && '(Unidad de origen)'}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-2">
                    El trabajador será reactivado y asignado a la unidad seleccionada. No se listan unidades desactivadas.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowRestoreModal(false);
                    setSelectedPersonnel(null);
                    setSelectedUnitId('');
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                  disabled={restoring}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmRestore}
                  disabled={!selectedUnitId || restoring}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {restoring ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Recuperando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2" size={18} />
                      Recuperar Trabajador
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para cambiar estado */}
      {showChangeStatusModal && selectedPersonnelForStatusChange && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800 flex items-center">
                  <Edit2 className="mr-2" size={24} />
                  Cambiar Estado
                </h2>
                <button
                  onClick={() => {
                    setShowChangeStatusModal(false);
                    setSelectedPersonnelForStatusChange(null);
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-slate-600 mb-4">
                  Cambiar estado o motivo de <strong>{selectedPersonnelForStatusChange.name}</strong> (actualmente: {selectedPersonnelForStatusChange.personnelStatus === 'cesado' ? 'Cesado' : 'Archivado'}).
                </p>
                
                <div className="space-y-3 mb-4">
                  <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="radio"
                      name="terminationType"
                      value="cesado"
                      checked={terminationType === 'cesado'}
                      onChange={(e) => setTerminationType(e.target.value as 'cesado' | 'archivado')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-slate-800">Cesado</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Se decidió sacar al trabajador (despido/terminación de relación laboral)
                      </div>
                    </div>
                  </label>
                  
                  <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="radio"
                      name="terminationType"
                      value="archivado"
                      checked={terminationType === 'archivado'}
                      onChange={(e) => setTerminationType(e.target.value as 'cesado' | 'archivado')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-slate-800">Archivado</div>
                      <div className="text-xs text-slate-500 mt-1">
                        El contrato se terminó naturalmente (fin de contrato)
                      </div>
                    </div>
                  </label>
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Fecha de cese *
                  </label>
                  <DateInput
                    value={terminationDate}
                    onChange={setTerminationDate}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Motivo del cese *
                  </label>
                  <select
                    value={terminationReasonPreset}
                    onChange={(e) => {
                      setTerminationReasonPreset(e.target.value);
                      if (e.target.value !== 'Otro') setTerminationReasonOther('');
                    }}
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Seleccione un motivo...</option>
                    {TERMINATION_REASON_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>{preset}</option>
                    ))}
                  </select>
                  {terminationReasonPreset === 'Otro' && (
                    <textarea
                      value={terminationReasonOther}
                      onChange={(e) => setTerminationReasonOther(e.target.value)}
                      placeholder="Indique el motivo..."
                      rows={2}
                      className="mt-2 w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowChangeStatusModal(false);
                    setSelectedPersonnelForStatusChange(null);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                  disabled={changingStatus}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmStatusChange}
                  disabled={!terminationDate || changingStatus || !isTerminationReasonComplete(terminationReasonPreset, terminationReasonOther)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    terminationType === 'cesado'
                      ? 'bg-orange-600 text-white hover:bg-orange-700'
                      : 'bg-amber-600 text-white hover:bg-amber-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {changingStatus ? 'Procesando...' : `Confirmar ${terminationType === 'cesado' ? 'Cese' : 'Archivo'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
