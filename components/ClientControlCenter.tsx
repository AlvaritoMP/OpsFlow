import React, { useState, useMemo } from 'react';
import { Unit, ManagementStaff } from '../types';
import { Calendar as CalendarIcon, List, Search, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Wrench, GraduationCap, Eye, X, Image as ImageIcon, UserCheck } from 'lucide-react';

interface ClientControlCenterProps {
  units: Unit[];
  managementStaff: ManagementStaff[];
}

// Unified Event Interface for internal use
interface GlobalEvent {
  id: string;
  unitId: string;
  unitName: string;
  date: string; // YYYY-MM-DD
  category: 'Log' | 'Maintenance' | 'Training';
  type: string; // Subtype (e.g., 'Incidencia', 'Preventivo')
  description: string;
  status?: string;
  resourceName?: string; // For maintenance/training
}

export const ClientControlCenter: React.FC<ClientControlCenterProps> = ({ units, managementStaff }) => {
  const [filterUnit, setFilterUnit] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  
  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Tooltip state for event details
  const [hoveredEvent, setHoveredEvent] = useState<GlobalEvent | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  
  // Modal state for day events
  const [selectedDayEvents, setSelectedDayEvents] = useState<{ date: string; events: GlobalEvent[] } | null>(null);

  // --- Data Aggregation (Read-only) ---
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
          status: 'Registrado'
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
              resourceName: res.name
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
                resourceName: res.name
             });
          }
        }

        // Training
        if (res.trainingHistory) {
          res.trainingHistory.forEach(train => {
            events.push({
              id: train.id,
              unitId: unit.id,
              unitName: unit.name,
              date: train.date,
              category: 'Training',
              type: train.type,
              description: train.description,
              status: train.status,
              resourceName: res.name
            });
          });
        }
      });
    });

    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [units]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    let filtered = allEvents;

    if (filterUnit !== 'all') {
      filtered = filtered.filter(e => e.unitId === filterUnit);
    }

    if (filterCategory !== 'all') {
      filtered = filtered.filter(e => e.category === filterCategory);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e => 
        e.description.toLowerCase().includes(term) ||
        e.unitName.toLowerCase().includes(term) ||
        (e.resourceName && e.resourceName.toLowerCase().includes(term))
      );
    }

    return filtered;
  }, [allEvents, filterUnit, filterCategory, searchTerm]);

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return {
      days: daysInMonth,
      firstDay: startingDayOfWeek,
      year,
      month
    };
  };

  const changeMonth = (delta: number) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + delta);
      return newDate;
    });
  };
  
  const getStatusColor = (status?: string) => {
    if (!status) return 'bg-gray-100 text-gray-600';
    if (status.includes('Completado') || status.includes('Resuelto')) return 'bg-green-100 text-green-700';
    if (status.includes('Pendiente') || status.includes('En Progreso')) return 'bg-yellow-100 text-yellow-700';
    return 'bg-gray-100 text-gray-600';
  };
  
  // Remove old getEventsForDay function - not needed anymore

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Log': return <AlertTriangle size={14} className="text-blue-500" />;
      case 'Maintenance': return <Wrench size={14} className="text-orange-500" />;
      case 'Training': return <GraduationCap size={14} className="text-green-500" />;
      default: return null;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Log': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Maintenance': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Training': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-4 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Centro de Control - Consulta</h1>
            <p className="text-sm text-slate-500">Vista de solo lectura para clientes</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center ${
                viewMode === 'calendar' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <CalendarIcon size={18} className="mr-2" />
              Calendario
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center ${
                viewMode === 'list' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <List size={18} className="mr-2" />
              Lista
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center space-x-2">
            <Search size={18} className="text-slate-400" />
            <input
              type="text"
              placeholder="Buscar eventos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <select
            value={filterUnit}
            onChange={(e) => setFilterUnit(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="all">Todas las unidades</option>
            {units.map(unit => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </select>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="all">Todas las categorías</option>
            <option value="Log">Logs Operativos</option>
            <option value="Maintenance">Mantenimiento</option>
            <option value="Training">Capacitación</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {viewMode === 'calendar' ? (
          <div className="flex flex-col lg:flex-row gap-4 md:gap-6 overflow-hidden">
            {/* Left: Calendar - Larger for clients */}
            <div className="lg:w-7/12 h-full overflow-y-auto custom-scrollbar pr-1">
              <h3 className="text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center"><CalendarIcon size={14} className="mr-2 md:w-4 md:h-4"/> Vista Mensual</h3>
              {(() => {
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
                        {blanks.map((_, i) => <div key={`blank-${i}`} className="h-24 md:h-32 bg-slate-50/50 border-b border-r border-slate-100"></div>)}
                        {daySlots.map(day => {
                           const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                           const dayEvents = monthEvents.filter(ev => ev.date === dateStr);
                           const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
                           
                           return (
                              <div key={day} className="min-h-[6rem] md:min-h-[8rem] border-b border-r border-slate-100 p-0.5 md:p-1 relative group hover:bg-slate-50 transition-colors">
                                 <span className={`text-[10px] md:text-xs font-medium ml-0.5 md:ml-1 ${isToday ? 'bg-blue-600 text-white px-1 md:px-1.5 rounded-full' : 'text-slate-700'}`}>{day}</span>
                                 <div className="mt-0.5 md:mt-1 space-y-0.5 md:space-y-1 overflow-y-auto max-h-20 md:max-h-28 custom-scrollbar">
                                    {dayEvents.slice(0, 2).map(ev => (
                                       <div 
                                          key={ev.id} 
                                          onMouseEnter={(e) => {
                                            setHoveredEvent(ev);
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.top });
                                          }}
                                          onMouseLeave={() => {
                                            setHoveredEvent(null);
                                          }}
                                          className={`text-[10px] md:text-xs px-1 md:px-1.5 py-1 md:py-1.5 rounded border shadow-sm hover:opacity-80 transition-opacity ${
                                            ev.category === 'Log' && ev.type === 'Incidencia' ? 'bg-red-100 text-red-700 border-red-200' : 
                                            ev.category === 'Log' ? 'bg-gray-100 text-gray-700 border-gray-200' :
                                            ev.category === 'Maintenance' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                            'bg-blue-100 text-blue-700 border-blue-200'
                                          }`}
                                       >
                                          {ev.type === 'Incidencia' && <AlertTriangle size={10} className="inline mr-0.5 md:w-3 md:h-3"/>}
                                          <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                                            <span className="text-[9px] md:text-[10px] font-bold text-slate-800 truncate">{ev.unitName}</span>
                                            <span className="text-[8px] md:text-[9px] text-slate-500 px-1 py-0.5 rounded bg-slate-100 whitespace-nowrap">{ev.type}</span>
                                          </div>
                                          <span className="block line-clamp-2 text-[9px] md:text-[10px] text-slate-600 mt-0.5">{ev.description}</span>
                                       </div>
                                    ))}
                                    {dayEvents.length > 2 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          setSelectedDayEvents({ date: dateStr, events: dayEvents });
                                        }}
                                        className="text-[9px] md:text-[10px] px-1 md:px-1.5 py-0.5 md:py-1 w-full rounded border-2 border-slate-400 bg-slate-100 text-slate-800 hover:bg-slate-200 hover:border-slate-500 transition-colors font-semibold shadow-sm cursor-pointer"
                                      >
                                        +{dayEvents.length - 2} más eventos
                                      </button>
                                    )}
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  </div>
                );
              })()}
            </div>

            {/* Right: List */}
            <div className="lg:w-5/12 h-full overflow-hidden flex flex-col">
              <h3 className="text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center"><List size={14} className="mr-2 md:w-4 md:h-4"/> Detalle de Eventos ({filteredEvents.length})</h3>
              
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
                <div className="p-3 md:p-4 overflow-y-auto flex-1 custom-scrollbar">
                  {filteredEvents.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <p>No se encontraron eventos con los filtros seleccionados.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 md:space-y-3">
                      {filteredEvents.map(event => (
                        <div
                          key={event.id}
                          className="p-3 md:p-4 rounded-lg border-2 border-slate-200 hover:shadow-md transition-all cursor-default bg-white"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-sm md:text-base text-slate-800 mb-1">{event.unitName}</h4>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(event.category)}`}>
                                  {event.type}
                                </span>
                                {event.status && (
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(event.status)}`}>
                                    {event.status}
                                  </span>
                                )}
                              </div>
                            </div>
                            {event.type === 'Incidencia' && <AlertTriangle size={20} className="text-red-600 shrink-0" />}
                          </div>
                          <p className="text-xs md:text-sm text-slate-600 mb-2 line-clamp-3">{event.description}</p>
                          {event.resourceName && (
                            <p className="text-xs font-semibold text-slate-700 mb-1">Recurso: {event.resourceName}</p>
                          )}
                          <p className="text-xs text-slate-400 mt-2">
                            {new Date(event.date).toLocaleDateString('es-ES', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
                <p className="text-slate-500">No se encontraron eventos con los filtros seleccionados.</p>
              </div>
            ) : (
              filteredEvents.map(event => (
                <div
                  key={event.id}
                  className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        {getCategoryIcon(event.category)}
                        <span className={`text-xs font-medium px-2 py-1 rounded border ${getCategoryColor(event.category)}`}>
                          {event.category}
                        </span>
                        <span className="text-xs text-slate-500">{event.type}</span>
                        {event.status && (
                          <span className="text-xs text-slate-400">• {event.status}</span>
                        )}
                      </div>
                      <h3 className="font-medium text-slate-800 mb-1">{event.unitName}</h3>
                      {event.resourceName && (
                        <p className="text-sm text-slate-600 mb-2">
                          <span className="font-medium">Recurso:</span> {event.resourceName}
                        </p>
                      )}
                      <p className="text-sm text-slate-700">{event.description}</p>
                      <p className="text-xs text-slate-400 mt-2">
                        {new Date(event.date).toLocaleDateString('es-ES', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                    <div className="ml-4 flex items-center text-slate-400">
                      <Eye size={18} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      
      {/* Tooltip for event details */}
      {hoveredEvent && (
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
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(hoveredEvent.category)}`}>
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
          </div>
        </div>
      )}
      
      {/* Modal for day events */}
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
                    className={`p-3 md:p-4 rounded-lg border-2 cursor-default transition-all
                      ${ev.category === 'Log' && ev.type === 'Incidencia' ? 'bg-red-50 border-red-200' :
                        ev.category === 'Log' ? 'bg-gray-50 border-gray-200' :
                        ev.category === 'Maintenance' ? 'bg-orange-50 border-orange-200' :
                        'bg-blue-50 border-blue-200'
                      }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm md:text-base text-slate-800 mb-1">{ev.unitName}</h4>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(ev.category)}`}>
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
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

