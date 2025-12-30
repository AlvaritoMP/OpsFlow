import React, { useState, useEffect, useMemo } from 'react';
import { Unit, UnitStatus, ResourceType } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { Building2, Users, AlertTriangle, CheckCircle, Sun, Moon, Clock, Shield, UserPlus, Activity, FileText, TrendingUp, UserMinus, GripVertical } from 'lucide-react';

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
  const [retenUtilizationRatio, setRetenUtilizationRatio] = useState<number>(0);
  const [unitsActivityData, setUnitsActivityData] = useState<Array<{ name: string; eventos: number; requerimientos: number; total: number }>>([]);
  const [personnelRotation, setPersonnelRotation] = useState<number>(0);
  const [personnelEntryRate, setPersonnelEntryRate] = useState<number>(0);
  const [personnelExitRate, setPersonnelExitRate] = useState<number>(0);
  
  // Card order state for drag and drop
  type CardId = 'totalUnits' | 'activeUnits' | 'totalWorkers' | 'issueUnits' | 'dayShift' | 'afternoonShift' | 'nightShift' | 'retenCoverages' | 'retenUtilization' | 'newWorkers' | 'personnelRotation' | 'entryRate' | 'exitRate';
  const defaultCardOrder: CardId[] = [
    'totalUnits', 'activeUnits', 'totalWorkers', 'issueUnits',
    'dayShift', 'afternoonShift', 'nightShift',
    'retenCoverages', 'retenUtilization',
    'newWorkers', 'personnelRotation', 'entryRate', 'exitRate'
  ];
  
  const [cardOrder, setCardOrder] = useState<CardId[]>(() => {
    const saved = localStorage.getItem('dashboard-card-order');
    return saved ? JSON.parse(saved) : defaultCardOrder;
  });
  
  const [draggedCard, setDraggedCard] = useState<CardId | null>(null);
  const [dragOverCard, setDragOverCard] = useState<CardId | null>(null);
  
  // Save card order to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('dashboard-card-order', JSON.stringify(cardOrder));
  }, [cardOrder]);

  // Calculate aggregations
  const totalUnits = units.length;
  const activeUnits = units.filter(u => u.status === UnitStatus.ACTIVE).length;
  const issueUnits = units.filter(u => u.status === UnitStatus.ISSUE).length;
  // Calcular total de trabajadores sin duplicar los compartidos
  const totalWorkers = useMemo(() => {
    const uniqueWorkers = new Set<string>(); // Set para trabajadores compartidos únicos
    let uniqueCount = 0; // Contador de trabajadores únicos
    let sharedCount = 0; // Contador de trabajadores compartidos (solo una vez)

    units.forEach(unit => {
      unit.resources
        .filter(r => r.type === ResourceType.PERSONNEL && !r.archived && r.personnelStatus !== 'cesado')
        .forEach(r => {
          if (r.isShared) {
            // Trabajador compartido: usar identificador único (DNI o nombre)
            const identifier = r.dni || r.name;
            if (!uniqueWorkers.has(identifier)) {
              uniqueWorkers.add(identifier);
              sharedCount++;
            }
          } else {
            // Trabajador único: contar en cada unidad
            uniqueCount++;
          }
        });
    });

    return uniqueCount + sharedCount;
  }, [units]);
  
  const chartData = units
    .filter(u => u.complianceHistory && u.complianceHistory.length > 0)
    .map(u => ({
      name: u.name.split(' ').slice(0, 2).join(' '), // Short name
      score: u.complianceHistory[u.complianceHistory.length - 1]?.score || 0,
      id: u.id
    }));

  // Calculate workers by shift based on assignedShift field (not rostering)
  // No duplicar trabajadores compartidos
  const workersByShiftCount = useMemo(() => {
    let dayCount = 0;
    let afternoonCount = 0;
    let nightCount = 0;
    const sharedWorkersByShift = new Map<string, Set<string>>(); // Map<shift, Set<identifier>>

    units.forEach(unit => {
      unit.resources
        .filter(r => r.type === ResourceType.PERSONNEL && !r.archived && r.personnelStatus !== 'cesado')
        .forEach(r => {
          const shift = r.assignedShift?.toLowerCase() || '';
          const identifier = r.dni || r.name;
          
          // Map assignedShift values to turnos
          // "Diurno" -> Día
          // "Tarde" -> Tarde
          // "Nocturno" -> Noche
          // "Mixto" -> could be counted in multiple or none, for now we'll skip it
          
          let shiftType: 'day' | 'afternoon' | 'night' | null = null;
          if (shift.includes('diurno') || shift === 'día' || shift === 'dia' || shift === 'day' || shift === 'morning') {
            shiftType = 'day';
          } else if (shift.includes('tarde') || shift === 'afternoon') {
            shiftType = 'afternoon';
          } else if (shift.includes('nocturno') || shift === 'noche' || shift === 'night') {
            shiftType = 'night';
          }
          
          if (shiftType) {
            if (r.isShared) {
              // Trabajador compartido: solo contar una vez por turno
              if (!sharedWorkersByShift.has(shiftType)) {
                sharedWorkersByShift.set(shiftType, new Set());
              }
              const shiftSet = sharedWorkersByShift.get(shiftType)!;
              if (!shiftSet.has(identifier)) {
                shiftSet.add(identifier);
                if (shiftType === 'day') dayCount++;
                else if (shiftType === 'afternoon') afternoonCount++;
                else if (shiftType === 'night') nightCount++;
              }
            } else {
              // Trabajador único: contar en cada unidad
              if (shiftType === 'day') dayCount++;
              else if (shiftType === 'afternoon') afternoonCount++;
              else if (shiftType === 'night') nightCount++;
            }
          }
        });
    });

    return { day: dayCount, afternoon: afternoonCount, night: nightCount };
  }, [units]);

  useEffect(() => {
    setWorkersByShift(workersByShiftCount);
    setLoadingMetrics(false);
  }, [workersByShiftCount]);

  // Calculate reten coverages and utilization ratio
  useEffect(() => {
    const loadRetenMetrics = async () => {
      try {
        const { retenesService } = await import('../services/retenesService');
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        
        const startDate = firstDayOfMonth.toISOString().split('T')[0];
        const endDate = lastDayOfMonth.toISOString().split('T')[0];
        
        // Get all retenes (total available)
        const allRetenes = await retenesService.getAll();
        const totalRetenes = allRetenes.length;
        
        // Get all assignments in the month
        const assignments = await retenesService.getAssignmentsByDateRange(startDate, endDate);
        setRetenCoverages(assignments.length);
        
        // Calculate daily utilization ratio
        if (totalRetenes > 0) {
          // Group assignments by date
          const assignmentsByDate = new Map<string, Set<string>>(); // date -> Set of reten_ids
          
          assignments.forEach(assignment => {
            const date = assignment.assignment_date;
            if (!assignmentsByDate.has(date)) {
              assignmentsByDate.set(date, new Set());
            }
            assignmentsByDate.get(date)!.add(assignment.reten_id);
          });
          
          // Calculate daily percentage for each day, then average
          const daysInMonth = lastDayOfMonth.getDate();
          const dailyPercentages: number[] = [];
          
          // Iterate through each day of the month
          for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(today.getFullYear(), today.getMonth(), day);
            const dateStr = currentDate.toISOString().split('T')[0];
            
            // Only count days that have passed
            if (currentDate <= today) {
              const retenesUsedOnDate = assignmentsByDate.get(dateStr)?.size || 0;
              // Calculate daily percentage: (retenes únicos del día / total retenes) × 100
              const dailyPercentage = (retenesUsedOnDate / totalRetenes) * 100;
              dailyPercentages.push(dailyPercentage);
            }
          }
          
          // Calculate average of daily percentages
          const avgDailyPercentage = dailyPercentages.length > 0
            ? dailyPercentages.reduce((sum, pct) => sum + pct, 0) / dailyPercentages.length
            : 0;
          
          setRetenUtilizationRatio(avgDailyPercentage);
        } else {
          setRetenUtilizationRatio(0);
        }
      } catch (error) {
        console.error('Error loading reten metrics:', error);
      }
    };

    loadRetenMetrics();
  }, []);

  // Note: setLoadingMetrics(false) is now handled in loadShiftMetrics finally block

  // Calculate new workers this month (sin duplicar compartidos)
  const newWorkersCount = useMemo(() => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const sharedNewWorkers = new Set<string>(); // Para trabajadores compartidos nuevos
    let uniqueNewCount = 0;
    let sharedNewCount = 0;
    
    units.forEach(unit => {
      unit.resources
        .filter(r => {
          if (r.type !== ResourceType.PERSONNEL || r.archived || r.personnelStatus === 'cesado') return false;
          if (!r.startDate) return false;
          const startDate = new Date(r.startDate);
          return startDate >= firstDayOfMonth && startDate <= today;
        })
        .forEach(r => {
          if (r.isShared) {
            // Trabajador compartido: solo contar una vez
            const identifier = r.dni || r.name;
            if (!sharedNewWorkers.has(identifier)) {
              sharedNewWorkers.add(identifier);
              sharedNewCount++;
            }
          } else {
            // Trabajador único: contar en cada unidad
            uniqueNewCount++;
          }
        });
    });
    
    return uniqueNewCount + sharedNewCount;
  }, [units]);

  useEffect(() => {
    setNewWorkersThisMonth(newWorkersCount);
  }, [newWorkersCount]);

  // Calculate personnel rotation metrics
  useEffect(() => {
    const calculatePersonnelRotation = () => {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      // Calculate total workers at the beginning of the month
      // Workers that were active on the first day of the month (startDate <= firstDayOfMonth AND (endDate is null OR endDate > firstDayOfMonth))
      const sharedWorkersAtStart = new Set<string>();
      let uniqueWorkersAtStart = 0;
      let sharedWorkersAtStartCount = 0;
      
      units.forEach(unit => {
        unit.resources
          .filter(r => {
            if (r.type !== ResourceType.PERSONNEL) return false;
            // Worker was active at the beginning of the month if:
            // - Has startDate <= firstDayOfMonth (already started)
            // - AND (no endDate OR endDate > firstDayOfMonth) (hadn't ended yet)
            const startDate = r.startDate ? new Date(r.startDate) : null;
            const endDate = r.endDate ? new Date(r.endDate) : null;
            
            if (!startDate) return false; // No start date means not active
            if (startDate > firstDayOfMonth) return false; // Started after the month began
            
            // If has endDate, it must be after the first day of the month
            if (endDate && endDate <= firstDayOfMonth) return false;
            
            return true;
          })
          .forEach(r => {
            if (r.isShared) {
              const identifier = r.dni || r.name;
              if (!sharedWorkersAtStart.has(identifier)) {
                sharedWorkersAtStart.add(identifier);
                sharedWorkersAtStartCount++;
              }
            } else {
              uniqueWorkersAtStart++;
            }
          });
      });
      
      const totalWorkersAtStart = uniqueWorkersAtStart + sharedWorkersAtStartCount;
      
      // Calculate workers who left during the month (endDate in the current month)
      const sharedWorkersExited = new Set<string>();
      let uniqueWorkersExited = 0;
      let sharedWorkersExitedCount = 0;
      
      units.forEach(unit => {
        unit.resources
          .filter(r => {
            if (r.type !== ResourceType.PERSONNEL) return false;
            if (!r.endDate) return false;
            
            const endDate = new Date(r.endDate);
            // Worker left during the month if endDate is between firstDayOfMonth and lastDayOfMonth
            return endDate >= firstDayOfMonth && endDate <= lastDayOfMonth;
          })
          .forEach(r => {
            if (r.isShared) {
              const identifier = r.dni || r.name;
              if (!sharedWorkersExited.has(identifier)) {
                sharedWorkersExited.add(identifier);
                sharedWorkersExitedCount++;
              }
            } else {
              uniqueWorkersExited++;
            }
          });
      });
      
      const totalWorkersExited = uniqueWorkersExited + sharedWorkersExitedCount;
      
      // Calculate metrics
      if (totalWorkersAtStart > 0) {
        // Rotación mensual = (nuevos - salidas) / total a inicio de mes
        const rotation = ((newWorkersCount - totalWorkersExited) / totalWorkersAtStart) * 100;
        setPersonnelRotation(rotation);
        
        // Tasa de ingreso = nuevos / total a inicio de mes
        const entryRate = (newWorkersCount / totalWorkersAtStart) * 100;
        setPersonnelEntryRate(entryRate);
        
        // Tasa de salida = ceses / total a inicio de mes
        const exitRate = (totalWorkersExited / totalWorkersAtStart) * 100;
        setPersonnelExitRate(exitRate);
      } else {
        setPersonnelRotation(0);
        setPersonnelEntryRate(0);
        setPersonnelExitRate(0);
      }
    };
    
    calculatePersonnelRotation();
  }, [units, newWorkersCount]);

  // Calculate units activity (events and requests)
  useEffect(() => {
    const calculateUnitsActivity = () => {
      const activityMap = new Map<string, { eventos: number; requerimientos: number }>();
      
      units.forEach(unit => {
        const eventos = unit.logs?.length || 0;
        const requerimientos = unit.requests?.length || 0;
        
        activityMap.set(unit.id, {
          eventos,
          requerimientos
        });
      });
      
      // Convert to array and sort by total activity
      const activityArray = Array.from(activityMap.entries())
        .map(([unitId, data]) => {
          const unit = units.find(u => u.id === unitId);
          return {
            name: unit?.name || 'Desconocida',
            eventos: data.eventos,
            requerimientos: data.requerimientos,
            total: data.eventos + data.requerimientos
          };
        })
        .filter(item => item.total > 0) // Only show units with activity
        .sort((a, b) => b.total - a.total)
        .slice(0, 10); // Top 10 units
      
      setUnitsActivityData(activityArray);
    };
    
    calculateUnitsActivity();
  }, [units]);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, cardId: CardId) => {
    setDraggedCard(cardId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', cardId);
  };

  const handleDragOver = (e: React.DragEvent, cardId: CardId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedCard && draggedCard !== cardId) {
      setDragOverCard(cardId);
    }
  };

  const handleDragLeave = () => {
    setDragOverCard(null);
  };

  const handleDrop = (e: React.DragEvent, targetCardId: CardId) => {
    e.preventDefault();
    if (!draggedCard || draggedCard === targetCardId) {
      setDraggedCard(null);
      setDragOverCard(null);
      return;
    }

    const newOrder = [...cardOrder];
    const draggedIndex = newOrder.indexOf(draggedCard);
    const targetIndex = newOrder.indexOf(targetCardId);

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedCard);

    setCardOrder(newOrder);
    setDraggedCard(null);
    setDragOverCard(null);
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
    setDragOverCard(null);
  };

  // Card definitions with their content
  const cardDefinitions: Record<CardId, { icon: React.ReactNode; label: string; value: string | number; subtitle?: string; bgColor: string; iconColor: string }> = {
    totalUnits: {
      icon: <Building2 size={20} className="md:w-6 md:h-6" />,
      label: 'Unidades Totales',
      value: totalUnits,
      bgColor: 'bg-blue-100',
      iconColor: 'text-blue-600'
    },
    activeUnits: {
      icon: <CheckCircle size={20} className="md:w-6 md:h-6" />,
      label: 'Unidades Operativas',
      value: activeUnits,
      bgColor: 'bg-green-100',
      iconColor: 'text-green-600'
    },
    totalWorkers: {
      icon: <Users size={20} className="md:w-6 md:h-6" />,
      label: 'Total Trabajadores',
      value: totalWorkers,
      bgColor: 'bg-purple-100',
      iconColor: 'text-purple-600'
    },
    issueUnits: {
      icon: <AlertTriangle size={20} className="md:w-6 md:h-6" />,
      label: 'Con Incidencias',
      value: issueUnits,
      bgColor: 'bg-red-100',
      iconColor: 'text-red-600'
    },
    dayShift: {
      icon: <Sun size={20} className="md:w-6 md:h-6" />,
      label: 'Turno Día',
      value: loadingMetrics ? '...' : workersByShift.day,
      bgColor: 'bg-yellow-100',
      iconColor: 'text-yellow-600'
    },
    afternoonShift: {
      icon: <Clock size={20} className="md:w-6 md:h-6" />,
      label: 'Turno Tarde',
      value: loadingMetrics ? '...' : workersByShift.afternoon,
      bgColor: 'bg-orange-100',
      iconColor: 'text-orange-600'
    },
    nightShift: {
      icon: <Moon size={20} className="md:w-6 md:h-6" />,
      label: 'Turno Noche',
      value: loadingMetrics ? '...' : workersByShift.night,
      bgColor: 'bg-indigo-100',
      iconColor: 'text-indigo-600'
    },
    retenCoverages: {
      icon: <Shield size={20} className="md:w-6 md:h-6" />,
      label: 'Coberturas Retenes',
      value: loadingMetrics ? '...' : retenCoverages,
      bgColor: 'bg-teal-100',
      iconColor: 'text-teal-600'
    },
    retenUtilization: {
      icon: <Shield size={20} className="md:w-6 md:h-6" />,
      label: 'Utilización Retenes',
      value: loadingMetrics ? '...' : `${retenUtilizationRatio.toFixed(1)}%`,
      subtitle: 'Promedio diario del mes',
      bgColor: 'bg-cyan-100',
      iconColor: 'text-cyan-600'
    },
    newWorkers: {
      icon: <UserPlus size={20} className="md:w-6 md:h-6" />,
      label: 'Nuevos este Mes',
      value: newWorkersThisMonth,
      bgColor: 'bg-pink-100',
      iconColor: 'text-pink-600'
    },
    personnelRotation: {
      icon: <TrendingUp size={20} className="md:w-6 md:h-6" />,
      label: 'Rotación Mensual',
      value: `${personnelRotation.toFixed(1)}%`,
      subtitle: '(Nuevos - Salidas) / Inicio',
      bgColor: 'bg-emerald-100',
      iconColor: 'text-emerald-600'
    },
    entryRate: {
      icon: <UserPlus size={20} className="md:w-6 md:h-6" />,
      label: 'Tasa de Ingreso',
      value: `${personnelEntryRate.toFixed(1)}%`,
      subtitle: 'Nuevos / Inicio',
      bgColor: 'bg-blue-100',
      iconColor: 'text-blue-600'
    },
    exitRate: {
      icon: <UserMinus size={20} className="md:w-6 md:h-6" />,
      label: 'Tasa de Salida',
      value: `${personnelExitRate.toFixed(1)}%`,
      subtitle: 'Ceses / Inicio',
      bgColor: 'bg-red-100',
      iconColor: 'text-red-600'
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 animate-in fade-in duration-500">
      <header className="mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Panel General de Operaciones</h1>
        <p className="text-sm md:text-base text-slate-500">Visión global del cumplimiento y estado de unidades.</p>
      </header>

      {/* KPI Cards - Draggable */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
        {cardOrder.map((cardId) => {
          const card = cardDefinitions[cardId];
          if (!card) return null;
          
          const isDragging = draggedCard === cardId;
          const isDragOver = dragOverCard === cardId;
          
          return (
            <div
              key={cardId}
              draggable
              onDragStart={(e) => handleDragStart(e, cardId)}
              onDragOver={(e) => handleDragOver(e, cardId)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, cardId)}
              onDragEnd={handleDragEnd}
              className={`
                bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 
                flex items-center space-x-3 md:space-x-4
                cursor-move transition-all duration-200
                ${isDragging ? 'opacity-50 scale-95' : ''}
                ${isDragOver ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
                hover:shadow-md hover:border-blue-300
              `}
            >
              <div className={`p-2 md:p-3 ${card.bgColor} ${card.iconColor} rounded-lg shrink-0 relative`}>
                {card.icon}
                <div className="absolute -top-1 -right-1 opacity-30">
                  <GripVertical size={12} className={card.iconColor} />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-medium text-slate-500">{card.label}</p>
                <p className="text-xl md:text-2xl font-bold text-slate-800">{card.value}</p>
                {card.subtitle && (
                  <p className="text-[10px] text-slate-400">{card.subtitle}</p>
                )}
              </div>
            </div>
          );
        })}
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

      {/* Units Activity Chart */}
      {unitsActivityData.length > 0 ? (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4">Unidades con Mayor Actividad</h3>
          <div className="h-64 md:h-80 w-full overflow-x-auto" style={{ minHeight: '256px', minWidth: '100%' }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={256}>
              <BarChart data={unitsActivityData} margin={{ left: 40, right: 10, top: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 11 }}
                  interval={0}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  cursor={{fill: 'rgba(0, 0, 0, 0.05)'}}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                />
                <Legend />
                <Bar dataKey="eventos" fill="#3b82f6" name="Eventos" radius={[4, 4, 0, 0]} />
                <Bar dataKey="requerimientos" fill="#ef4444" name="Requerimientos" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] md:text-xs text-slate-400 mt-2 text-center">Top 10 unidades con mayor cantidad de eventos y requerimientos</p>
        </div>
      ) : (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4">Unidades con Mayor Actividad</h3>
          <p className="text-sm md:text-base text-slate-500 text-center py-6 md:py-8">No hay datos de actividad disponibles para mostrar.</p>
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