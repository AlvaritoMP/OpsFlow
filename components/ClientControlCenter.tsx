import React, { useState, useMemo } from 'react';
import { Unit, ManagementStaff } from '../types';
import { Calendar as CalendarIcon, List, Search, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Wrench, GraduationCap, Eye } from 'lucide-react';

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

    const days = [];
    // Empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    // Days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const getEventsForDay = (day: number | null) => {
    if (day === null) return [];
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return filteredEvents.filter(e => e.date === dateStr);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

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

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

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
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => navigateMonth('prev')}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <h2 className="text-xl font-bold text-slate-800">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <button
                onClick={() => navigateMonth('next')}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-2">
              {/* Day headers */}
              {dayNames.map(day => (
                <div key={day} className="text-center text-sm font-medium text-slate-500 py-2">
                  {day}
                </div>
              ))}

              {/* Calendar days */}
              {getDaysInMonth(currentDate).map((day, idx) => {
                const dayEvents = getEventsForDay(day);
                return (
                  <div
                    key={idx}
                    className={`min-h-[80px] p-1 border border-slate-200 rounded-lg ${
                      day === null ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    {day !== null && (
                      <>
                        <div className="text-sm font-medium text-slate-700 mb-1">{day}</div>
                        <div className="space-y-1">
                          {dayEvents.slice(0, 2).map(event => (
                            <div
                              key={event.id}
                              className={`text-xs px-1.5 py-0.5 rounded border truncate ${getCategoryColor(event.category)}`}
                              title={event.description}
                            >
                              {getCategoryIcon(event.category)}
                              <span className="ml-1">{event.type}</span>
                            </div>
                          ))}
                          {dayEvents.length > 2 && (
                            <div className="text-xs text-slate-500 font-medium">
                              +{dayEvents.length - 2} más
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
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
    </div>
  );
};

