import React, { useState, useEffect, useMemo } from 'react';
import { Unit, UnitStatus, ResourceType, UserRole } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { Building2, Users, AlertTriangle, CheckCircle, Sun, Moon, Clock, Shield, UserPlus, Activity, FileText, TrendingUp, UserMinus, GripVertical, Star, UserX } from 'lucide-react';
import { UnitsMap } from './UnitsMap';

interface DashboardProps {
  units: Unit[];
  onSelectUnit: (unitId: string) => void;
  currentUserRole?: UserRole;
}

export const Dashboard: React.FC<DashboardProps> = ({ units, onSelectUnit, currentUserRole }) => {
  const isClient = currentUserRole === 'CLIENT';
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
  const [mostUsedReten, setMostUsedReten] = useState<{ name: string; count: number } | null>(null);
  const [workersExitedThisMonth, setWorkersExitedThisMonth] = useState<number>(0);
  const [archivedPersonnel, setArchivedPersonnel] = useState<any[]>([]);
  // Estados para almacenar valores intermedios de cálculos para tooltips
  const [totalWorkersBreakdown, setTotalWorkersBreakdown] = useState<{ unique: number; shared: number }>({ unique: 0, shared: 0 });
  const [workersAtStart, setWorkersAtStart] = useState<number>(0);
  const [retenMetrics, setRetenMetrics] = useState<{ totalRetenes: number; assignments: number; month: string } | null>(null);
  const [utilizationDetails, setUtilizationDetails] = useState<{ sumPercentages: number; daysWithUsage: number; totalDays: number } | null>(null);
  const [shiftBreakdown, setShiftBreakdown] = useState<{ day: { unique: number; shared: number }; afternoon: { unique: number; shared: number }; night: { unique: number; shared: number } }>({
    day: { unique: 0, shared: 0 },
    afternoon: { unique: 0, shared: 0 },
    night: { unique: 0, shared: 0 }
  });
  const [newWorkersBreakdown, setNewWorkersBreakdown] = useState<{ unique: number; shared: number; month: string }>({ unique: 0, shared: 0, month: '' });
  const [rotationDetails, setRotationDetails] = useState<{ nuevos: number; salidas: number; inicio: number } | null>(null);
  const [entryRateDetails, setEntryRateDetails] = useState<{ nuevos: number; inicio: number } | null>(null);
  const [exitRateDetails, setExitRateDetails] = useState<{ salidas: number; inicio: number; deUnidades: number; archivados: number } | null>(null);
  

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

    // Guardar breakdown para tooltip
    setTotalWorkersBreakdown({ unique: uniqueCount, shared: sharedCount });

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
    const shiftBreakdownData = {
      day: { unique: 0, shared: 0 },
      afternoon: { unique: 0, shared: 0 },
      night: { unique: 0, shared: 0 }
    };

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
                if (shiftType === 'day') {
                  dayCount++;
                  shiftBreakdownData.day.shared++;
                } else if (shiftType === 'afternoon') {
                  afternoonCount++;
                  shiftBreakdownData.afternoon.shared++;
                } else if (shiftType === 'night') {
                  nightCount++;
                  shiftBreakdownData.night.shared++;
                }
              }
            } else {
              // Trabajador único: contar en cada unidad
              if (shiftType === 'day') {
                dayCount++;
                shiftBreakdownData.day.unique++;
              } else if (shiftType === 'afternoon') {
                afternoonCount++;
                shiftBreakdownData.afternoon.unique++;
              } else if (shiftType === 'night') {
                nightCount++;
                shiftBreakdownData.night.unique++;
              }
            }
          }
        });
    });

    // Guardar breakdown para tooltips
    setShiftBreakdown(shiftBreakdownData);

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
          setMostUsedReten(null);
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
        
        // Calculate most used reten in the current month
        const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const currentMonthStartStr = currentMonthStart.toISOString().split('T')[0];
        const currentMonthEndStr = currentMonthEnd.toISOString().split('T')[0];
        
        const currentMonthAssignments = await retenesService.getAssignmentsByDateRange(currentMonthStartStr, currentMonthEndStr);
        
        if (currentMonthAssignments.length > 0) {
          // Count assignments by reten
          const retenCounts = new Map<string, { name: string; count: number }>();
          
          currentMonthAssignments.forEach(assignment => {
            const retenId = assignment.reten_id;
            const retenName = assignment.reten_name || 'Desconocido';
            
            if (!retenCounts.has(retenId)) {
              retenCounts.set(retenId, { name: retenName, count: 0 });
            }
            const current = retenCounts.get(retenId)!;
            retenCounts.set(retenId, { name: current.name, count: current.count + 1 });
          });
          
          // Find the most used reten
          let mostUsed: { name: string; count: number } | null = null;
          retenCounts.forEach((value) => {
            if (!mostUsed || value.count > mostUsed.count) {
              mostUsed = value;
            }
          });
          
          setMostUsedReten(mostUsed);
        } else {
          setMostUsedReten(null);
        }
        
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
          // Guardar detalles para tooltip
          setUtilizationDetails({
            sumPercentages: sumOfPercentages,
            daysWithUsage: daysWithUsage,
            totalDays: daysInMonth
          });
        } else {
          setRetenUtilizationRatio(0);
        }
      } catch (error) {
        console.error('Error loading reten metrics:', error);
      }
    };

    loadRetenMetrics();
  }, []);

  // Cargar trabajadores archivados para el cálculo de salientes
  useEffect(() => {
    const loadArchivedPersonnel = async () => {
      try {
        const { resourcesService } = await import('../services/resourcesService');
        const archived = await resourcesService.getAllArchivedPersonnel();
        setArchivedPersonnel(archived);
        console.log('📊 Trabajadores archivados cargados:', archived.length);
        // Debug: mostrar trabajadores con endDate en enero 2026
        const jan2026Workers = archived.filter(p => {
          if (!p.endDate) return false;
          const endDateStr = p.endDate.split('T')[0];
          return endDateStr.startsWith('2026-01-');
        });
        console.log('📊 Trabajadores archivados con endDate en enero 2026:', jan2026Workers.length, jan2026Workers.map(p => ({ name: p.name, endDate: p.endDate })));
      } catch (error) {
        console.error('Error al cargar trabajadores archivados:', error);
      }
    };
    loadArchivedPersonnel();
  }, []);

  // Note: setLoadingMetrics(false) is now handled in loadShiftMetrics finally block

  // Calculate new workers this month (sin duplicar compartidos)
  const newWorkersCount = useMemo(() => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const sharedNewWorkers = new Set<string>(); // Para trabajadores compartidos nuevos
    let uniqueNewCount = 0;
    let sharedNewCount = 0;
    const monthName = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][today.getMonth()];
    
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
    
    // Guardar breakdown para tooltip
    setNewWorkersBreakdown({ unique: uniqueNewCount, shared: sharedNewCount, month: monthName });
    
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
      setWorkersAtStart(totalWorkersAtStart);
      
      // Calculate workers who left during the month (endDate in the current month OR archived/cesado this month)
      const sharedWorkersExited = new Set<string>();
      let uniqueWorkersExited = 0;
      let sharedWorkersExitedCount = 0;
      
      units.forEach(unit => {
        unit.resources
          .filter(r => {
            if (r.type !== ResourceType.PERSONNEL) return false;
            
            // Incluir trabajadores cesados o archivados
            const isCesadoOrArchivado = r.personnelStatus === 'cesado' || r.personnelStatus === 'archivado' || r.archived;
            
            if (!isCesadoOrArchivado) return false;
            if (!r.endDate) return false;
            
            // Parsear la fecha de forma segura
            const endDateStr = r.endDate.split('T')[0]; // YYYY-MM-DD
            const [year, month, day] = endDateStr.split('-').map(Number);
            const endDate = new Date(year, month - 1, day);
            
            // Comparar solo las fechas (sin hora)
            const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            const firstDayOnly = new Date(firstDayOfMonth.getFullYear(), firstDayOfMonth.getMonth(), firstDayOfMonth.getDate());
            const lastDayOnly = new Date(lastDayOfMonth.getFullYear(), lastDayOfMonth.getMonth(), lastDayOfMonth.getDate());
            
            // Worker left during the month if endDate is between firstDayOfMonth and lastDayOfMonth
            return endDateOnly >= firstDayOnly && endDateOnly <= lastDayOnly;
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
      
      // También contar trabajadores archivados que ya no están en unidades activas
      // Usar las mismas fechas del mes que se calcularon arriba (firstDayOfMonth y lastDayOfMonth ya están definidas)
      let archivedExitedThisMonth = 0;
      const archivedWorkersSet = new Set<string>(); // Para evitar duplicados con trabajadores en unidades activas
      
      archivedPersonnel.forEach(personnel => {
        if (personnel.endDate) {
          // Parsear la fecha de forma segura
          const endDateStr = personnel.endDate.split('T')[0]; // YYYY-MM-DD
          const [year, month, day] = endDateStr.split('-').map(Number);
          const endDate = new Date(year, month - 1, day);
          
          // Comparar solo las fechas (sin hora)
          const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          const firstDayOnly = new Date(firstDayOfMonth.getFullYear(), firstDayOfMonth.getMonth(), firstDayOfMonth.getDate());
          const lastDayOnly = new Date(lastDayOfMonth.getFullYear(), lastDayOfMonth.getMonth(), lastDayOfMonth.getDate());
          
          // Contar si la fecha de cese está en el mes actual
          if (endDateOnly >= firstDayOnly && endDateOnly <= lastDayOnly) {
            // Usar DNI o nombre como identificador único para evitar duplicados
            const identifier = personnel.dni || personnel.id || personnel.name;
            if (!archivedWorkersSet.has(identifier)) {
              archivedWorkersSet.add(identifier);
              archivedExitedThisMonth++;
            }
          }
        }
      });
      
      const totalWorkersExited = uniqueWorkersExited + sharedWorkersExitedCount + archivedExitedThisMonth;
      const workersExitedFromUnits = uniqueWorkersExited + sharedWorkersExitedCount;
      
      // Debug: mostrar conteo
      console.log('📊 Trabajadores salientes calculados:', {
        deUnidadesActivas: workersExitedFromUnits,
        archivados: archivedExitedThisMonth,
        total: totalWorkersExited,
        mes: `${firstDayOfMonth.getFullYear()}-${String(firstDayOfMonth.getMonth() + 1).padStart(2, '0')}`,
        rangoFechas: `${firstDayOfMonth.toISOString().split('T')[0]} a ${lastDayOfMonth.toISOString().split('T')[0]}`
      });
      
      // Set workers exited this month
      setWorkersExitedThisMonth(totalWorkersExited);
      
      // Calculate metrics
      if (totalWorkersAtStart > 0) {
        // Rotación mensual = (nuevos + salidas) / total a inicio de mes
        const rotation = ((newWorkersCount + totalWorkersExited) / totalWorkersAtStart) * 100;
        setPersonnelRotation(rotation);
        setRotationDetails({ nuevos: newWorkersCount, salidas: totalWorkersExited, inicio: totalWorkersAtStart });
        
        // Tasa de ingreso = nuevos / total a inicio de mes
        const entryRate = (newWorkersCount / totalWorkersAtStart) * 100;
        setPersonnelEntryRate(entryRate);
        setEntryRateDetails({ nuevos: newWorkersCount, inicio: totalWorkersAtStart });
        
        // Tasa de salida = ceses / total a inicio de mes
        const exitRate = (totalWorkersExited / totalWorkersAtStart) * 100;
        setPersonnelExitRate(exitRate);
        setExitRateDetails({ salidas: totalWorkersExited, inicio: totalWorkersAtStart, deUnidades: workersExitedFromUnits, archivados: archivedExitedThisMonth });
      } else {
        setPersonnelRotation(0);
        setPersonnelEntryRate(0);
        setPersonnelExitRate(0);
        setRotationDetails(null);
        setEntryRateDetails(null);
        setExitRateDetails(null);
      }
    };
    
    calculatePersonnelRotation();
  }, [units, newWorkersCount, archivedPersonnel]);

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
        <div 
          className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
          title={`Total: ${totalUnits} unidades registradas`}
        >
          <div className="p-2 md:p-3 bg-blue-100 text-blue-600 rounded-lg shrink-0">
            <Building2 size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Unidades Totales</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{totalUnits}</p>
          </div>
        </div>
        <div 
          className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
          title={`${activeUnits} de ${totalUnits} unidades tienen estado 'Activo'`}
        >
          <div className="p-2 md:p-3 bg-green-100 text-green-600 rounded-lg shrink-0">
            <CheckCircle size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Unidades Operativas</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{activeUnits}</p>
          </div>
        </div>
        <div 
          className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
          title={`Total: ${totalWorkers} trabajadores (${totalWorkersBreakdown.unique} únicos + ${totalWorkersBreakdown.shared} compartidos sin duplicar)`}
        >
          <div className="p-2 md:p-3 bg-purple-100 text-purple-600 rounded-lg shrink-0">
            <Users size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Total Trabajadores</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{totalWorkers}</p>
          </div>
        </div>
        <div 
          className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
          title={`${issueUnits} de ${totalUnits} unidades tienen estado 'Con Incidencias'`}
        >
          <div className="p-2 md:p-3 bg-red-100 text-red-600 rounded-lg shrink-0">
            <AlertTriangle size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Con Incidencias</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{issueUnits}</p>
          </div>
        </div>
        <div 
          className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
          title={`Total: ${workersByShift.day} trabajadores (${shiftBreakdown.day.unique} únicos + ${shiftBreakdown.day.shared} compartidos)`}
        >
          <div className="p-2 md:p-3 bg-yellow-100 text-yellow-600 rounded-lg shrink-0">
            <Sun size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Turno Día</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{loadingMetrics ? '...' : workersByShift.day}</p>
          </div>
        </div>
        <div 
          className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
          title={`Total: ${workersByShift.afternoon} trabajadores (${shiftBreakdown.afternoon.unique} únicos + ${shiftBreakdown.afternoon.shared} compartidos)`}
        >
          <div className="p-2 md:p-3 bg-orange-100 text-orange-600 rounded-lg shrink-0">
            <Clock size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Turno Tarde</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{loadingMetrics ? '...' : workersByShift.afternoon}</p>
          </div>
        </div>
        <div 
          className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
          title={`Total: ${workersByShift.night} trabajadores (${shiftBreakdown.night.unique} únicos + ${shiftBreakdown.night.shared} compartidos)`}
        >
          <div className="p-2 md:p-3 bg-indigo-100 text-indigo-600 rounded-lg shrink-0">
            <Moon size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Turno Noche</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{loadingMetrics ? '...' : workersByShift.night}</p>
          </div>
        </div>
        {!isClient && (
          <div 
            className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
            title={retenMetrics ? `${retenMetrics.assignments} asignaciones en ${retenMetrics.month} (${retenMetrics.totalRetenes} retenes disponibles)` : 'Cargando...'}
          >
            <div className="p-2 md:p-3 bg-teal-100 text-teal-600 rounded-lg shrink-0">
              <Shield size={20} className="md:w-6 md:h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs md:text-sm font-medium text-slate-500">Coberturas Retenes</p>
              <p className="text-xl md:text-2xl font-bold text-slate-800">{loadingMetrics ? '...' : retenCoverages}</p>
            </div>
          </div>
        )}
        {!isClient && (
          <div 
            className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
            title={utilizationDetails && retenMetrics ? `Promedio: ${utilizationDetails.sumPercentages.toFixed(2)}% / ${utilizationDetails.daysWithUsage} días = ${retenUtilizationRatio.toFixed(1)}% (${utilizationDetails.daysWithUsage} de ${utilizationDetails.totalDays} días con coberturas, ${retenMetrics.totalRetenes} retenes disponibles)` : 'Cargando...'}
          >
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
        )}
        <div 
          className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
          title={`${newWorkersThisMonth} trabajadores nuevos en ${newWorkersBreakdown.month} (${newWorkersBreakdown.unique} únicos + ${newWorkersBreakdown.shared} compartidos)`}
        >
          <div className="p-2 md:p-3 bg-pink-100 text-pink-600 rounded-lg shrink-0">
            <UserPlus size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Nuevos este Mes</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">{newWorkersThisMonth}</p>
          </div>
        </div>
        <div 
          className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
          title={rotationDetails ? `Rotación: (${rotationDetails.nuevos} nuevos + ${rotationDetails.salidas} salidas) / ${rotationDetails.inicio} inicio = ${personnelRotation.toFixed(1)}%` : 'Cargando...'}
        >
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
        <div 
          className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
          title={entryRateDetails ? `Tasa de ingreso: ${entryRateDetails.nuevos} nuevos / ${entryRateDetails.inicio} inicio = ${personnelEntryRate.toFixed(1)}%` : 'Cargando...'}
        >
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
        <div 
          className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
          title={exitRateDetails ? `Tasa de salida: ${exitRateDetails.salidas} salidas (${exitRateDetails.deUnidades} de unidades + ${exitRateDetails.archivados} archivados) / ${exitRateDetails.inicio} inicio = ${personnelExitRate.toFixed(1)}%` : 'Cargando...'}
        >
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
        {!isClient && (
          <div 
            className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
            title={mostUsedReten ? `Retén más usado: ${mostUsedReten.name} con ${mostUsedReten.count} ${mostUsedReten.count === 1 ? 'asignación' : 'asignaciones'} en el mes actual` : 'Sin datos'}
          >
            <div className="p-2 md:p-3 bg-amber-100 text-amber-600 rounded-lg shrink-0">
              <Star size={20} className="md:w-6 md:h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs md:text-sm font-medium text-slate-500">Retén Más Usado</p>
              <p className="text-xl md:text-2xl font-bold text-slate-800 truncate">
                {loadingMetrics ? '...' : mostUsedReten ? mostUsedReten.name : 'N/A'}
              </p>
              <p className="text-[10px] text-slate-400">
                {mostUsedReten ? `${mostUsedReten.count} ${mostUsedReten.count === 1 ? 'vez' : 'veces'}` : 'Sin datos'}
              </p>
            </div>
          </div>
        )}
        <div 
          className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-3 md:space-x-4 cursor-help"
          title={exitRateDetails ? `${workersExitedThisMonth} trabajadores salientes este mes (${exitRateDetails.deUnidades} de unidades activas + ${exitRateDetails.archivados} archivados)` : `${workersExitedThisMonth} trabajadores salientes este mes`}
        >
          <div className="p-2 md:p-3 bg-rose-100 text-rose-600 rounded-lg shrink-0">
            <UserX size={20} className="md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-slate-500">Trabajadores Salientes</p>
            <p className="text-xl md:text-2xl font-bold text-slate-800">
              {workersExitedThisMonth}
            </p>
            <p className="text-[10px] text-slate-400">Este mes</p>
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
        
        {/* Layout especial para mapa y actividades recientes lado a lado */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Mapa - siempre en la columna izquierda */}
          <div className="transition-all duration-200">
            <UnitsMap units={units} onSelectUnit={onSelectUnit} />
          </div>
          
          {/* Actividades recientes - siempre en la columna derecha */}
          <div
            draggable
            onDragStart={(e) => handleChartDragStart(e, 'recentActivity')}
            onDragOver={(e) => handleChartDragOver(e, 'recentActivity')}
            onDragLeave={handleChartDragLeave}
            onDrop={(e) => handleChartDrop(e, 'recentActivity')}
            onDragEnd={handleChartDragEnd}
            className={`
              bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200
              transition-all duration-200
              ${draggedChart === 'recentActivity' ? 'opacity-50 scale-95' : ''}
              ${dragOverChart === 'recentActivity' ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
              hover:shadow-md hover:border-blue-300 cursor-move
            `}
          >
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h3 className="text-base md:text-lg font-semibold text-slate-800">Últimas Actividades Críticas</h3>
              <GripVertical size={16} className="text-slate-400 opacity-50" />
            </div>
            <div className="space-y-2 md:space-y-3 max-h-[600px] overflow-y-auto">
              {units.flatMap(u => u.logs.map(l => ({...l, unitName: u.name}))).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10).map(log => (
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
              {units.flatMap(u => u.logs.map(l => ({...l, unitName: u.name}))).length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">No hay actividades recientes para mostrar.</p>
              )}
            </div>
          </div>
        </div>
        
        {/* Resto de los gráficos en layout vertical */}
        {chartOrder.map((chartId) => {
          console.log('🗺️ Dashboard - Renderizando chartId:', chartId);
          
          // Saltar mapa y actividades recientes ya que se renderizaron arriba
          if (chartId === 'unitsMap' || chartId === 'recentActivity') {
            return null;
          }
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
          
          return null;
        })}
      </div>
    </div>
  );
};