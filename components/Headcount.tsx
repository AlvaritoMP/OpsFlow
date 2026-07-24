import React, { useState, useEffect, useMemo } from 'react';
import { Unit, Resource, ResourceType, Position } from '../types';
import { positionsService } from '../services/positionsService';
import { retenesService, RetenAssignment } from '../services/retenesService';
import { Users, Briefcase, Building, X, Filter } from 'lucide-react';

interface HeadcountProps {
  units: Unit[];
}

type ShiftKey = 'Day' | 'Afternoon' | 'Night';

interface ShiftBreakdown {
  Day: number;
  Afternoon: number;
  Night: number;
  unassigned: number;
}

interface HeadcountRow {
  unitId: string;
  unitName: string;
  clientName?: string;
  positionId: string;
  positionName: string;
  rq: number;
  requiredByShift: ShiftBreakdown;
  activos: number;
  activosByShift: ShiftBreakdown;
  porCubrir: number;
  vacantByShift: ShiftBreakdown;
  turnover: number;
  isFirstInUnit: boolean;
  unitRowSpan: number;
}

const emptyShiftBreakdown = (): ShiftBreakdown => ({
  Day: 0,
  Afternoon: 0,
  Night: 0,
  unassigned: 0,
});

const normalizeShift = (shift: string): ShiftKey | null => {
  const lower = shift.toLowerCase();
  if (lower.includes('day') || lower.includes('mañana') || lower.includes('diurno') || lower.includes('morning')) {
    return 'Day';
  }
  if (lower.includes('afternoon') || lower.includes('tarde') || lower.includes('vespertino')) {
    return 'Afternoon';
  }
  if (lower.includes('night') || lower.includes('noche') || lower.includes('nocturno')) {
    return 'Night';
  }
  return null;
};

const getWorkerShift = (worker: Resource): string | undefined => {
  if (worker.assignedShift) return worker.assignedShift;

  if (worker.workSchedule && worker.workSchedule.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const todayShift = worker.workSchedule.find(s => s.date === today);
    if (todayShift && todayShift.type !== 'OFF' && todayShift.type !== 'Vacation' && todayShift.type !== 'Sick') {
      return todayShift.type;
    }
  }

  return undefined;
};

const matchesPosition = (worker: Resource, positionId: string, positionName: string): boolean => {
  return worker.puesto === positionName || worker.puesto === positionId;
};

