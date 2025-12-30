import React, { useState, useEffect, useMemo } from 'react';
import { Unit, UnitStatus, ResourceType } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { Building2, Users, AlertTriangle, CheckCircle, Sun, Moon, Clock, Shield, UserPlus, Activity, FileText, TrendingUp, UserMinus, GripVertical } from 'lucide-react';
import { UnitsMap } from './UnitsMap';

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
        
        // Get all retenes (total available)
        const allRetenes = await retenesService.getAll();
        const totalRetenes = allRetenes.length;
        
        // Get assignments from a wide range to find the last month with data
        const wideStartDate = new Date(today.getFullYear() - 1, 0, 1).toISOString().split('T')[0];
        const wideEndDate = today.toISOString().split('T')[0];
        const allAssignments = await retenesService.getAssignmentsByDateRange(wideStartDate, wideEndDate);
        
        if (allAssignments.length === 0) {
          setRetenCoverages(0);
          setRetenUtilizationRatio(0);
          return;
        }
        
        // Find the last month with assignments
        const lastAssignmentDate = new Date(allAssignments[allAssignments.length - 1].assignment_date);
        const calculationMonth = lastAssignmentDate.getMonth();
        const calculationYear = lastAssignmentDate.getFullYear();
        
        const firstDayOfMonth = new Date(calculationYear, calculationMonth, 1);
        const lastDayOfMonth = new Date(calculationYear, calculationMonth + 1, 0);
        
        const startDate = firstDayOfMonth.toISOString().split('T')[0];
        const endDate = lastDayOfMonth.toISOString().split('T')[0];
        
        // Get all assignments in the last month with data
        const assignments = allAssignments.filter(a => {
          const assignmentDate = new Date(a.assignment_date);
          return assignmentDate >= firstDayOfMonth && assignmentDate <= lastDayOfMonth;
        });
        
        setRetenCoverages(assignments.length);
        
        // Calculate daily utilization ratio
        if (totalRetenes > 0) {
          // Group assignments by date - count ALL coverages (assignments), not just unique retenes
          const coveragesByDate = new Map<string, number>(); // date -> count of all coverages
          
          assignments.forEach(assignment => {
            const date = assignment.assignment_date;
            const currentCount = coveragesByDate.get(date) || 0;
            coveragesByDate.set(date, currentCount + 1);
          });
          
          // Calculate daily percentage for each day, then average
          // Fórmula: Para cada día del mes:
          //   1. Contar TODAS las coberturas (asignaciones) realizadas ese día (incluye múltiples usos del mismo retén)
          //   2. Calcular porcentaje diario: (coberturas del día / total retenes) × 100
          //      Nota: Puede ser > 100% si un retén se usa múltiples veces en el mismo día
          //   3. Promediar todos los porcentajes diarios del mes (solo días con coberturas)
          const daysInMonth = lastDayOfMonth.getDate();
          const dailyPercentages: number[] = [];
          const dailyDetails: Array<{ date: string; coverages: number; percentage: number }> = [];
          
          // Iterate through each day of the calculation month (all days, since it's a complete month)
          for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(calculationYear, calculationMonth, day);
            const dateStr = currentDate.toISOString().split('T')[0];
            
            // Count all coverages (assignments) for this date
            const coveragesOnDate = coveragesByDate.get(dateStr) || 0;
            // Only include days where retenes were actually used
            if (coveragesOnDate > 0) {
              // Calculate daily percentage: (coberturas del día / total retenes) × 100
              // Esto puede ser > 100% si hay múltiples coberturas del mismo retén
              const dailyPercentage = (coveragesOnDate / totalRetenes) * 100;
              dailyPercentages.push(dailyPercentage);
              dailyDetails.push({
                date: dateStr,
                coverages: coveragesOnDate,
                percentage: dailyPercentage
              });
            } else {
              // Track days without usage for logging
              dailyDetails.push({
                date: dateStr,
                coverages: 0,
                percentage: 0
              });
            }
          }
          
          // Calculate average of daily percentages (only for days with retenes used)
          // Solo promediar los días en los que realmente se utilizaron retenes
          const avgDailyPercentage = dailyPercentages.length > 0
            ? dailyPercentages.reduce((sum, pct) => sum + pct, 0) / dailyPercentages.length
            : 0;
          
          // Log detailed calculation for debugging
          const monthName = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][calculationMonth];
          const daysWithUsage = dailyPercentages.length;
          const daysWithoutUsage = daysInMonth - daysWithUsage;
          const sumOfPercentages = dailyPercentages.reduce((sum, pct) => sum + pct, 0);
          
          console.log('📊 CÁLCULO DE UTILIZACIÓN DE RETENES:');
          console.log(`📅 Mes calculado: ${monthName} ${calculationYear}`);
          console.log(`Total de retenes disponibles: ${totalRetenes}`);
          console.log(`Total de coberturas (asignaciones) en el mes: ${assignments.length}`);
          console.log(`Días totales del mes: ${daysInMonth}`);
          console.log(`Días con coberturas realizadas: ${daysWithUsage}`);
          console.log(`Días sin coberturas: ${daysWithoutUsage}`);
          console.log('\n📅 Detalle por día (solo días con coberturas):');
          dailyDetails.filter(d => d.coverages > 0).forEach(detail => {
            console.log(`  ${detail.date}: ${detail.coverages} coberturas → ${detail.percentage.toFixed(2)}%`);
          });
          if (daysWithoutUsage > 0) {
            console.log(`\n⚠️ Días sin coberturas (${daysWithoutUsage} días excluidos del promedio):`);
            dailyDetails.filter(d => d.coverages === 0).forEach(detail => {
              console.log(`  ${detail.date}: 0 coberturas`);
            });
          }
          console.log(`\n✅ Cálculo del promedio:`);
          console.log(`   Suma de porcentajes diarios (solo días con coberturas): ${sumOfPercentages.toFixed(2)}%`);
          console.log(`   Días con coberturas realizadas: ${daysWithUsage}`);
          console.log(`   Promedio mensual: ${sumOfPercentages.toFixed(2)}% / ${daysWithUsage} = ${avgDailyPercentage.toFixed(2)}%`);
          console.log(`\nℹ️ Nota: El porcentaje puede ser > 100% si un retén se utiliza múltiples veces en el mismo día.`);
          
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
        // Rotación mensual = (nuevos + salidas) / total a inicio de mes
        const rotation = ((newWorkersCount + totalWorkersExited) / totalWorkersAtStart) * 100;
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

  // Chart/Table order state for drag and drop
  type ChartId = 'complianceChart' | 'activityChart' | 'recentActivity' | 'unitsMap';
  const defaultChartOrder: ChartId[] = ['recentActivity', 'unitsMap', 'complianceChart', 'activityChart'];
  
  const [chartOrder, setChartOrder] = useState<ChartId[]>(() => {
    const saved = localStorage.getItem('dashboard-chart-order');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Asegurar que 'unitsMap' esté en el orden (agregarlo si no está)
      if (!parsed.includes('unitsMap')) {
        const updated = ['unitsMap', ...parsed];
        localStorage.setItem('dashboard-chart-order', JSON.stringify(updated));
        return updated;
      }
      return parsed;
    }
    return defaultChartOrder;
  });
  
  const [draggedChart, setDraggedChart] = useState<ChartId | null>(null);
  const [dragOverChart, setDragOverChart] = useState<ChartId | null>(null);
  
  // Save chart order to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('dashboard-chart-order', JSON.stringify(chartOrder));
  }, [chartOrder]);

  // Drag and drop handlers for charts
  const handleChartDragStart = (e: React.DragEvent, chartId: ChartId) => {
    setDraggedChart(chartId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', chartId);
  };

  const handleChartDragOver = (e: React.DragEvent, chartId: ChartId) => {
    // No permitir soltar sobre unitsMap
    if (chartId === 'unitsMap') {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedChart && draggedChart !== chartId) {
      setDragOverChart(chartId);
    }
  };

  const handleChartDragLeave = () => {
    setDragOverChart(null);
  };

  const handleChartDrop = (e: React.DragEvent, targetChartId: ChartId) => {
    e.preventDefault();
    if (!draggedChart || draggedChart === targetChartId) {
      setDraggedChart(null);
      setDragOverChart(null);
      return;
    }
    
    // No permitir mover unitsMap
    if (draggedChart === 'unitsMap' || targetChartId === 'unitsMap') {
      setDraggedChart(null);
      setDragOverChart(null);
      return;
    }

    const newOrder = [...chartOrder];
    const draggedIndex = newOrder.indexOf(draggedChart);
    const targetIndex = newOrder.indexOf(targetChartId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedChart(null);
      setDragOverChart(null);
      return;
    }

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedChart);
    
    // Asegurar que unitsMap esté después de recentActivity
    const mapIndex = newOrder.indexOf('unitsMap');
    const recentIndex = newOrder.indexOf('recentActivity');
    if (mapIndex >= 0 && recentIndex >= 0 && mapIndex !== recentIndex + 1) {
      newOrder.splice(mapIndex, 1);
      newOrder.splice(recentIndex + 1, 0, 'unitsMap');
    }

    setChartOrder(newOrder);
    setDraggedChart(null);
    setDragOverChart(null);
  };

  const handleChartDragEnd = () => {
    setDraggedChart(null);
    setDragOverChart(null);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 animate-in fade-in duration-500">
      <header className="mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Panel General de Operaciones</h1>
        <p className="text-sm md:text-base text-slate-500">Visión global del cumplimiento y estado de unidades.</p>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
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
          <div className="p-2 md:p-3 bg-cyan-100 text-cyan-600 rounded-lg shrink-0">
            <Shield size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Utilización Retenes</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">
              {loadingMetrics ? '...' : `${retenUtilizationRatio.toFixed(1)}%`}
            </p>
            <p className="text-[10px] text-slate-400">Promedio diario del mes anterior</p>
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
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4">
          <div className="p-2 md:p-3 bg-emerald-100 text-emerald-600 rounded-lg shrink-0">
            <TrendingUp size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Rotación Mensual</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">
              {personnelRotation.toFixed(1)}%
            </p>
            <p className="text-[10px] text-slate-400">(Nuevos + Salidas) / Inicio</p>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4">
          <div className="p-2 md:p-3 bg-blue-100 text-blue-600 rounded-lg shrink-0">
            <UserPlus size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Tasa de Ingreso</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">
              {personnelEntryRate.toFixed(1)}%
            </p>
            <p className="text-[10px] text-slate-400">Nuevos / Inicio</p>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4">
          <div className="p-2 md:p-3 bg-red-100 text-red-600 rounded-lg shrink-0">
            <UserMinus size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Tasa de Salida</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">
              {personnelExitRate.toFixed(1)}%
            </p>
            <p className="text-[10px] text-slate-400">Ceses / Inicio</p>
          </div>
        </div>
      </div>

      {/* Charts Area - Draggable */}
      <div className="space-y-4 md:space-y-6">
        {(() => {
          console.log('🗺️ Dashboard - chartOrder:', chartOrder);
          console.log('🗺️ Dashboard - units con coordenadas:', units.filter(u => u.latitude && u.longitude).length);
          return null;
        })()}
        {chartOrder.map((chartId) => {
          console.log('🗺️ Dashboard - Renderizando chartId:', chartId);
          if (chartId === 'complianceChart') {
            return chartData.length > 0 ? (
              <div
                key={chartId}
                draggable
                onDragStart={(e) => handleChartDragStart(e, chartId)}
                onDragOver={(e) => handleChartDragOver(e, chartId)}
                onDragLeave={handleChartDragLeave}
                onDrop={(e) => handleChartDrop(e, chartId)}
                onDragEnd={handleChartDragEnd}
                className={`
                  bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200
                  transition-all duration-200
                  ${draggedChart === chartId ? 'opacity-50 scale-95' : ''}
                  ${dragOverChart === chartId ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
                  hover:shadow-md hover:border-blue-300 cursor-move
                `}
              >
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <h3 className="text-base md:text-lg font-semibold text-slate-800">Cumplimiento del Servicio (Mes Actual)</h3>
                  <GripVertical size={16} className="text-slate-400 opacity-50" />
                </div>
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
              <div
                key={chartId}
                draggable
                onDragStart={(e) => handleChartDragStart(e, chartId)}
                onDragOver={(e) => handleChartDragOver(e, chartId)}
                onDragLeave={handleChartDragLeave}
                onDrop={(e) => handleChartDrop(e, chartId)}
                onDragEnd={handleChartDragEnd}
                className={`
                  bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200
                  transition-all duration-200
                  ${draggedChart === chartId ? 'opacity-50 scale-95' : ''}
                  ${dragOverChart === chartId ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
                  hover:shadow-md hover:border-blue-300 cursor-move
                `}
              >
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <h3 className="text-base md:text-lg font-semibold text-slate-800">Cumplimiento del Servicio</h3>
                  <GripVertical size={16} className="text-slate-400 opacity-50" />
                </div>
                <p className="text-sm md:text-base text-slate-500 text-center py-6 md:py-8">No hay datos de cumplimiento disponibles para mostrar.</p>
              </div>
            );
          }
          
          if (chartId === 'activityChart') {
            return unitsActivityData.length > 0 ? (
              <div
                key={chartId}
                draggable
                onDragStart={(e) => handleChartDragStart(e, chartId)}
                onDragOver={(e) => handleChartDragOver(e, chartId)}
                onDragLeave={handleChartDragLeave}
                onDrop={(e) => handleChartDrop(e, chartId)}
                onDragEnd={handleChartDragEnd}
                className={`
                  bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200
                  transition-all duration-200
                  ${draggedChart === chartId ? 'opacity-50 scale-95' : ''}
                  ${dragOverChart === chartId ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
                  hover:shadow-md hover:border-blue-300 cursor-move
                `}
              >
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <h3 className="text-base md:text-lg font-semibold text-slate-800">Unidades con Mayor Actividad</h3>
                  <GripVertical size={16} className="text-slate-400 opacity-50" />
                </div>
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
              <div
                key={chartId}
                draggable
                onDragStart={(e) => handleChartDragStart(e, chartId)}
                onDragOver={(e) => handleChartDragOver(e, chartId)}
                onDragLeave={handleChartDragLeave}
                onDrop={(e) => handleChartDrop(e, chartId)}
                onDragEnd={handleChartDragEnd}
                className={`
                  bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200
                  transition-all duration-200
                  ${draggedChart === chartId ? 'opacity-50 scale-95' : ''}
                  ${dragOverChart === chartId ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
                  hover:shadow-md hover:border-blue-300 cursor-move
                `}
              >
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <h3 className="text-base md:text-lg font-semibold text-slate-800">Unidades con Mayor Actividad</h3>
                  <GripVertical size={16} className="text-slate-400 opacity-50" />
                </div>
                <p className="text-sm md:text-base text-slate-500 text-center py-6 md:py-8">No hay datos de actividad disponibles para mostrar.</p>
              </div>
            );
          }
          
          if (chartId === 'unitsMap') {
            console.log('🗺️ Dashboard - Renderizando unitsMap con', units.length, 'unidades');
            return (
              <div
                key={chartId}
                className="transition-all duration-200"
              >
                <UnitsMap units={units} onSelectUnit={onSelectUnit} />
              </div>
            );
          }
          
          if (chartId === 'recentActivity') {
            return (
              <div
                key={chartId}
                draggable
                onDragStart={(e) => handleChartDragStart(e, chartId)}
                onDragOver={(e) => handleChartDragOver(e, chartId)}
                onDragLeave={handleChartDragLeave}
                onDrop={(e) => handleChartDrop(e, chartId)}
                onDragEnd={handleChartDragEnd}
                className={`
                  bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200
                  transition-all duration-200
                  ${draggedChart === chartId ? 'opacity-50 scale-95' : ''}
                  ${dragOverChart === chartId ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
                  hover:shadow-md hover:border-blue-300 cursor-move
                `}
              >
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <h3 className="text-base md:text-lg font-semibold text-slate-800">Últimas Actividades Críticas</h3>
                  <GripVertical size={16} className="text-slate-400 opacity-50" />
                </div>
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
            );
          }
          return null;
        })}
      </div>
    </div>
  );
};