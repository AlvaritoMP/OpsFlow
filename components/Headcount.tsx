import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toBlob, toPng } from 'html-to-image';
import { Unit, Resource, ResourceType, Position, HeadcountPositionMeta } from '../types';
import { positionsService } from '../services/positionsService';
import { retenesService, Reten, RetenAssignment } from '../services/retenesService';
import { Users, Briefcase, Building, X, Filter, RefreshCw, Image as ImageIcon, Download, Copy, Check } from 'lucide-react';

interface HeadcountProps {
  units: Unit[];
  onUpdateUnit?: (unit: Unit) => Promise<void>;
}

type ShiftKey = 'Day' | 'Afternoon' | 'Night';

interface ShiftBreakdown {
  Day: number;
  Afternoon: number;
  Night: number;
  unassigned: number;
}

interface PreventivoValues {
  Day: number;
  Afternoon: number;
  Night: number;
}

interface UnitRetenInfo {
  names: string[];
  count: number;
  /** Detalle legible: "ROY 08:00-17:00" */
  details: string[];
  assignments: RetenAssignment[];
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
  preventivo: PreventivoValues;
  isFirstInUnit: boolean;
  unitRowSpan: number;
}

const emptyShiftBreakdown = (): ShiftBreakdown => ({
  Day: 0,
  Afternoon: 0,
  Night: 0,
  unassigned: 0,
});

const emptyPreventivo = (): PreventivoValues => ({
  Day: 0,
  Afternoon: 0,
  Night: 0,
});

const metaRowKey = (unitId: string, positionId: string) => `${unitId}::${positionId}`;

/** Fecha local YYYY-MM-DD (evita desfase UTC de toISOString en Perú) */
const toLocalDateStr = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const normalizeDateStr = (value: string | undefined | null): string =>
  (value || '').toString().slice(0, 10);

const formatTimeShort = (time: string | undefined): string => {
  if (!time) return '';
  return time.slice(0, 5);
};

const readPreventivo = (unit: Unit, positionId: string): PreventivoValues => {
  const meta = unit.headcountMeta?.find(m => m.positionId === positionId);
  return {
    Day: Number(meta?.preventivo?.Day) || 0,
    Afternoon: Number(meta?.preventivo?.Afternoon) || 0,
    Night: Number(meta?.preventivo?.Night) || 0,
  };
};

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
    const today = toLocalDateStr();
    const todayShift = worker.workSchedule.find(s => normalizeDateStr(s.date) === today);
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