const formatCurrency = (value: number): string => {
  if (!value) return '—';
  return `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const cellNum = (value: number, showZero = true): string => {
  if (!value && !showZero) return '';
  return String(value || 0);
};

export const Headcount: React.FC<HeadcountProps> = ({ units }) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [todayRetenes, setTodayRetenes] = useState<RetenAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [showFilter, setShowFilter] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const [positionsData, retenAssignments] = await Promise.all([
        positionsService.getAll(true),
        retenesService.getAssignmentsByDateRange(today, today),
      ]);
      setPositions(positionsData);
      setTodayRetenes(
        retenAssignments.filter(a => a.status !== 'cancelada')
      );
    } catch (error: any) {
      console.error('❌ Headcount - Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUnits = useMemo(() => {
    if (selectedUnitIds.length === 0) return units;
    return units.filter(u => selectedUnitIds.includes(u.id));
  }, [units, selectedUnitIds]);

  const retenByUnit = useMemo(() => {
    const map = new Map<string, { names: string[]; count: number }>();
    todayRetenes.forEach(a => {
      const existing = map.get(a.unit_id) || { names: [], count: 0 };
      if (a.reten_name && !existing.names.includes(a.reten_name)) {
        existing.names.push(a.reten_name);
      }
      existing.count += 1;
      map.set(a.unit_id, existing);
    });
    return map;
  }, [todayRetenes]);

  // Tabla principal: una fila por UNIDAD × CARGO (turnos pivotados)
  const tableRows = useMemo((): HeadcountRow[] => {
    const rows: HeadcountRow[] = [];

    const sortedUnits = [...filteredUnits].sort((a, b) => a.name.localeCompare(b.name));

    sortedUnits.forEach(unit => {
      const requiredPositions = unit.requiredPositions || [];
      const personnel = (unit.resources || []).filter(
        r => r.type === ResourceType.PERSONNEL && r.personnelStatus !== 'cesado' && !r.archived
      );

      // Agrupar requerimientos por puesto
      const byPosition = new Map<string, {
        positionId: string;
        positionName: string;
        requiredByShift: ShiftBreakdown;
        rq: number;
      }>();

      requiredPositions.forEach(reqPos => {
        const positionName =
          reqPos.positionName ||
          positions.find(p => p.id === reqPos.positionId)?.name ||
          'Desconocido';
        const key = reqPos.positionId;
        if (!byPosition.has(key)) {
          byPosition.set(key, {
            positionId: reqPos.positionId,
            positionName,
            requiredByShift: emptyShiftBreakdown(),
            rq: 0,
          });
        }
        const entry = byPosition.get(key)!;
        entry.rq += reqPos.quantity;
        const shift = reqPos.shift ? normalizeShift(reqPos.shift) : null;
        if (shift) {
          entry.requiredByShift[shift] += reqPos.quantity;
        } else {
          entry.requiredByShift.unassigned += reqPos.quantity;
        }
      });

      const positionEntries = Array.from(byPosition.values()).sort((a, b) =>
        a.positionName.localeCompare(b.positionName)
      );

      positionEntries.forEach((entry, index) => {
        const matching = personnel.filter(p =>
          matchesPosition(p, entry.positionId, entry.positionName)
        );

        const activosByShift = emptyShiftBreakdown();
        let turnover = 0;

        matching.forEach(p => {
          turnover += (p.monthlySalary || 0) + (p.workConditionAmount || 0);
          const workerShift = getWorkerShift(p);
          const normalized = workerShift ? normalizeShift(workerShift) : null;
          if (normalized) {
            activosByShift[normalized] += 1;
          } else {
            activosByShift.unassigned += 1;
          }
        });

        const activos = matching.length;
        const porCubrir = Math.max(0, entry.rq - activos);

        // Vacantes por turno: requerido del turno − activos del turno
        const vacantByShift = emptyShiftBreakdown();
        (['Day', 'Afternoon', 'Night'] as ShiftKey[]).forEach(shift => {
          vacantByShift[shift] = Math.max(
            0,
            entry.requiredByShift[shift] - activosByShift[shift]
          );
        });
        vacantByShift.unassigned = Math.max(
          0,
          entry.requiredByShift.unassigned - activosByShift.unassigned
        );

        rows.push({
          unitId: unit.id,
          unitName: unit.name,
          clientName: unit.clientName,
          positionId: entry.positionId,
          positionName: entry.positionName,
          rq: entry.rq,
          requiredByShift: entry.requiredByShift,
          activos,
          activosByShift,
          porCubrir,
          vacantByShift,
          turnover,
          isFirstInUnit: index === 0,
          unitRowSpan: positionEntries.length,
        });
      });
    });

    return rows;
  }, [filteredUnits, positions]);

  const totals = useMemo(() => {
    const shiftReq = emptyShiftBreakdown();
    const shiftVacant = emptyShiftBreakdown();
    let rq = 0;
    let activos = 0;
    let porCubrir = 0;
    let turnover = 0;

    tableRows.forEach(row => {
      rq += row.rq;
      activos += row.activos;
      porCubrir += row.porCubrir;
      turnover += row.turnover;
      (['Day', 'Afternoon', 'Night'] as ShiftKey[]).forEach(s => {
        shiftReq[s] += row.requiredByShift[s];
        shiftVacant[s] += row.vacantByShift[s];
      });
      shiftReq.unassigned += row.requiredByShift.unassigned;
      shiftVacant.unassigned += row.vacantByShift.unassigned;
    });

    return { rq, activos, porCubrir, turnover, shiftReq, shiftVacant };
  }, [tableRows]);

  // Resumen por puesto (agregado global)
  const positionSummary = useMemo(() => {
    const map = new Map<string, {
      positionName: string;
      rq: number;
      activos: number;
      porCubrir: number;
      requiredByShift: ShiftBreakdown;
      vacantByShift: ShiftBreakdown;
    }>();

    tableRows.forEach(row => {
      if (!map.has(row.positionId)) {
        map.set(row.positionId, {
          positionName: row.positionName,
          rq: 0,
          activos: 0,
          porCubrir: 0,
          requiredByShift: emptyShiftBreakdown(),
          vacantByShift: emptyShiftBreakdown(),
        });
      }
      const item = map.get(row.positionId)!;
      item.rq += row.rq;
      item.activos += row.activos;
      item.porCubrir += row.porCubrir;
      (['Day', 'Afternoon', 'Night'] as ShiftKey[]).forEach(s => {
        item.requiredByShift[s] += row.requiredByShift[s];
        item.vacantByShift[s] += row.vacantByShift[s];
      });
    });

    return Array.from(map.values()).sort((a, b) =>
      a.positionName.localeCompare(b.positionName)
    );
  }, [tableRows]);

  // Resumen por unidad
  const unitSummary = useMemo(() => {
    const map = new Map<string, {
      unitId: string;
      unitName: string;
      clientName?: string;
      rq: number;
      activos: number;
      porCubrir: number;
      turnover: number;
      requiredByShift: ShiftBreakdown;
      vacantByShift: ShiftBreakdown;
    }>();

    tableRows.forEach(row => {
      if (!map.has(row.unitId)) {
        map.set(row.unitId, {
          unitId: row.unitId,
          unitName: row.unitName,
          clientName: row.clientName,
          rq: 0,
          activos: 0,
          porCubrir: 0,
          turnover: 0,
          requiredByShift: emptyShiftBreakdown(),
          vacantByShift: emptyShiftBreakdown(),
        });
      }
      const item = map.get(row.unitId)!;
      item.rq += row.rq;
      item.activos += row.activos;
      item.porCubrir += row.porCubrir;
      item.turnover += row.turnover;
      (['Day', 'Afternoon', 'Night'] as ShiftKey[]).forEach(s => {
        item.requiredByShift[s] += row.requiredByShift[s];
        item.vacantByShift[s] += row.vacantByShift[s];
      });
    });

    return Array.from(map.values()).sort((a, b) =>
      a.unitName.localeCompare(b.unitName)
    );
  }, [tableRows]);

  // Estado del día (personal): descanso / falta / vacaciones
  const dayStatusSummary = useMemo(() => {
    let descanso = 0;
    let falta = 0;
    let vacaciones = 0;
    const today = new Date().toISOString().split('T')[0];

    filteredUnits.forEach(unit => {
      const personnel = (unit.resources || []).filter(
        r => r.type === ResourceType.PERSONNEL && r.personnelStatus !== 'cesado' && !r.archived
      );
      personnel.forEach(p => {
        const todayShift = p.workSchedule?.find(s => s.date === today);
        if (!todayShift) return;
        if (todayShift.type === 'OFF') descanso += 1;
        else if (todayShift.type === 'Sick') falta += 1;
        else if (todayShift.type === 'Vacation') vacaciones += 1;
      });
    });

    return { descanso, falta, vacaciones, retenesHoy: todayRetenes.length };
  }, [filteredUnits, todayRetenes]);

  const coveragePercentage =
    totals.rq > 0 ? (totals.activos / totals.rq) * 100 : 0;

  const toggleUnitSelection = (unitId: string) => {
    setSelectedUnitIds(prev =>
      prev.includes(unitId) ? prev.filter(id => id !== unitId) : [...prev, unitId]
    );
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-slate-500">Cargando información de Headcount...</p>
        </div>
      </div>
    );
  }

  const thBase = 'px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-center whitespace-nowrap border border-slate-300';
  const tdBase = 'px-2 py-1.5 text-xs text-center border border-slate-200 whitespace-nowrap';

  return (
    <div className="p-4 md:p-6 space-y-5 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center">
            <Users className="mr-2" size={24} /> Headcount
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Conciliación de puestos requeridos vs activos — vista tabular
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowFilter(v => !v)}
          className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
            showFilter || selectedUnitIds.length > 0
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Filter size={16} />
          Filtrar unidades
          {selectedUnitIds.length > 0 && (
            <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
              {selectedUnitIds.length}
            </span>
          )}
        </button>
      </div>

      {/* KPIs compactos */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">RQ Total</p>
          <p className="text-xl font-bold text-slate-800">{totals.rq}</p>
        </div>
        <div className="bg-amber-50 rounded-lg border border-amber-200 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-amber-700">Activos</p>
          <p className="text-xl font-bold text-amber-800">{totals.activos}</p>
        </div>
        <div className="bg-orange-50 rounded-lg border border-orange-200 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-orange-700">Por cubrir</p>
          <p className="text-xl font-bold text-orange-800">{totals.porCubrir}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Cobertura</p>
          <p className={`text-xl font-bold ${
            coveragePercentage >= 100 ? 'text-green-600' : coveragePercentage >= 80 ? 'text-amber-600' : 'text-red-600'
          }`}>
            {coveragePercentage.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Turnover (salarios)</p>
          <p className="text-lg font-bold text-slate-800">{formatCurrency(totals.turnover)}</p>
        </div>
      </div>

      {/* Filtro de unidades */}
      {showFilter && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex justify-between items-center mb-3">
            <label className="block text-sm font-medium text-slate-700">Unidades</label>
            <div className="flex gap-2">
              {selectedUnitIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedUnitIds([])}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center"
                >
                  <X size={14} className="mr-1" /> Limpiar
                </button>
              )}
              {selectedUnitIds.length < units.length && (
                <button
                  type="button"
                  onClick={() => setSelectedUnitIds(units.map(u => u.id))}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Seleccionar todas
                </button>
              )}
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
            {units.map(unit => (
              <label
                key={unit.id}
                className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedUnitIds.includes(unit.id)}
                  onChange={() => toggleUnitSelection(unit.id)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700 truncate">{unit.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ========== TABLA PRINCIPAL (estilo Excel) ========== */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="font-bold text-slate-700 flex items-center text-sm">
            <Users className="mr-2" size={16} /> Detalle Headcount por Unidad / Cargo
          </h3>
          <span className="text-xs text-slate-500">{tableRows.length} filas</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-slate-800">
            <thead>
              {/* Fila de grupos */}
              <tr className="bg-[#1e3a5f] text-white">
                <th rowSpan={2} className={`${thBase} text-left min-w-[160px]`}>Unidad</th>
                <th rowSpan={2} className={`${thBase} text-left min-w-[140px]`}>Cargo</th>
                <th rowSpan={2} className={`${thBase} min-w-[44px]`}>RQ</th>
                <th colSpan={3} className={`${thBase} bg-[#254a73]`}>Turnos (RQ)</th>
                <th rowSpan={2} className={`${thBase} min-w-[100px]`}>Turnover</th>
                <th rowSpan={2} className={`${thBase} bg-amber-400 text-amber-950 min-w-[56px]`}>Activos</th>
                <th rowSpan={2} className={`${thBase} bg-orange-400 text-orange-950 min-w-[64px]`}>Por cubrir</th>
                <th colSpan={3} className={`${thBase} bg-orange-300 text-orange-950`}>Turnos por cubrir</th>
                <th colSpan={2} className={`${thBase} bg-slate-600`}>Retén del día</th>
              </tr>
              <tr className="bg-[#254a73] text-white">
                <th className={thBase}>Mañana</th>
                <th className={thBase}>Tarde</th>
                <th className={thBase}>Noche</th>
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Mañana</th>
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Tarde</th>
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Noche</th>
                <th className={`${thBase} bg-slate-500`}>Nombre</th>
                <th className={`${thBase} bg-slate-500 min-w-[40px]`}>#</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-6 py-10 text-center text-slate-400 text-sm">
                    No hay puestos requeridos definidos en las unidades seleccionadas
                  </td>
                </tr>
              ) : (
                tableRows.map((row, idx) => {
                  const reten = retenByUnit.get(row.unitId);
                  const alt = idx % 2 === 1;
                  return (
                    <tr
                      key={`${row.unitId}_${row.positionId}`}
                      className={alt ? 'bg-slate-50/80 hover:bg-blue-50/40' : 'bg-white hover:bg-blue-50/40'}
                    >
                      {row.isFirstInUnit && (
                        <td
                          rowSpan={row.unitRowSpan}
                          className={`${tdBase} text-left font-semibold text-slate-800 align-top bg-slate-50 max-w-[200px]`}
                        >
                          <div className="whitespace-normal leading-snug">{row.unitName}</div>
                          {row.clientName && (
                            <div className="text-[10px] text-slate-400 font-normal mt-0.5">{row.clientName}</div>
                          )}
                        </td>
                      )}
                      <td className={`${tdBase} text-left font-medium`}>{row.positionName}</td>
                      <td className={`${tdBase} font-semibold`}>{row.rq}</td>
                      <td className={tdBase}>{cellNum(row.requiredByShift.Day, false) || '—'}</td>
                      <td className={tdBase}>{cellNum(row.requiredByShift.Afternoon, false) || '—'}</td>
                      <td className={tdBase}>{cellNum(row.requiredByShift.Night, false) || '—'}</td>
                      <td className={`${tdBase} text-right tabular-nums`}>{formatCurrency(row.turnover)}</td>
                      <td className={`${tdBase} bg-amber-100 font-bold text-amber-900`}>{row.activos}</td>
                      <td className={`${tdBase} bg-orange-100 font-bold ${row.porCubrir > 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {row.porCubrir}
                      </td>
                      <td className={`${tdBase} bg-orange-50 ${row.vacantByShift.Day > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                        {cellNum(row.vacantByShift.Day, false) || '—'}
                      </td>
                      <td className={`${tdBase} bg-orange-50 ${row.vacantByShift.Afternoon > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                        {cellNum(row.vacantByShift.Afternoon, false) || '—'}
                      </td>
                      <td className={`${tdBase} bg-orange-50 ${row.vacantByShift.Night > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                        {cellNum(row.vacantByShift.Night, false) || '—'}
                      </td>
                      {row.isFirstInUnit && (
                        <>
                          <td
                            rowSpan={row.unitRowSpan}
                            className={`${tdBase} text-left align-top text-[11px] max-w-[120px] whitespace-normal`}
                          >
                            {reten?.names.join(', ') || '—'}
                          </td>
                          <td
                            rowSpan={row.unitRowSpan}
                            className={`${tdBase} align-top font-medium`}
                          >
                            {reten?.count || 0}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
            {tableRows.length > 0 && (
              <tfoot>
                <tr className="bg-[#1e3a5f] text-white font-bold">
                  <td className={`${thBase} text-left`} colSpan={2}>TOTAL</td>
                  <td className={thBase}>{totals.rq}</td>
                  <td className={thBase}>{totals.shiftReq.Day || '—'}</td>
                  <td className={thBase}>{totals.shiftReq.Afternoon || '—'}</td>
                  <td className={thBase}>{totals.shiftReq.Night || '—'}</td>
                  <td className={`${thBase} text-right`}>{formatCurrency(totals.turnover)}</td>
                  <td className={`${thBase} bg-amber-400 text-amber-950`}>{totals.activos}</td>
                  <td className={`${thBase} bg-orange-400 text-orange-950`}>{totals.porCubrir}</td>
                  <td className={`${thBase} bg-orange-300 text-orange-950`}>{totals.shiftVacant.Day || '—'}</td>
                  <td className={`${thBase} bg-orange-300 text-orange-950`}>{totals.shiftVacant.Afternoon || '—'}</td>
                  <td className={`${thBase} bg-orange-300 text-orange-950`}>{totals.shiftVacant.Night || '—'}</td>
                  <td className={thBase} colSpan={2}>
                    {dayStatusSummary.retenesHoy} retén(es) hoy
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Resumen por puesto */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-700 flex items-center text-sm">
              <Briefcase className="mr-2" size={16} /> Resumen por Puesto
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-[#1e3a5f] text-white">
                  <th className={`${thBase} text-left`}>Cargo</th>
                  <th className={thBase}>RQ</th>
                  <th className={thBase}>Mañana</th>
                  <th className={thBase}>Tarde</th>
                  <th className={thBase}>Noche</th>
                  <th className={`${thBase} bg-amber-400 text-amber-950`}>Activos</th>
                  <th className={`${thBase} bg-orange-400 text-orange-950`}>Por cubrir</th>
                  <th className={`${thBase} bg-orange-200 text-orange-900`}>Vac. M</th>
                  <th className={`${thBase} bg-orange-200 text-orange-900`}>Vac. T</th>
                  <th className={`${thBase} bg-orange-200 text-orange-900`}>Vac. N</th>
                  <th className={thBase}>Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {positionSummary.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-slate-400 text-sm">Sin datos</td>
                  </tr>
                ) : (
                  positionSummary.map((pos, idx) => {
                    const cov = pos.rq > 0 ? (pos.activos / pos.rq) * 100 : 0;
                    return (
                      <tr key={pos.positionName} className={idx % 2 ? 'bg-slate-50' : 'bg-white'}>
                        <td className={`${tdBase} text-left font-medium`}>{pos.positionName}</td>
                        <td className={`${tdBase} font-semibold`}>{pos.rq}</td>
                        <td className={tdBase}>{cellNum(pos.requiredByShift.Day, false) || '—'}</td>
                        <td className={tdBase}>{cellNum(pos.requiredByShift.Afternoon, false) || '—'}</td>
                        <td className={tdBase}>{cellNum(pos.requiredByShift.Night, false) || '—'}</td>
                        <td className={`${tdBase} bg-amber-50 font-bold`}>{pos.activos}</td>
                        <td className={`${tdBase} bg-orange-50 font-bold ${pos.porCubrir > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {pos.porCubrir}
                        </td>
                        <td className={tdBase}>{cellNum(pos.vacantByShift.Day, false) || '—'}</td>
                        <td className={tdBase}>{cellNum(pos.vacantByShift.Afternoon, false) || '—'}</td>
                        <td className={tdBase}>{cellNum(pos.vacantByShift.Night, false) || '—'}</td>
                        <td className={`${tdBase} font-medium ${
                          cov >= 100 ? 'text-green-600' : cov >= 80 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {cov.toFixed(0)}%
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Estado del día */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-700 text-sm">Estado del día</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className={`${thBase} text-left`}>Concepto</th>
                  <th className={thBase}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white">
                  <td className={`${tdBase} text-left`}>Retenes asignados hoy</td>
                  <td className={`${tdBase} font-bold`}>{dayStatusSummary.retenesHoy}</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className={`${tdBase} text-left`}>Descanso (OFF)</td>
                  <td className={`${tdBase} font-bold`}>{dayStatusSummary.descanso}</td>
                </tr>
                <tr className="bg-white">
                  <td className={`${tdBase} text-left`}>Falta / Enfermedad</td>
                  <td className={`${tdBase} font-bold`}>{dayStatusSummary.falta}</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className={`${tdBase} text-left`}>Vacaciones</td>
                  <td className={`${tdBase} font-bold`}>{dayStatusSummary.vacaciones}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Resumen por unidad */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-700 flex items-center text-sm">
            <Building className="mr-2" size={16} /> Resumen por Unidad
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-[#1e3a5f] text-white">
                <th className={`${thBase} text-left`}>Unidad</th>
                <th className={`${thBase} text-left`}>Cliente</th>
                <th className={thBase}>RQ</th>
                <th className={thBase}>Mañana</th>
                <th className={thBase}>Tarde</th>
                <th className={thBase}>Noche</th>
                <th className={thBase}>Turnover</th>
                <th className={`${thBase} bg-amber-400 text-amber-950`}>Activos</th>
                <th className={`${thBase} bg-orange-400 text-orange-950`}>Por cubrir</th>
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Vac. M</th>
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Vac. T</th>
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Vac. N</th>
                <th className={thBase}>Cobertura</th>
                <th className={`${thBase} bg-slate-600`}>Retén</th>
              </tr>
            </thead>
            <tbody>
              {unitSummary.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-slate-400 text-sm">Sin datos</td>
                </tr>
              ) : (
                unitSummary.map((unit, idx) => {
                  const cov = unit.rq > 0 ? (unit.activos / unit.rq) * 100 : 0;
                  const reten = retenByUnit.get(unit.unitId);
                  return (
                    <tr key={unit.unitId} className={idx % 2 ? 'bg-slate-50' : 'bg-white'}>
                      <td className={`${tdBase} text-left font-medium`}>{unit.unitName}</td>
                      <td className={`${tdBase} text-left text-slate-500`}>{unit.clientName || '—'}</td>
                      <td className={`${tdBase} font-semibold`}>{unit.rq}</td>
                      <td className={tdBase}>{cellNum(unit.requiredByShift.Day, false) || '—'}</td>
                      <td className={tdBase}>{cellNum(unit.requiredByShift.Afternoon, false) || '—'}</td>
                      <td className={tdBase}>{cellNum(unit.requiredByShift.Night, false) || '—'}</td>
                      <td className={`${tdBase} text-right tabular-nums`}>{formatCurrency(unit.turnover)}</td>
                      <td className={`${tdBase} bg-amber-50 font-bold`}>{unit.activos}</td>
                      <td className={`${tdBase} bg-orange-50 font-bold ${unit.porCubrir > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {unit.porCubrir}
                      </td>
                      <td className={tdBase}>{cellNum(unit.vacantByShift.Day, false) || '—'}</td>
                      <td className={tdBase}>{cellNum(unit.vacantByShift.Afternoon, false) || '—'}</td>
                      <td className={tdBase}>{cellNum(unit.vacantByShift.Night, false) || '—'}</td>
                      <td className={`${tdBase} font-medium ${
                        cov >= 100 ? 'text-green-600' : cov >= 80 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {cov.toFixed(0)}%
                      </td>
                      <td className={`${tdBase} text-left text-[11px] max-w-[140px] whitespace-normal`}>
                        {reten ? `${reten.names.join(', ')} (${reten.count})` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {unitSummary.length > 0 && (
              <tfoot>
                <tr className="bg-[#1e3a5f] text-white font-bold">
                  <td className={`${thBase} text-left`} colSpan={2}>TOTAL</td>
                  <td className={thBase}>{totals.rq}</td>
                  <td className={thBase}>{totals.shiftReq.Day || '—'}</td>
                  <td className={thBase}>{totals.shiftReq.Afternoon || '—'}</td>
                  <td className={thBase}>{totals.shiftReq.Night || '—'}</td>
                  <td className={`${thBase} text-right`}>{formatCurrency(totals.turnover)}</td>
                  <td className={`${thBase} bg-amber-400 text-amber-950`}>{totals.activos}</td>
                  <td className={`${thBase} bg-orange-400 text-orange-950`}>{totals.porCubrir}</td>
                  <td className={`${thBase} bg-orange-300 text-orange-950`}>{totals.shiftVacant.Day || '—'}</td>
                  <td className={`${thBase} bg-orange-300 text-orange-950`}>{totals.shiftVacant.Afternoon || '—'}</td>
                  <td className={`${thBase} bg-orange-300 text-orange-950`}>{totals.shiftVacant.Night || '—'}</td>
                  <td className={thBase}>{coveragePercentage.toFixed(0)}%</td>
                  <td className={thBase}>{dayStatusSummary.retenesHoy}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
