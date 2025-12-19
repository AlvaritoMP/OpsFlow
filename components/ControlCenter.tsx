
import React, { useState, useMemo, useEffect } from 'react';
import { Unit, OperationalLog, MaintenanceRecord, Training, ResourceType, ManagementStaff, UserRole } from '../types';
import { Calendar as CalendarIcon, List, Search, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Wrench, GraduationCap, Edit2, X, Save, Plus, UserCheck, Camera, Image as ImageIcon, Trash2 } from 'lucide-react';
import { checkPermission } from '../services/permissionService';
import { SafeImage } from './SafeImage';

interface ControlCenterProps {
  units: Unit[];
  managementStaff: ManagementStaff[];
  onUpdateUnit: (unit: Unit) => void;
  currentUserRole: UserRole; // Passed from parent
}

// Unified Event Interface for internal use
interface GlobalEvent {
  id: string;
  unitId: string;
  unitName: string;
  date: string; // YYYY-MM-DD
  category: 'Log' | 'Maintenance' | 'Training' | 'ContractAlert';
  type: string; // Subtype (e.g., 'Incidencia', 'Preventivo')
  description: string;
  status?: string;
  resourceName?: string; // For maintenance/training
  originalRef: any; // Reference to the original object to allow updating
}

// Interface for contract generation alerts
interface ContractAlert {
  id: string;
  unitId: string;
  unitName: string;
  resourceId: string;
  resourceName: string;
  trainingStartDate: string;
  daysInTraining: number;
  contractGenerated: boolean;
}