export const Headcount: React.FC<HeadcountProps> = ({ units, onUpdateUnit }) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [retenesCatalog, setRetenesCatalog] = useState<Reten[]>([]);
  const [todayRetenes, setTodayRetenes] = useState<RetenAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRetenes, setLoadingRetenes] = useState(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [showFilter, setShowFilter] = useState(false);
  /** Borrador local de preventivo mientras se edita (key = unitId::positionId) */
  const [preventivoDraft, setPreventivoDraft] = useState<Record<string, PreventivoValues>>({});
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const focusedKeyRef = useRef<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [capturingImage, setCapturingImage] = useState(false);
  const [imageActionFeedback, setImageActionFeedback] = useState<'copied' | 'downloaded' | 'error' | null>(null);
  const todayLocal = toLocalDateStr();

  useEffect(() => {
    loadData();
  }, []);

  // Refrescar retenes al volver a la pestaña (por si se asignaron en Vista Semanal)
  useEffect(() => {
    const onFocus = () => {
      void loadTodayRetenes();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Sincronizar borrador desde unidades (sin pisar la celda en foco)
  useEffect(() => {
    setPreventivoDraft(prev => {
      const next: Record<string, PreventivoValues> = { ...prev };
      units.forEach(unit => {
        const positionIds = new Set((unit.requiredPositions || []).map(r => r.positionId));
        positionIds.forEach(positionId => {
          const key = metaRowKey(unit.id, positionId);
          if (focusedKeyRef.current === key) return;
          next[key] = readPreventivo(unit, positionId);
        });
      });
      return next;
    });
  }, [units]);

  const resolveRetenName = useCallback((assignment: RetenAssignment, catalog: Reten[]): string => {
    if (assignment.reten_name?.trim()) return assignment.reten_name.trim();
    const fromCatalog = catalog.find(r => r.id === assignment.reten_id);
    return fromCatalog?.name?.trim() || 'Retén';
  }, []);

  const loadTodayRetenes = useCallback(async () => {
    try {
      setLoadingRetenes(true);
      const today = toLocalDateStr();
      const [retenesData, retenAssignments] = await Promise.all([
        retenesService.getAll(),
        retenesService.getAssignmentsByDateRange(today, today),
      ]);
      setRetenesCatalog(retenesData);
      // Misma fuente que Vista Semanal / utilización: asignaciones del día no canceladas
      const active = (retenAssignments || []).filter(a => {
        const dateOk = normalizeDateStr(a.assignment_date) === today;
        return dateOk && a.status !== 'cancelada';
      });
      setTodayRetenes(active);
    } catch (error: any) {
      console.error('❌ Headcount - Error al cargar retenes del día:', error);
    } finally {
      setLoadingRetenes(false);
    }
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [positionsData] = await Promise.all([
        positionsService.getAll(true),
        loadTodayRetenes(),
      ]);
      setPositions(positionsData);
    } catch (error: any) {
      console.error('❌ Headcount - Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPreventivo = useCallback((unitId: string, positionId: string): PreventivoValues => {
    const key = metaRowKey(unitId, positionId);
    if (preventivoDraft[key]) return preventivoDraft[key];
    const unit = units.find(u => u.id === unitId);
    return unit ? readPreventivo(unit, positionId) : emptyPreventivo();
  }, [preventivoDraft, units]);

  const persistPreventivo = useCallback(async (
    unitId: string,
    positionId: string,
    values: PreventivoValues
  ) => {
    if (!onUpdateUnit) return;
    const unit = units.find(u => u.id === unitId);
    if (!unit) return;

    const key = metaRowKey(unitId, positionId);
    const normalized: PreventivoValues = {
      Day: Math.max(0, Math.floor(Number(values.Day) || 0)),
      Afternoon: Math.max(0, Math.floor(Number(values.Afternoon) || 0)),
      Night: Math.max(0, Math.floor(Number(values.Night) || 0)),
    };

    const current = readPreventivo(unit, positionId);
    if (
      current.Day === normalized.Day &&
      current.Afternoon === normalized.Afternoon &&
      current.Night === normalized.Night
    ) {
      return;
    }

    const existing: HeadcountPositionMeta[] = [...(unit.headcountMeta || [])];
    const idx = existing.findIndex(m => m.positionId === positionId);
    const entry: HeadcountPositionMeta = {
      ...(idx >= 0 ? existing[idx] : { positionId }),
      positionId,
      preventivo: { ...normalized },
    };
    if (idx >= 0) existing[idx] = entry;
    else existing.push(entry);

    setSavingKeys(prev => new Set(prev).add(key));
    setSaveError(null);
    try {
      await onUpdateUnit({ ...unit, headcountMeta: existing });
    } catch (err: any) {
      console.error('Error guardando preventivo FDM:', err);
      setSaveError(err?.message || 'No se pudo guardar el preventivo FDM');
      setPreventivoDraft(prev => ({ ...prev, [key]: current }));
    } finally {
      setSavingKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [onUpdateUnit, units]);

  const handlePreventivoChange = (
    unitId: string,
    positionId: string,
    shift: ShiftKey,
    raw: string
  ) => {
    const key = metaRowKey(unitId, positionId);
    const parsed = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw) || 0));
    setPreventivoDraft(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || getPreventivo(unitId, positionId)),
        [shift]: parsed,
      },
    }));
  };

  const filteredUnits = useMemo(() => {
    if (selectedUnitIds.length === 0) return units;
    return units.filter(u => selectedUnitIds.includes(u.id));
  }, [units, selectedUnitIds]);

  /** Cruce con Vista Semanal (utilización de retenes): asignaciones de hoy por unidad */
  const retenByUnit = useMemo(() => {
    const map = new Map<string, UnitRetenInfo>();
    const unitsByNormalizedName = new Map<string, string>();
    units.forEach(u => {
      unitsByNormalizedName.set(u.name.trim().toLowerCase(), u.id);
    });

    todayRetenes.forEach(a => {
      let unitId = a.unit_id;
      if (!unitId || !units.some(u => u.id === unitId)) {
        const byName = unitsByNormalizedName.get((a.unit_name || '').trim().toLowerCase());
        if (byName) unitId = byName;
      }
      if (!unitId) return;

      const name = resolveRetenName(a, retenesCatalog);
      const schedule = [formatTimeShort(a.start_time), formatTimeShort(a.end_time)]
        .filter(Boolean)
        .join('-');
      const detail = schedule ? `${name} ${schedule}` : name;

      const existing = map.get(unitId) || {
        names: [],
        count: 0,
        details: [],
        assignments: [],
      };
      if (!existing.names.includes(name)) {
        existing.names.push(name);
      }
      existing.details.push(detail);
      existing.assignments.push(a);
      existing.count += 1;
      map.set(unitId, existing);
    });

    return map;
  }, [todayRetenes, retenesCatalog, units, resolveRetenName]);

  // Tabla principal: una fila por UNIDAD × CARGO (turnos pivotados)
  // RQ siempre viene de puestos requeridos; sin personal contratado = activos 0 y por cubrir = RQ
  const tableRows = useMemo((): HeadcountRow[] => {
    const rows: HeadcountRow[] = [];

    const sortedUnits = [...filteredUnits].sort((a, b) => a.name.localeCompare(b.name));

    sortedUnits.forEach(unit => {
      const requiredPositions = unit.requiredPositions || [];
      const personnel = (unit.resources || []).filter(
        r => r.type === ResourceType.PERSONNEL && r.personnelStatus !== 'cesado' && !r.archived
      );

      // Agrupar requerimientos por puesto (existen aunque no haya personal contratado)
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

      // Sin puestos requeridos: la unidad igual aparece, con RQ/cobertura en cero
      if (positionEntries.length === 0) {
        rows.push({
          unitId: unit.id,
          unitName: unit.name,
          clientName: unit.clientName,
          positionId: '__sin_rq__',
          positionName: personnel.length === 0 ? 'Sin personal / Sin RQ' : 'Sin puestos requeridos',
          rq: 0,
          requiredByShift: emptyShiftBreakdown(),
          activos: 0,
          activosByShift: emptyShiftBreakdown(),
          porCubrir: 0,
          vacantByShift: emptyShiftBreakdown(),
          turnover: 0,
          preventivo: getPreventivo(unit.id, '__sin_rq__'),
          isFirstInUnit: true,
          unitRowSpan: 1,
        });
        return;
      }

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
        // Sin personal contratado: activos 0, por cubrir = RQ completo
        const porCubrir = Math.max(0, entry.rq - activos);

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
          preventivo: getPreventivo(unit.id, entry.positionId),
          isFirstInUnit: index === 0,
          unitRowSpan: positionEntries.length,
        });
      });
    });

    return rows;
  }, [filteredUnits, positions, getPreventivo]);

  const totals = useMemo(() => {
    const shiftReq = emptyShiftBreakdown();
    const shiftVacant = emptyShiftBreakdown();
    const preventivo = emptyPreventivo();
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
        preventivo[s] += row.preventivo[s];
      });
      shiftReq.unassigned += row.requiredByShift.unassigned;
      shiftVacant.unassigned += row.vacantByShift.unassigned;
    });

    return { rq, activos, porCubrir, turnover, shiftReq, shiftVacant, preventivo };
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
      if (row.positionId === '__sin_rq__') return;
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
    const today = toLocalDateStr();

    filteredUnits.forEach(unit => {
      const personnel = (unit.resources || []).filter(
        r => r.type === ResourceType.PERSONNEL && r.personnelStatus !== 'cesado' && !r.archived
      );
      personnel.forEach(p => {
        const todayShift = p.workSchedule?.find(s => normalizeDateStr(s.date) === today);
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

  const prepareReportNodeForCapture = (node: HTMLElement) => {
    const restored: Array<() => void> = [];
    node.querySelectorAll<HTMLElement>('.overflow-x-auto, .overflow-y-auto, .overflow-auto').forEach(el => {
      const prevOverflow = el.style.overflow;
      const prevMaxHeight = el.style.maxHeight;
      el.style.overflow = 'visible';
      el.style.maxHeight = 'none';
      restored.push(() => {
        el.style.overflow = prevOverflow;
        el.style.maxHeight = prevMaxHeight;
      });
    });
    return () => restored.forEach(fn => fn());
  };

  const captureReportBlob = async (): Promise<Blob | null> => {
    const node = reportRef.current;
    if (!node) return null;

    const restore = prepareReportNodeForCapture(node);
    try {
      // Doble rAF para que el layout ampliado se aplique antes de capturar
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: '#f8fafc',
        cacheBust: true,
        filter: (element) => {
          if (!(element instanceof HTMLElement)) return true;
          return !element.classList.contains('no-capture');
        },
      });
      return blob;
    } finally {
      restore();
    }
  };

  const downloadReportImage = async () => {
    const node = reportRef.current;
    if (!node) return;
    setCapturingImage(true);
    setImageActionFeedback(null);
    const restore = prepareReportNodeForCapture(node);
    try {
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: '#f8fafc',
        cacheBust: true,
        filter: (element) => {
          if (!(element instanceof HTMLElement)) return true;
          return !element.classList.contains('no-capture');
        },
      });
      const link = document.createElement('a');
      link.download = `headcount_${todayLocal}.png`;
      link.href = dataUrl;
      link.click();
      setImageActionFeedback('downloaded');
    } catch (err) {
      console.error('Error generando imagen de Headcount:', err);
      setImageActionFeedback('error');
    } finally {
      restore();
      setCapturingImage(false);
      window.setTimeout(() => setImageActionFeedback(null), 3000);
    }
  };

  const copyReportImage = async () => {
    setCapturingImage(true);
    setImageActionFeedback(null);
    try {
      const blob = await captureReportBlob();
      if (!blob) throw new Error('No se pudo generar la imagen');

      const canWriteClipboard =
        typeof ClipboardItem !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.write === 'function';

      if (canWriteClipboard) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setImageActionFeedback('copied');
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `headcount_${todayLocal}.png`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        setImageActionFeedback('downloaded');
      }
    } catch (err) {
      console.error('Error copiando imagen de Headcount:', err);
      setImageActionFeedback('error');
    } finally {
      setCapturingImage(false);
      window.setTimeout(() => setImageActionFeedback(null), 3000);
    }
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
      <div className="flex flex-wrap justify-between items-start gap-3 no-capture">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center">
            <Users className="mr-2" size={24} /> Headcount
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Conciliación de puestos requeridos vs activos — vista tabular
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void copyReportImage()}
            disabled={capturingImage || tableRows.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title="Genera una imagen del reporte y la copia al portapapeles para pegar en chats"
          >
            {imageActionFeedback === 'copied' ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
            {capturingImage ? 'Generando…' : imageActionFeedback === 'copied' ? 'Copiado' : 'Copiar imagen'}
          </button>
          <button
            type="button"
            onClick={() => void downloadReportImage()}
            disabled={capturingImage || tableRows.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title="Descargar el reporte completo como PNG"
          >
            {imageActionFeedback === 'downloaded' ? <Check size={16} className="text-green-600" /> : <Download size={16} />}
            {imageActionFeedback === 'downloaded' ? 'Descargado' : 'Descargar PNG'}
          </button>
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
      </div>

      {imageActionFeedback === 'error' && (
        <div className="no-capture text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          No se pudo generar la imagen. Prueba con Descargar PNG o usa Chrome/Edge.
        </div>
      )}

      {/* Filtro de unidades */}
      {showFilter && (
        <div className="no-capture bg-white rounded-xl border border-slate-200 shadow-sm p-4">
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

      {/* KPIs compactos (fuera de la captura de imagen) */}
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

      {/* Área capturable: solo las 2 primeras tablas */}
      <div ref={reportRef} className="space-y-5 bg-slate-50 p-3 rounded-xl">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ImageIcon size={18} className="text-slate-500" />
              Headcount — Reporte operativo
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Fecha: {todayLocal.split('-').reverse().join('/')} · Cobertura {coveragePercentage.toFixed(1)}%
            </p>
          </div>
          <div className="text-right text-[11px] text-slate-500">
            <div>RQ {totals.rq} · Activos {totals.activos} · Por cubrir {totals.porCubrir}</div>
            <div>Retenes hoy: {dayStatusSummary.retenesHoy}</div>
          </div>
        </div>

      {/* ========== TABLA PRINCIPAL (estilo Excel) ========== */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-bold text-slate-700 flex items-center text-sm">
            <Users className="mr-2" size={16} /> Detalle Headcount por Unidad / Cargo
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            {saveError && (
              <span className="text-xs text-red-600">{saveError}</span>
            )}
            <span className="text-xs text-slate-500">
              Preventivo FDM editable · {tableRows.length} filas
            </span>
            <button
              type="button"
              onClick={() => void loadTodayRetenes()}
              disabled={loadingRetenes}
              className="no-capture inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title="Actualizar asignaciones desde Utilización / Vista Semanal de Retenes"
            >
              <RefreshCw size={12} className={loadingRetenes ? 'animate-spin' : ''} />
              Retenes {todayLocal.split('-').reverse().join('/')}
              {dayStatusSummary.retenesHoy > 0 && (
                <span className="bg-slate-700 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {dayStatusSummary.retenesHoy}
                </span>
              )}
            </button>
          </div>
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
                <th colSpan={3} className={`${thBase} bg-emerald-600`}>Preventivo FDM</th>
                <th colSpan={2} className={`${thBase} bg-slate-600`}>
                  Retén del día
                  <div className="normal-case font-normal text-[9px] opacity-80 tracking-normal">
                    Vista Semanal · {todayLocal.split('-').reverse().join('/')}
                  </div>
                </th>
              </tr>
              <tr className="bg-[#254a73] text-white">
                <th className={thBase}>Mañana</th>
                <th className={thBase}>Tarde</th>
                <th className={thBase}>Noche</th>
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Mañana</th>
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Tarde</th>
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Noche</th>
                <th className={`${thBase} bg-emerald-500`}>Mañana</th>
                <th className={`${thBase} bg-emerald-500`}>Tarde</th>
                <th className={`${thBase} bg-emerald-500`}>Noche</th>
                <th className={`${thBase} bg-slate-500`}>Nombre</th>
                <th className={`${thBase} bg-slate-500 min-w-[40px]`}>#</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-6 py-10 text-center text-slate-400 text-sm">
                    No hay puestos requeridos definidos en las unidades seleccionadas
                  </td>
                </tr>
              ) : (
                tableRows.map((row, idx) => {
                  const reten = retenByUnit.get(row.unitId);
                  const alt = idx % 2 === 1;
                  const pKey = metaRowKey(row.unitId, row.positionId);
                  const isSaving = savingKeys.has(pKey);
                  const preventivo = row.preventivo;
                  const isPlaceholderRow = row.positionId === '__sin_rq__';

                  const renderPreventivoInput = (shift: ShiftKey) => {
                    if (isPlaceholderRow) {
                      return <span className="text-slate-400">—</span>;
                    }
                    return (
                    <input
                      type="number"
                      min={0}
                      step={1}
                      disabled={!onUpdateUnit || isSaving}
                      value={preventivo[shift] || ''}
                      placeholder="0"
                      onFocus={() => { focusedKeyRef.current = pKey; }}
                      onChange={(e) => handlePreventivoChange(row.unitId, row.positionId, shift, e.target.value)}
                      onBlur={() => {
                        focusedKeyRef.current = null;
                        void persistPreventivo(row.unitId, row.positionId, getPreventivo(row.unitId, row.positionId));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className={`w-12 mx-auto block text-center text-xs rounded border px-1 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 disabled:bg-slate-100 disabled:text-slate-400 ${
                        preventivo[shift] > 0 ? 'border-emerald-400 font-semibold text-emerald-900' : 'border-emerald-200 text-slate-600'
                      }`}
                      title="Preventivo FDM — se guarda al salir de la celda"
                    />
                    );
                  };

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
                      <td className={`${tdBase} bg-emerald-50 ${isSaving ? 'opacity-60' : ''}`}>{renderPreventivoInput('Day')}</td>
                      <td className={`${tdBase} bg-emerald-50 ${isSaving ? 'opacity-60' : ''}`}>{renderPreventivoInput('Afternoon')}</td>
                      <td className={`${tdBase} bg-emerald-50 ${isSaving ? 'opacity-60' : ''}`}>{renderPreventivoInput('Night')}</td>
                      {row.isFirstInUnit && (
                        <>
                          <td
                            rowSpan={row.unitRowSpan}
                            className={`${tdBase} text-left align-top text-[11px] max-w-[180px] whitespace-normal bg-slate-50`}
                            title={
                              reten
                                ? reten.assignments
                                    .map(a => {
                                      const name = resolveRetenName(a, retenesCatalog);
                                      const hor = `${formatTimeShort(a.start_time)}-${formatTimeShort(a.end_time)}`;
                                      const tipo = a.assignment_type === 'inmediata' ? 'inmediata' : 'planificada';
                                      return `${name} · ${hor} · ${tipo}${a.reason ? ` · ${a.reason}` : ''}`;
                                    })
                                    .join('\n')
                                : 'Sin asignación de retén hoy en Vista Semanal'
                            }
                          >
                            {reten ? (
                              <div className="space-y-1">
                                {reten.details.map((detail, i) => (
                                  <div key={`${row.unitId}-reten-${i}`} className="leading-snug">
                                    <span className="font-semibold text-slate-800">{detail}</span>
                                    {reten.assignments[i]?.assignment_type === 'inmediata' && (
                                      <span className="ml-1 text-[9px] text-red-600 font-medium">inmediata</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td
                            rowSpan={row.unitRowSpan}
                            className={`${tdBase} align-top font-bold ${reten?.count ? 'text-slate-800' : 'text-slate-400'}`}
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
                  <td className={`${thBase} bg-emerald-500`}>{totals.preventivo.Day || '—'}</td>
                  <td className={`${thBase} bg-emerald-500`}>{totals.preventivo.Afternoon || '—'}</td>
                  <td className={`${thBase} bg-emerald-500`}>{totals.preventivo.Night || '—'}</td>
                  <td className={thBase} colSpan={2}>
                    {dayStatusSummary.retenesHoy} retén(es) hoy
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
      </div>{/* fin área capturable: solo Detalle + Resumen por Puesto */}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
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
                  <td className={`${tdBase} text-left`}>Retenes asignados hoy (Vista Semanal)</td>
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
                      <td className={`${tdBase} text-left text-[11px] max-w-[160px] whitespace-normal`}>
                        {reten ? (
                          <div>
                            <div className="font-medium text-slate-800">{reten.names.join(', ')}</div>
                            <div className="text-slate-500 text-[10px]">{reten.details.join(' · ')}</div>
                          </div>
                        ) : (
                          '—'
                        )}
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