export const ControlCenter: React.FC<ControlCenterProps> = ({ units, managementStaff, onUpdateUnit, currentUserRole }) => {
  const [filterUnit, setFilterUnit] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());

  // Quick Edit State
  const [editingEvent, setEditingEvent] = useState<GlobalEvent | null>(null);
  const [editForm, setEditForm] = useState({ 
    description: '', 
    status: '', 
    date: '', 
    type: '',
    authorOrTechnician: '',
    responsibleIds: [] as string[],
    score: 0,
    images: [] as string[]
  });
  const [newImageUrl, setNewImageUrl] = useState('');

  // Recalculate these values on every render to ensure they update when currentUserRole changes
  const canEdit = useMemo(() => checkPermission(currentUserRole, 'CONTROL_CENTER', 'edit'), [currentUserRole]);
  const canViewControlCenter = useMemo(() => checkPermission(currentUserRole, 'CONTROL_CENTER', 'view'), [currentUserRole]);
  const isOperationsUser = useMemo(() => currentUserRole === 'OPERATIONS' || currentUserRole === 'OPERATIONS_SUPERVISOR' || currentUserRole === 'ADMIN' || currentUserRole === 'SUPER_ADMIN', [currentUserRole]);
  // Calculate isClient directly from currentUserRole to ensure it's always up-to-date
  const isClient = currentUserRole === 'CLIENT';
  
  // Force re-render when currentUserRole changes to ensure UI updates correctly
  useEffect(() => {
    // This effect ensures the component re-renders when currentUserRole changes
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 ControlCenter - currentUserRole changed:', currentUserRole, 'isClient:', isClient);
    }
  }, [currentUserRole, isClient]);
  
  // Tooltip state for event details
  const [hoveredEvent, setHoveredEvent] = useState<GlobalEvent | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  
  // State for day events modal
  const [selectedDayEvents, setSelectedDayEvents] = useState<{ date: string; events: GlobalEvent[] } | null>(null);

  // --- Data Aggregation ---
  const allEvents = useMemo(() => {
    let events: GlobalEvent[] = [];

    units.forEach(unit => {
      // 1. Logs
      unit.logs.forEach(log => {
        events.push({
          id: log.id,
          unitId: unit.id,
          unitName: unit.name,
          date: log.date,
          category: 'Log',
          type: log.type,
          description: log.description,
          status: 'Registrado',
          originalRef: log
        });
      });

      // 2. Resources (Maintenance & Training)
      unit.resources.forEach(res => {
        // Maintenance
        if (res.maintenanceHistory) {
          res.maintenanceHistory.forEach(maint => {
            events.push({
              id: maint.id,
              unitId: unit.id,
              unitName: unit.name,
              date: maint.date,
              category: 'Maintenance',
              type: maint.type,
              description: maint.description,
              status: maint.status,
              resourceName: res.name,
              originalRef: maint
            });
          });
          // Future maintenance
          if (res.nextMaintenance) {
             events.push({
                id: `future-${res.id}`,
                unitId: unit.id,
                unitName: unit.name,
                date: res.nextMaintenance,
                category: 'Maintenance',
                type: 'Programado',
                description: `Mantenimiento Programado: ${res.name}`,
                status: 'Pendiente',
                resourceName: res.name,
                originalRef: res 
             });
          }
        }

        // Training
        if (res.trainings) {
          res.trainings.forEach(train => {
            events.push({
              id: train.id,
              unitId: unit.id,
              unitName: unit.name,
              date: train.date,
              category: 'Training',
              type: 'Capacitación',
              description: train.topic,
              status: train.status,
              resourceName: res.name,
              originalRef: train
            });
          });
        }
      });
    });

    // Add contract alerts as events (only for operations users)
    if (isOperationsUser) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      units.forEach(unit => {
        unit.resources.forEach(resource => {
          if (resource.type === ResourceType.PERSONNEL && 
              resource.inTraining && 
              resource.trainingStartDate && 
              !resource.contractGenerated) {
            
            const startDate = new Date(resource.trainingStartDate);
            startDate.setHours(0, 0, 0, 0);
            const daysDiff = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysDiff >= 3) {
              // Calcular la fecha que cumplió 3 días (fecha de inicio + 3 días)
              const alertDate = new Date(startDate);
              alertDate.setDate(alertDate.getDate() + 3);
              const alertDateStr = alertDate.toISOString().split('T')[0];
              
              events.push({
                id: `contract-alert-${resource.id}`,
                unitId: unit.id,
                unitName: unit.name,
                date: alertDateStr, // Fecha que cumplió 3 días, no la fecha de inicio
                category: 'ContractAlert',
                type: 'Alerta de Contrato',
                description: `${resource.name} completó ${daysDiff} días de capacitación. Se requiere generar contrato de trabajo.`,
                status: 'Pendiente',
                resourceName: resource.name,
                originalRef: { resource, unit, daysDiff }
              });
            }
          }
        });
      });
    }

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [units, isOperationsUser]);

  // --- Filtering ---
  const filteredEvents = useMemo(() => {
    return allEvents.filter(ev => {
      const matchesUnit = filterUnit === 'all' || ev.unitId === filterUnit;
      const matchesCategory = filterCategory === 'all' || ev.category === filterCategory;
      const matchesSearch = ev.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            ev.unitName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            ev.type.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesUnit && matchesCategory && matchesSearch;
    });
  }, [allEvents, filterUnit, filterCategory, searchTerm]);

  // --- Handlers ---
  const handleEditClick = (event: GlobalEvent) => {
    setEditingEvent(event);
    const ref = event.originalRef;
    
    // Always load responsibles and images if they exist on the ref object
    const responsibleIds = ref.responsibleIds || [];
    const images = ref.images || [];

    setEditForm({
      description: event.description,
      status: event.status || '',
      date: event.date,
      type: event.type,
      authorOrTechnician: event.category === 'Log' ? ref.author : (event.category === 'Maintenance' && !event.id.startsWith('future') ? ref.technician : ''),
      responsibleIds: responsibleIds,
      score: event.category === 'Training' ? (ref.score || 0) : 0,
      images: images
    });
  };

  const handleDeleteEvent = (event: GlobalEvent) => {
    if (!confirm('¿Estás seguro de eliminar este registro permanentemente?')) return;

    const unitIndex = units.findIndex(u => u.id === event.unitId);
    if (unitIndex === -1) return;
    
    const updatedUnit = { ...units[unitIndex] };

    if (event.category === 'Log') {
        updatedUnit.logs = updatedUnit.logs.filter(l => l.id !== event.id);
    } else if (event.category === 'Maintenance' && !event.id.startsWith('future')) {
        updatedUnit.resources = updatedUnit.resources.map(res => {
            if (res.maintenanceHistory) {
                return {
                    ...res,
                    maintenanceHistory: res.maintenanceHistory.filter(m => m.id !== event.id)
                };
            }
            return res;
        });
    } else if (event.category === 'Training') {
        updatedUnit.resources = updatedUnit.resources.map(res => {
            if (res.trainings) {
                return {
                    ...res,
                    trainings: res.trainings.filter(t => t.id !== event.id)
                };
            }
            return res;
        });
    }

    onUpdateUnit(updatedUnit);
    if (editingEvent?.id === event.id) setEditingEvent(null);
  };

  const toggleResponsible = (id: string) => {
      const current = editForm.responsibleIds || [];
      if (current.includes(id)) {
          setEditForm({...editForm, responsibleIds: current.filter(rid => rid !== id)});
      } else {
          setEditForm({...editForm, responsibleIds: [...current, id]});
      }
  };

  const handleAddImage = () => {
    if (!newImageUrl) return;
    setEditForm({...editForm, images: [...editForm.images, newImageUrl]});
    setNewImageUrl('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const imageUrl = URL.createObjectURL(file);
        setEditForm({...editForm, images: [...editForm.images, imageUrl]});
    }
  };

  const handleRemoveImage = (index: number) => {
    setEditForm({...editForm, images: editForm.images.filter((_, i) => i !== index)});
  };

  const handleResolveContractAlert = async (event: GlobalEvent) => {
    if (!event.originalRef?.resource) return;
    
    const unitIndex = units.findIndex(u => u.id === event.unitId);
    if (unitIndex === -1) return;
    
    const updatedUnit = { ...units[unitIndex] };
    const resourceId = event.originalRef.resource.id;
    
    // Update the resource to mark contract as generated
    updatedUnit.resources = updatedUnit.resources.map(res => {
      if (res.id === resourceId) {
        return { ...res, contractGenerated: true };
      }
      return res;
    });
    
    // Save to database
    try {
      const { resourcesService } = await import('../services/resourcesService');
      const resource = updatedUnit.resources.find(r => r.id === resourceId);
      if (resource) {
        await resourcesService.update(resourceId, { contractGenerated: true });
      }
    } catch (error) {
      console.error('Error al actualizar recurso:', error);
      alert('Error al guardar. Por favor, intente nuevamente.');
      return;
    }
    
    onUpdateUnit(updatedUnit);
    setEditingEvent(null);
    alert('Alerta resuelta. El contrato ha sido marcado como generado.');
  };

  const handleSaveEdit = () => {
    if (!editingEvent) return;

    // Handle contract alert resolution
    if (editingEvent.category === 'ContractAlert') {
      handleResolveContractAlert(editingEvent);
      return;
    }

    const unitIndex = units.findIndex(u => u.id === editingEvent.unitId);
    if (unitIndex === -1) return;
    
    const updatedUnit = { ...units[unitIndex] };

    if (editingEvent.category === 'Log') {
       updatedUnit.logs = updatedUnit.logs.map(l => {
          if (l.id === editingEvent.id) {
              return {
                  ...l,
                  date: editForm.date,
                  type: editForm.type as any,
                  description: editForm.description,
                  author: editForm.authorOrTechnician,
                  responsibleIds: editForm.responsibleIds,
                  images: editForm.images
              };
          }
          return l;
       });

    } else if (editingEvent.category === 'Training') {
       updatedUnit.resources = updatedUnit.resources.map(res => {
          if (!res.trainings) return res;
          const hasTraining = res.trainings.some(t => t.id === editingEvent.id);
          if (!hasTraining) return res;

          return {
              ...res,
              trainings: res.trainings.map(t => 
                 t.id === editingEvent.id ? { 
                     ...t, 
                     topic: editForm.description, 
                     status: editForm.status as any, 
                     date: editForm.date,
                     score: editForm.score || undefined
                 } : t
              )
          };
       });

    } else if (editingEvent.category === 'Maintenance') {
       if (editingEvent.id.startsWith('future-')) {
          updatedUnit.resources = updatedUnit.resources.map(res => 
             res.id === editingEvent.originalRef.id ? { ...res, nextMaintenance: editForm.date } : res
          );
       } else {
          updatedUnit.resources = updatedUnit.resources.map(res => {
             if (!res.maintenanceHistory) return res;
             const hasRecord = res.maintenanceHistory.some(m => m.id === editingEvent.id);
             if (!hasRecord) return res;

             return {
                 ...res,
                 maintenanceHistory: res.maintenanceHistory.map(m => 
                    m.id === editingEvent.id ? { 
                        ...m, 
                        date: editForm.date,
                        type: editForm.type as any,
                        description: editForm.description,
                        technician: editForm.authorOrTechnician,
                        status: editForm.status as any,
                        responsibleIds: editForm.responsibleIds,
                        images: editForm.images
                    } : m
                 )
             };
          });
       }
    }

    onUpdateUnit(updatedUnit);
    setEditingEvent(null);
    alert('Cambios guardados exitosamente.');
  };

  // --- Calendar Logic ---
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun
    return { days, firstDay, year, month };
  };

  const changeMonth = (delta: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentDate(newDate);
  };

  const getStatusColor = (status?: string) => {
     if (!status) return 'bg-gray-100 text-gray-600';
     const s = status.toLowerCase();
     if (s.includes('ok') || s.includes('completado') || s.includes('realizado')) return 'bg-green-100 text-green-700';
     if (s.includes('pendiente') || s.includes('programado')) return 'bg-blue-100 text-blue-700';
     if (s.includes('incidencia') || s.includes('reparacion')) return 'bg-red-100 text-red-700';
     return 'bg-gray-100 text-gray-600';
  }

  const getUnitPersonnel = (unitId: string) => {
      const unit = units.find(u => u.id === unitId);
      return unit ? unit.resources.filter(r => r.type === ResourceType.PERSONNEL) : [];
  };

  const renderCalendar = () => {
    const { days, firstDay, year, month } = getDaysInMonth(currentDate);
    const monthEvents = filteredEvents.filter(ev => {
      const d = new Date(ev.date + 'T00:00:00'); 
      return d.getMonth() === month && d.getFullYear() === year;
    });

    const blanks = Array(firstDay).fill(null);
    const daySlots = Array.from({ length: days }, (_, i) => i + 1);
    
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-fit">
         <div className="flex justify-between items-center p-2 md:p-4 border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
            <button onClick={() => changeMonth(-1)} className="p-1.5 md:p-2 hover:bg-slate-200 rounded-full"><ChevronLeft size={16} className="md:w-5 md:h-5"/></button>
            <h3 className="font-bold text-sm md:text-lg text-slate-800 capitalize text-center px-2">
              {currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            </h3>
            <button onClick={() => changeMonth(1)} className="p-1.5 md:p-2 hover:bg-slate-200 rounded-full"><ChevronRight size={16} className="md:w-5 md:h-5"/></button>
         </div>

         <div className="grid grid-cols-7 text-center bg-slate-100 border-b border-slate-200 text-[10px] md:text-xs font-semibold text-slate-500 py-1.5 md:py-2">
            <div>Dom</div><div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div>
         </div>

         <div className="grid grid-cols-7 auto-rows-fr">
            {blanks.map((_, i) => <div key={`blank-${i}`} className={`${isClient ? 'h-24 md:h-32' : 'h-16 md:h-24'} bg-slate-50/50 border-b border-r border-slate-100`}></div>)}
            {daySlots.map(day => {
               const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
               const dayEvents = monthEvents.filter(ev => ev.date === dateStr);
               const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
               
               return (
                  <div key={day} className={`${isClient ? 'min-h-[6rem] md:min-h-[8rem]' : 'min-h-[4rem] md:min-h-[6rem]'} border-b border-r border-slate-100 p-0.5 md:p-1 relative group hover:bg-slate-50 transition-colors ${isToday ? 'bg-blue-50/30' : ''}`}>
                     <span className={`text-[10px] md:text-xs font-medium ml-0.5 md:ml-1 ${isToday ? 'bg-blue-600 text-white px-1 md:px-1.5 rounded-full' : 'text-slate-700'}`}>{day}</span>
                     <div className={`mt-0.5 md:mt-1 space-y-0.5 md:space-y-1 overflow-y-auto ${isClient ? 'max-h-20 md:max-h-28' : 'max-h-12 md:max-h-20'} custom-scrollbar`}>
                        {dayEvents.slice(0, isClient ? 2 : 3).map(ev => (
                           <div 
                              key={ev.id} 
                              onClick={() => canEdit && handleEditClick(ev)}
                              onMouseEnter={(e) => {
                                if (isClient) {
                                  setHoveredEvent(ev);
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.top });
                                }
                              }}
                              onMouseLeave={() => {
                                if (isClient) {
                                  setHoveredEvent(null);
                                }
                              }}
                              className={`${isClient ? 'text-[10px] md:text-xs px-1 md:px-1.5 py-1 md:py-1.5' : 'text-[8px] md:text-[9px] px-0.5 md:px-1 py-0.5'} rounded border ${canEdit ? 'cursor-pointer' : 'cursor-default'} ${isClient ? '' : 'truncate'} shadow-sm hover:opacity-80 transition-opacity
                                ${ev.category === 'Log' && ev.type === 'Incidencia' ? 'bg-red-100 text-red-700 border-red-200' : 
                                  ev.category === 'Log' ? 'bg-gray-100 text-gray-700 border-gray-200' :
                                  ev.category === 'Maintenance' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                  'bg-blue-100 text-blue-700 border-blue-200'
                                }`}
                              title={!isClient ? `${ev.unitName}: ${ev.description}` : undefined}
                           >
                              {ev.type === 'Incidencia' && <AlertTriangle size={isClient ? 10 : 6} className={`inline mr-0.5 ${isClient ? 'md:w-3 md:h-3' : 'md:w-2 md:h-2'}`}/>}
                              {isClient ? (
                                <>
                                  <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                                    <span className="text-[9px] md:text-[10px] font-bold text-slate-800 truncate">{ev.unitName}</span>
                                    <span className="text-[8px] md:text-[9px] text-slate-500 px-1 py-0.5 rounded bg-slate-100 whitespace-nowrap">{ev.type}</span>
                                  </div>
                                  <span className="block line-clamp-2 text-[9px] md:text-[10px] text-slate-600 mt-0.5">{ev.description}</span>
                                </>
                              ) : (
                                <span className="truncate block">{ev.description}</span>
                              )}
                           </div>
                        ))}
                        {dayEvents.length > (isClient ? 2 : 3) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setSelectedDayEvents({ date: dateStr, events: dayEvents });
                            }}
                            className={`${isClient ? 'text-[9px] md:text-[10px] px-1 md:px-1.5 py-0.5 md:py-1' : 'text-[8px] md:text-[9px] px-0.5 md:px-1 py-0.5'} w-full rounded border-2 border-slate-400 bg-slate-100 text-slate-800 hover:bg-slate-200 hover:border-slate-500 transition-colors font-semibold shadow-sm cursor-pointer`}
                          >
                            +{dayEvents.length - (isClient ? 2 : 3)} más eventos
                          </button>
                        )}
                     </div>
                  </div>
               );
            })}
         </div>
      </div>
    );
  };

  // Tooltip component for event details
  const EventTooltip = () => {
    if (!hoveredEvent || !isClient) return null;
    
    return (
      <div 
        className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 p-3 md:p-4 max-w-xs pointer-events-none"
        style={{
          left: `${tooltipPosition.x}px`,
          top: `${tooltipPosition.y - 10}px`,
          transform: 'translate(-50%, -100%)'
        }}
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h4 className="font-bold text-sm text-slate-800">{hoveredEvent.unitName}</h4>
            <span className={`px-2 py-0.5 rounded text-xs font-medium
              ${hoveredEvent.category === 'Log' ? 'bg-gray-100 text-gray-800' : 
                hoveredEvent.category === 'Maintenance' ? 'bg-orange-100 text-orange-800' : 
                hoveredEvent.category === 'ContractAlert' ? 'bg-red-100 text-red-800' :
                'bg-blue-100 text-blue-800'}`}>
              {hoveredEvent.type}
            </span>
          </div>
          <p className="text-xs text-slate-600 line-clamp-4">{hoveredEvent.description}</p>
          {hoveredEvent.resourceName && (
            <p className="text-xs font-semibold text-slate-700">Recurso: {hoveredEvent.resourceName}</p>
          )}
          {hoveredEvent.status && (
            <p className="text-xs text-slate-500">Estado: {hoveredEvent.status}</p>
          )}
          {hoveredEvent.originalRef?.images?.length > 0 && (
            <p className="text-xs text-slate-500 flex items-center">
              <ImageIcon size={12} className="mr-1" /> {hoveredEvent.originalRef.images.length} imagen(es)
            </p>
          )}
          {hoveredEvent.originalRef?.responsibleIds?.length > 0 && (
            <p className="text-xs text-slate-500 flex items-center">
              <UserCheck size={12} className="mr-1" /> {hoveredEvent.originalRef.responsibleIds.length} responsable(s)
            </p>
          )}
        </div>
      </div>
    );
  };

  // Helper to determine if we show full edit features
  const isTrackableRecord = editingEvent?.category === 'Log' || (editingEvent?.category === 'Maintenance' && !editingEvent.id.startsWith('future'));

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-3 md:space-y-4 animate-in fade-in duration-500 h-full flex flex-col relative">
      <EventTooltip />
      
      {/* Modal para ver todos los eventos de un día */}
      {selectedDayEvents && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 md:p-4" onClick={() => setSelectedDayEvents(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="bg-slate-800 text-white px-4 md:px-6 py-3 md:py-4 border-b border-slate-700 rounded-t-xl flex justify-between items-center shrink-0">
              <div className="flex items-center min-w-0 flex-1">
                <CalendarIcon className="mr-2 shrink-0" size={16} />
                <div className="min-w-0">
                  <h3 className="font-bold text-base md:text-lg truncate">Eventos del {new Date(selectedDayEvents.date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                  <p className="text-[10px] md:text-xs text-slate-300">{selectedDayEvents.events.length} evento(s)</p>
                </div>
              </div>
              <button onClick={() => setSelectedDayEvents(null)} className="text-white/80 hover:text-white shrink-0 ml-2"><X size={18} className="md:w-5 md:h-5" /></button>
            </div>
            
            <div className="p-4 md:p-6 overflow-y-auto flex-1">
              <div className="space-y-3">
                {selectedDayEvents.events.map(ev => (
                  <div
                    key={ev.id}
                    onClick={() => {
                      if (canEdit) {
                        setSelectedDayEvents(null);
                        handleEditClick(ev);
                      }
                    }}
                    className={`p-3 md:p-4 rounded-lg border-2 ${canEdit ? 'cursor-pointer hover:shadow-md' : 'cursor-default'} transition-all
                      ${ev.category === 'Log' && ev.type === 'Incidencia' ? 'bg-red-50 border-red-200' : 
                        ev.category === 'Log' ? 'bg-gray-50 border-gray-200' :
                        ev.category === 'Maintenance' ? 'bg-orange-50 border-orange-200' :
                        ev.category === 'ContractAlert' ? 'bg-red-50 border-red-300' :
                        'bg-blue-50 border-blue-200'
                      }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm md:text-base text-slate-800 mb-1">{ev.unitName}</h4>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-1 rounded text-xs font-medium
                            ${ev.category === 'Log' ? 'bg-gray-100 text-gray-800' : 
                              ev.category === 'Maintenance' ? 'bg-orange-100 text-orange-800' : 
                              ev.category === 'ContractAlert' ? 'bg-red-100 text-red-800' :
                              'bg-blue-100 text-blue-800'}`}>
                            {ev.type}
                          </span>
                          {ev.status && (
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(ev.status)}`}>
                              {ev.status}
                            </span>
                          )}
                        </div>
                      </div>
                      {ev.type === 'Incidencia' && <AlertTriangle size={20} className="text-red-600 shrink-0" />}
                    </div>
                    <p className="text-xs md:text-sm text-slate-600 mb-2 line-clamp-3">{ev.description}</p>
                    {ev.resourceName && (
                      <p className="text-xs font-semibold text-slate-700 mb-1">Recurso: {ev.resourceName}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {ev.originalRef?.images?.length > 0 && (
                        <span className="px-2 py-1 inline-flex text-xs font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200 flex items-center">
                          <ImageIcon size={12} className="mr-1" /> {ev.originalRef.images.length} imagen(es)
                        </span>
                      )}
                      {ev.originalRef?.responsibleIds?.length > 0 && (
                        <span className="px-2 py-1 inline-flex text-xs font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200 flex items-center">
                          <UserCheck size={12} className="mr-1" /> {ev.originalRef.responsibleIds.length} responsable(s)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4 shrink-0">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">Centro de Control Operativo</h1>
            <p className="text-xs md:text-sm text-slate-500">Gestión consolidada de eventos y bitácoras.</p>
          </div>
       </div>

       {/* Filters */}
       <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-3 md:gap-4 items-stretch md:items-center shrink-0">
          <div className="flex-1 w-full relative">
             <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
             <input 
                type="text" 
                placeholder="Buscar..." 
                className="w-full pl-9 md:pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
             />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
             <select 
                className="flex-1 md:w-48 border border-slate-300 rounded-lg p-2 outline-none text-xs md:text-sm bg-white"
                value={filterUnit}
                onChange={e => setFilterUnit(e.target.value)}
             >
                <option value="all">Todas las Unidades</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
             </select>
             <select 
                className="flex-1 md:w-40 border border-slate-300 rounded-lg p-2 outline-none text-xs md:text-sm bg-white"
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
             >
                <option value="all">Todo Tipo</option>
                <option value="Log">Bitácora</option>
                <option value="Maintenance">Mantenimiento</option>
                <option value="Training">Capacitación</option>
                {isOperationsUser && <option value="ContractAlert">Alertas de Contrato</option>}
             </select>
          </div>
       </div>

       {/* Split View Content */}
       <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 md:gap-6 overflow-hidden">
          {/* Left: Calendar */}
          <div className={`${isClient ? 'lg:w-7/12' : 'lg:w-5/12'} h-full overflow-y-auto custom-scrollbar pr-1`}>
             <h3 className="text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center"><CalendarIcon size={14} className="mr-2 md:w-4 md:h-4"/> Vista Mensual</h3>
             {renderCalendar()}
          </div>

          {/* Right: List */}
          <div className={`${isClient ? 'lg:w-5/12' : 'lg:w-7/12'} h-full overflow-hidden flex flex-col`}>
             <h3 className="text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center"><List size={14} className="mr-2 md:w-4 md:h-4"/> Detalle de Eventos ({filteredEvents.length})</h3>
             
             <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
                <div className="overflow-x-auto custom-scrollbar flex-1">
                    <table className="min-w-full divide-y divide-slate-200 relative">
                    <thead className="bg-slate-50 sticky top-0 z-20 shadow-sm">
                        <tr>
                            <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">Fecha</th>
                            <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">Evento</th>
                            <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">Detalle</th>
                            <th className="px-2 md:px-4 py-2 md:py-3 text-right text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {filteredEvents.map(ev => (
                            <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-2 md:px-4 py-2 md:py-3 whitespace-nowrap text-[10px] md:text-xs text-slate-600 font-mono">{ev.date}</td>
                                <td className="px-2 md:px-4 py-2 md:py-3 whitespace-nowrap">
                                    <div className="text-[10px] md:text-xs font-bold text-slate-900 truncate max-w-[100px] md:max-w-none">{ev.unitName}</div>
                                    <span className={`inline-flex items-center px-1.5 md:px-2 py-0.5 rounded text-[9px] md:text-[10px] font-medium mt-1 
                                        ${ev.category === 'Log' ? 'bg-gray-100 text-gray-800' : 
                                            ev.category === 'Maintenance' ? 'bg-orange-100 text-orange-800' : 
                                            ev.category === 'ContractAlert' ? 'bg-red-100 text-red-800' :
                                            'bg-blue-100 text-blue-800'}`}>
                                        {ev.category === 'Maintenance' && <Wrench size={8} className="mr-0.5 md:w-2.5 md:h-2.5"/>}
                                        {ev.category === 'Training' && <GraduationCap size={8} className="mr-0.5 md:w-2.5 md:h-2.5"/>}
                                        {ev.category === 'ContractAlert' && <AlertTriangle size={8} className="mr-0.5 md:w-2.5 md:h-2.5"/>}
                                        <span className="truncate max-w-[60px] md:max-w-none">{ev.type}</span>
                                    </span>
                                </td>
                                <td className="px-2 md:px-4 py-2 md:py-3 text-[10px] md:text-xs text-slate-600 max-w-[120px] md:max-w-xs">
                                    <div className="line-clamp-2" title={ev.description}>
                                        {ev.resourceName && <span className="font-bold mr-1 block truncate">{ev.resourceName}</span>}
                                        <span className="line-clamp-2">{ev.description}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 md:gap-2 mt-1">
                                        {ev.status && <span className={`px-1 md:px-1.5 py-0.5 inline-flex text-[9px] md:text-[10px] leading-3 md:leading-4 font-semibold rounded-full ${getStatusColor(ev.status)}`}>
                                            {ev.status}
                                        </span>}
                                        {(ev.originalRef.responsibleIds?.length > 0) && (
                                            <span className="px-1 md:px-1.5 py-0.5 inline-flex text-[9px] md:text-[10px] leading-3 md:leading-4 font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200 flex items-center">
                                                <UserCheck size={8} className="mr-0.5 md:w-2.5 md:h-2.5"/> {ev.originalRef.responsibleIds?.length}
                                            </span>
                                        )}
                                        {(ev.originalRef.images?.length > 0) && (
                                            <span className="px-1 md:px-1.5 py-0.5 inline-flex text-[9px] md:text-[10px] leading-3 md:leading-4 font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200 flex items-center">
                                                <ImageIcon size={8} className="mr-0.5 md:w-2.5 md:h-2.5"/> {ev.originalRef.images?.length}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-2 md:px-4 py-2 md:py-3 whitespace-nowrap text-right text-xs md:text-sm font-medium flex justify-end gap-1 md:gap-2">
                                    {canEdit && (
                                        <>
                                            <button onClick={() => handleEditClick(ev)} className="text-blue-600 hover:text-blue-900 bg-blue-50 p-1 md:p-1.5 rounded-lg transition-colors shrink-0" title="Editar">
                                                <Edit2 size={12} className="md:w-3.5 md:h-3.5" />
                                            </button>
                                            {!ev.id.startsWith('future') && (
                                                <button onClick={() => handleDeleteEvent(ev)} className="text-red-600 hover:text-red-900 bg-red-50 p-1 md:p-1.5 rounded-lg transition-colors shrink-0" title="Eliminar">
                                                    <Trash2 size={12} className="md:w-3.5 md:h-3.5" />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filteredEvents.length === 0 && (
                            <tr><td colSpan={4} className="px-4 md:px-6 py-6 md:py-8 text-center text-xs md:text-sm text-slate-400 italic">No se encontraron eventos.</td></tr>
                        )}
                    </tbody>
                    </table>
                </div>
             </div>
          </div>
       </div>

       {/* Enhanced Edit Modal */}
       {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 md:p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[95vh] md:max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-slate-800 text-white px-4 md:px-6 py-3 md:py-4 border-b border-slate-700 rounded-t-xl flex justify-between items-center shrink-0">
                <div className="flex items-center min-w-0 flex-1">
                   <Edit2 className="mr-2 shrink-0" size={16} />
                   <div className="min-w-0">
                     <h3 className="font-bold text-base md:text-lg truncate">Editar Evento</h3>
                     <p className="text-[10px] md:text-xs text-slate-300 truncate">{editingEvent.unitName} - {editingEvent.category}</p>
                   </div>
                </div>
                <button onClick={() => setEditingEvent(null)} className="text-white/80 hover:text-white shrink-0 ml-2"><X size={18} className="md:w-5 md:h-5" /></button>
             </div>
             
             <div className="p-4 md:p-6 space-y-3 md:space-y-4 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    <div>
                        <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Fecha</label>
                        <input type="date" className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})} />
                    </div>
                    {/* Log Type */}
                    {editingEvent.category === 'Log' && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Evento</label>
                            <select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editForm.type} onChange={e => setEditForm({...editForm, type: e.target.value})}>
                                <option value="Supervision">Supervisión</option>
                                <option value="Capacitacion">Capacitación</option>
                                <option value="Incidencia">Incidencia</option>
                                <option value="Visita Cliente">Visita Cliente</option>
                                <option value="Coordinacion">Coordinación</option>
                                <option value="Mantenimiento">Mantenimiento</option>
                            </select>
                        </div>
                    )}
                    {/* Maintenance Type */}
                    {editingEvent.category === 'Maintenance' && !editingEvent.id.startsWith('future') && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo Mantenimiento</label>
                            <select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editForm.type} onChange={e => setEditForm({...editForm, type: e.target.value})}>
                                <option value="Preventivo">Preventivo</option>
                                <option value="Correctivo">Correctivo</option>
                                <option value="Supervision">Supervisión</option>
                                <option value="Calibracion">Calibración</option>
                            </select>
                        </div>
                    )}
                </div>

                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Descripción / Detalle</label>
                   <textarea className="w-full border border-slate-300 rounded-lg p-2 outline-none h-20" value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} />
                </div>

                {/* Author / Technician Input - Show for Log AND Maintenance */}
                {isTrackableRecord && (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{editingEvent.category === 'Log' ? 'Autor' : 'Proveedor / Técnico Externo'}</label>
                        <input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editForm.authorOrTechnician} onChange={e => setEditForm({...editForm, authorOrTechnician: e.target.value})} />
                    </div>
                )}

                {/* Status Selector */}
                {editingEvent.category !== 'Log' && (
                  <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                     <select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})}>
                        <option value="Programado">Programado</option>
                        <option value="Pendiente">Pendiente</option>
                        <option value="Realizado">Realizado</option>
                        <option value="Completado">Completado</option>
                        <option value="Cancelado">Cancelado</option>
                     </select>
                  </div>
                )}
                
                {/* Score for Training */}
                {editingEvent.category === 'Training' && (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nota / Puntaje</label>
                        <input type="number" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editForm.score} onChange={e => setEditForm({...editForm, score: Number(e.target.value)})} />
                    </div>
                )}

                {editingEvent.category === 'ContractAlert' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-start space-x-3">
                            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                            <div className="flex-1">
                                <h4 className="font-bold text-amber-900 mb-2">Alerta de Contrato de Trabajo</h4>
                                <p className="text-sm text-amber-800 mb-3">
                                    {editingEvent.originalRef?.daysDiff !== undefined && (
                                        <>El trabajador <strong>{editingEvent.resourceName}</strong> completó <strong>{editingEvent.originalRef.daysDiff} días</strong> de capacitación. Se requiere generar el contrato de trabajo.</>
                                    )}
                                </p>
                                <p className="text-xs text-amber-700 italic">
                                    Al resolver esta alerta, se marcará que el contrato ha sido generado y la alerta desaparecerá.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Responsible Selection (Logs AND Maintenance) */}
                {isTrackableRecord && (
                    <div>
                       <label className="block text-sm font-medium text-slate-700 mb-2">Responsables / Involucrados</label>
                       <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto p-2 bg-slate-50 space-y-2">
                          <p className="text-xs text-slate-400 uppercase font-bold px-1">Equipo de Gestión</p>
                          {managementStaff.map(s => (
                              <div key={s.id} onClick={() => toggleResponsible(s.id)} className={`flex items-center p-2 rounded cursor-pointer transition-colors ${editForm.responsibleIds.includes(s.id) ? 'bg-blue-100 border-blue-200' : 'hover:bg-slate-100'}`}>
                                  <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${editForm.responsibleIds.includes(s.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                                      {editForm.responsibleIds.includes(s.id) && <Plus size={12} className="text-white"/>}
                                  </div>
                                  <span className="text-sm text-slate-700">{s.name} <span className="text-xs text-slate-400">({s.role === 'COORDINATOR' ? 'Coord' : 'Sup'})</span></span>
                              </div>
                          ))}
                          
                          <p className="text-xs text-slate-400 uppercase font-bold px-1 mt-2">Personal Unidad</p>
                          {getUnitPersonnel(editingEvent.unitId).length > 0 ? getUnitPersonnel(editingEvent.unitId).map(p => (
                              <div key={p.id} onClick={() => toggleResponsible(p.id)} className={`flex items-center p-2 rounded cursor-pointer transition-colors ${editForm.responsibleIds.includes(p.id) ? 'bg-blue-100 border-blue-200' : 'hover:bg-slate-100'}`}>
                                  <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${editForm.responsibleIds.includes(p.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                                      {editForm.responsibleIds.includes(p.id) && <Plus size={12} className="text-white"/>}
                                  </div>
                                  <span className="text-sm text-slate-700">{p.name}</span>
                              </div>
                          )) : <p className="text-xs text-slate-400 italic px-2">No hay personal operativo.</p>}
                       </div>
                    </div>
                )}
                
                {/* Image Management (Logs AND Maintenance) */}
                {isTrackableRecord && (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Evidencias (Fotos)</label>
                        <div className="flex gap-2">
                            <input type="text" className="flex-1 border border-slate-300 rounded-lg p-2 outline-none text-sm" placeholder="URL..." value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)} />
                             <label className="bg-slate-100 p-2 rounded-lg cursor-pointer hover:bg-slate-200 border border-slate-200 flex items-center justify-center">
                                <Camera size={20} className="text-slate-600"/>
                                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                             </label>
                            <button onClick={handleAddImage} disabled={!newImageUrl} className="bg-slate-100 p-2 rounded hover:bg-slate-200 disabled:opacity-50"><Plus size={20}/></button>
                        </div>
                        {editForm.images.length > 0 && (
                            <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                                {editForm.images.map((img, i) => (
                                    <div key={i} className="w-16 h-16 shrink-0 relative group">
                                        <SafeImage 
                                          src={img} 
                                          className="w-full h-full object-cover rounded border border-slate-200" 
                                          alt="ev"
                                          bucket="unit-images"
                                        />
                                        <button onClick={() => handleRemoveImage(i)} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <button onClick={handleSaveEdit} className="w-full bg-blue-600 text-white py-2 md:py-2.5 rounded-lg text-sm md:text-base font-medium hover:bg-blue-700 transition-colors mt-2 flex items-center justify-center">
                  <Save size={16} className="mr-2 md:w-4.5 md:h-4.5"/> Guardar Cambios
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
