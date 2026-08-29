import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Calendar,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  MapPin,
  Plus,
  Save,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { ManagementStaff, SupervisionAssignment, SupervisionVisit, Unit, User } from '../types';
import {
  hydrateAssignment,
  hydrateVisit,
  supervisionPlanningService,
} from '../services/supervisionPlanningService';
import { storageService } from '../services/storageService';
import { SupervisionRouteMap } from './SupervisionRouteMap';
import { DateInput } from './DateInput';
import {
  WEEKDAYS,
  SUPERVISION_CATEGORIES,
  SUPERVISION_FREQUENCIES,
  addDays,
  categoryStyle,
  formatDateFull,
  formatDateYmd,
  formatMonthLabel,
  formatTime,
  formatWeekRange,
  isMissingTableError,
  isTheoreticallyExpected,
  mondayOf,
  monthDates,
  parseYmd,
  weekDates,
} from '../utils/supervisionPlanning';

interface SupervisionPlanningProps {
  units: Unit[];
  currentUser: User;
  managementStaff: ManagementStaff[];
  canEdit: boolean;
}

type PlanningTab = 'assignments' | 'routes' | 'execution';

function findLinkedStaff(user: User, staff: ManagementStaff[]): ManagementStaff | undefined {
  const email = user.email?.trim().toLowerCase();
  if (email) {
    const byEmail = staff.find((s) => s.email?.trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const name = user.name?.trim().toLowerCase();
  if (!name) return undefined;
  return staff.find((s) => s.name.trim().toLowerCase() === name);
}

function getGeo(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

function isoFromYmd(dateStr: string): number {
  const js = parseYmd(dateStr).getDay();
  return js === 0 ? 7 : js;
}

const visitStatusLabel: Record<SupervisionVisit['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En ruta',
  completed: 'Completada',
  skipped: 'Omitida',
  cancelled: 'Cancelada',
};

const visitStatusClass: Record<SupervisionVisit['status'], string> = {
  pending: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  skipped: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-slate-200 text-slate-500',
};

const ModalShell: React.FC<{ children: React.ReactNode; onClose: () => void }> = ({ children, onClose }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export const SupervisionPlanning: React.FC<SupervisionPlanningProps> = ({
  units,
  currentUser,
  managementStaff,
  canEdit,
}) => {
  const activeStaff = useMemo(
    () => managementStaff.filter((s) => !s.archived && s.status !== 'cesado'),
    [managementStaff]
  );
  const supervisors = useMemo(() => {
    const field = activeStaff.filter(
      (s) => s.role === 'ROVING_SUPERVISOR' || s.role === 'RESIDENT_SUPERVISOR'
    );
    return field.length ? field : activeStaff;
  }, [activeStaff]);
  const coordinators = useMemo(
    () => activeStaff.filter((s) => s.role === 'COORDINATOR'),
    [activeStaff]
  );
  const linkedStaff = useMemo(
    () => findLinkedStaff(currentUser, activeStaff),
    [currentUser, activeStaff]
  );
  const canDesign =
    ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS'].includes(currentUser.role) ||
    linkedStaff?.role === 'COORDINATOR';
  const lockedSupervisorId =
    currentUser.role === 'OPERATIONS_SUPERVISOR' && linkedStaff?.role !== 'COORDINATOR'
      ? linkedStaff?.id
      : undefined;

  const [tab, setTab] = useState<PlanningTab>(canDesign ? 'assignments' : 'execution');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingTable, setMissingTable] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const [assignments, setAssignments] = useState<SupervisionAssignment[]>([]);
  const [routes, setRoutes] = useState<Awaited<ReturnType<typeof supervisionPlanningService.getRoutes>>>([]);
  const [visits, setVisits] = useState<SupervisionVisit[]>([]);

  const today = new Date();
  const [calendarMonth, setCalendarMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [search, setSearch] = useState('');
  const [filterSupervisor, setFilterSupervisor] = useState(lockedSupervisorId || 'all');
  const [filterCategory, setFilterCategory] = useState<'all' | SupervisionAssignment['category']>('all');

  const [routeSupervisorId, setRouteSupervisorId] = useState('');
  const [routeDate, setRouteDate] = useState(formatDateYmd(new Date()));
  const [draftStops, setDraftStops] = useState<
    Array<{ visitId?: string; unitId: string; unitName: string; latitude?: number; longitude?: number }>
  >([]);
  const [draftDistance, setDraftDistance] = useState<number | undefined>();
  const [draftOptimized, setDraftOptimized] = useState(false);

  const [selectedDay, setSelectedDay] = useState(formatDateYmd(new Date()));
  const [showManualVisit, setShowManualVisit] = useState(false);
  const [manualVisit, setManualVisit] = useState({
    unitId: '',
    supervisorStaffId: '',
    visitDate: formatDateYmd(new Date()),
  });
  const [skipVisitId, setSkipVisitId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [checkInVisit, setCheckInVisit] = useState<SupervisionVisit | null>(null);
  const [checkInFile, setCheckInFile] = useState<File | null>(null);
  const [checkInPreview, setCheckInPreview] = useState<string | null>(null);

  const monthDays = useMemo(
    () => monthDates(calendarMonth.year, calendarMonth.month),
    [calendarMonth]
  );
  const weekVisitDates = useMemo(() => weekDates(weekStart), [weekStart]);
  const modalOpen = Boolean(checkInVisit || skipVisitId || showManualVisit);

  const hydratedAssignments = useMemo(
    () => assignments.map((a) => hydrateAssignment(a, units, activeStaff)),
    [assignments, units, activeStaff]
  );
  const hydratedVisits = useMemo(
    () => visits.map((v) => hydrateVisit(v, units, activeStaff, hydratedAssignments)),
    [visits, units, activeStaff, hydratedAssignments]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const monthStart = formatDateYmd(new Date(calendarMonth.year, calendarMonth.month, 1));
      const monthEnd = formatDateYmd(new Date(calendarMonth.year, calendarMonth.month + 1, 0));
      const weekFrom = formatDateYmd(weekStart);
      const weekTo = formatDateYmd(addDays(weekStart, 6));
      const from = monthStart < weekFrom ? monthStart : weekFrom;
      const to = monthEnd > weekTo ? monthEnd : weekTo;
      const [assignmentRows, routeRows, visitRows] = await Promise.all([
        supervisionPlanningService.getAssignments(),
        supervisionPlanningService.getRoutes(lockedSupervisorId),
        supervisionPlanningService.getVisits(from, to, lockedSupervisorId),
      ]);
      setAssignments(assignmentRows);
      setRoutes(routeRows);
      setVisits(visitRows);
      setMissingTable(false);
    } catch (err) {
      if (isMissingTableError(err)) setMissingTable(true);
      else setError(err instanceof Error ? err.message : 'No se pudo cargar la supervisión');
    } finally {
      setLoading(false);
    }
  }, [calendarMonth, weekStart, lockedSupervisorId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (lockedSupervisorId) {
      setFilterSupervisor(lockedSupervisorId);
      setRouteSupervisorId(lockedSupervisorId);
    } else if (!routeSupervisorId && supervisors[0]) {
      setRouteSupervisorId(supervisors[0].id);
    }
  }, [lockedSupervisorId, supervisors, routeSupervisorId]);

  useEffect(() => {
    if (!weekVisitDates.includes(selectedDay)) setSelectedDay(weekVisitDates[0]);
    if (!weekVisitDates.includes(routeDate) && monthDays.includes(routeDate) === false) {
      setRouteDate(weekVisitDates[0]);
    }
  }, [weekStart, selectedDay, routeDate, weekVisitDates, monthDays]);

  const loadRouteDraft = useCallback(() => {
    if (!routeSupervisorId || !routeDate) {
      setDraftStops([]);
      return;
    }
    const dayVisits = hydratedVisits
      .filter(
        (v) =>
          v.supervisorStaffId === routeSupervisorId &&
          v.visitDate === routeDate &&
          v.status !== 'cancelled'
      )
      .sort((a, b) => (a.stopOrder || 99) - (b.stopOrder || 99));
    setDraftStops(
      dayVisits.map((v) => ({
        visitId: v.id,
        unitId: v.unitId,
        unitName: v.unitName || v.unitId,
        latitude: v.latitude,
        longitude: v.longitude,
      }))
    );
    setDraftDistance(undefined);
    setDraftOptimized(false);
  }, [routeSupervisorId, routeDate, hydratedVisits]);

  useEffect(() => {
    if (tab === 'routes') loadRouteDraft();
  }, [tab, loadRouteDraft]);

  const handleError = (err: unknown) => {
    if (isMissingTableError(err)) setMissingTable(true);
    else setError(err instanceof Error ? err.message : 'Ocurrió un error');
  };

  const saveAssignment = async (
    input: Parameters<typeof supervisionPlanningService.upsertAssignment>[0]
  ) => {
    if (!canDesign || !canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await supervisionPlanningService.upsertAssignment({
        ...input,
        userId: currentUser.id,
      });
      setAssignments((prev) => [...prev.filter((a) => a.unitId !== saved.unitId), saved]);
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const assignmentRows = useMemo(() => {
    const byUnit = new Map(hydratedAssignments.map((a) => [a.unitId, a]));
    const q = search.trim().toLowerCase();
    return units
      .map((unit) => ({ unit, assignment: byUnit.get(unit.id) }))
      .filter((row) => {
        if (filterSupervisor !== 'all' && (row.assignment?.supervisorStaffId || '') !== filterSupervisor) {
          return false;
        }
        if (filterCategory !== 'all' && row.assignment?.category !== filterCategory) return false;
        if (!q) return true;
        return `${row.unit.name} ${row.unit.clientName} ${row.unit.address} ${row.assignment?.supervisorName || ''}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => a.unit.name.localeCompare(b.unit.name, 'es'));
  }, [units, hydratedAssignments, search, filterSupervisor, filterCategory]);

  const visitsForView = useMemo(() => {
    const list = lockedSupervisorId
      ? hydratedVisits.filter((v) => v.supervisorStaffId === lockedSupervisorId)
      : filterSupervisor === 'all'
        ? hydratedVisits
        : hydratedVisits.filter((v) => v.supervisorStaffId === filterSupervisor);
    return [...list].sort((a, b) => (a.stopOrder || 99) - (b.stopOrder || 99));
  }, [hydratedVisits, lockedSupervisorId, filterSupervisor]);

  const dayExecutionVisits = visitsForView.filter((v) => v.visitDate === selectedDay);

  const findPlanned = (unitId: string, dateStr: string, supervisorStaffId?: string) =>
    hydratedVisits.find(
      (v) =>
        v.unitId === unitId &&
        v.visitDate === dateStr &&
        (!supervisorStaffId || v.supervisorStaffId === supervisorStaffId) &&
        v.status !== 'cancelled'
    );

  const togglePlannedDay = async (assignment: SupervisionAssignment | undefined, unit: Unit, dateStr: string) => {
    if (!canDesign || !canEdit) return;
    const supervisorId = assignment?.supervisorStaffId;
    if (!supervisorId) {
      setError('Asigne un supervisor a la unidad antes de programar el día.');
      return;
    }
    const existing = findPlanned(unit.id, dateStr, supervisorId);
    setSaving(true);
    setError(null);
    try {
      if (existing) {
        if (existing.status !== 'pending') {
          setError('Esa visita ya tiene ejecución y no se puede quitar.');
          return;
        }
        await supervisionPlanningService.deleteVisit(existing.id);
        setVisits((prev) => prev.filter((v) => v.id !== existing.id));
      } else {
        const weekdayRoute = routes.find(
          (r) => r.supervisorStaffId === supervisorId && r.weekday === isoFromYmd(dateStr)
        );
        const created = await supervisionPlanningService.createManualVisit({
          unitId: unit.id,
          supervisorStaffId: supervisorId,
          coordinatorStaffId: assignment?.coordinatorStaffId,
          visitDate: dateStr,
          userId: currentUser.id,
        });
        const stopOrder = weekdayRoute?.stops.find((s) => s.unitId === unit.id)?.stopOrder;
        const saved = stopOrder
          ? await supervisionPlanningService.updateVisit(created.id, { stopOrder }, currentUser.id)
          : created;
        setVisits((prev) => [...prev, saved]);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const suggestMonth = async () => {
    if (!canDesign || !canEdit) return;
    setSaving(true);
    setError(null);
    try {
      await supervisionPlanningService.generateMonth(calendarMonth.year, calendarMonth.month, currentUser.id);
      await loadAll();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const moveStop = (index: number, dir: -1 | 1) => {
    setDraftStops((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
    setDraftOptimized(false);
  };

  const optimizeDraft = () => {
    const result = supervisionPlanningService.optimizeStops(draftStops);
    setDraftStops(result.ordered);
    setDraftDistance(result.distanceKm);
    setDraftOptimized(true);
  };

  const saveDraftRoute = async () => {
    if (!canDesign || !canEdit || !routeSupervisorId) return;
    const supervisor = supervisors.find((s) => s.id === routeSupervisorId);
    const weekday = isoFromYmd(routeDate);
    setSaving(true);
    setError(null);
    try {
      await supervisionPlanningService.saveRoute({
        supervisorStaffId: routeSupervisorId,
        weekday,
        name: `Ruta ${WEEKDAYS.find((d) => d.iso === weekday)?.label || ''} · ${supervisor?.name || ''}`.trim(),
        unitIds: draftStops.map((s) => s.unitId),
        isOptimized: draftOptimized,
        estimatedDistanceKm: draftDistance,
        userId: currentUser.id,
      });
      const updated = await Promise.all(
        draftStops.map(async (stop, index) => {
          if (!stop.visitId) return null;
          return supervisionPlanningService.updateVisit(stop.visitId, { stopOrder: index + 1 }, currentUser.id);
        })
      );
      setVisits((prev) => prev.map((visit) => updated.find((u) => u?.id === visit.id) || visit));
      setRoutes(await supervisionPlanningService.getRoutes(lockedSupervisorId));
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const canActOnVisit = (visit: SupervisionVisit) => {
    if (!canEdit) return false;
    if (canDesign) return true;
    return Boolean(lockedSupervisorId && visit.supervisorStaffId === lockedSupervisorId);
  };

  const submitCheckIn = async () => {
    if (!checkInVisit || !canActOnVisit(checkInVisit) || !checkInFile) return;
    setSaving(true);
    try {
      const geo = await getGeo();
      const path = `supervision-visits/${checkInVisit.id}/checkin-${Date.now()}-${checkInFile.name}`;
      const url = await storageService.uploadFile('night-supervision-photos', checkInFile, path);
      const updated = await supervisionPlanningService.updateVisit(
        checkInVisit.id,
        {
          status: 'in_progress',
          checkInAt: new Date().toISOString(),
          checkInLat: geo?.lat ?? null,
          checkInLng: geo?.lng ?? null,
          evidenceUrls: [...(checkInVisit.evidenceUrls || []), url],
        },
        currentUser.id
      );
      setVisits((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      setCheckInVisit(null);
      setCheckInFile(null);
      setCheckInPreview(null);
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const checkOut = async (visit: SupervisionVisit) => {
    if (!canActOnVisit(visit)) return;
    setSaving(true);
    try {
      const geo = await getGeo();
      const updated = await supervisionPlanningService.updateVisit(
        visit.id,
        {
          status: 'completed',
          checkOutAt: new Date().toISOString(),
          checkOutLat: geo?.lat ?? null,
          checkOutLng: geo?.lng ?? null,
        },
        currentUser.id
      );
      setVisits((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const confirmSkip = async () => {
    if (!skipVisitId) return;
    setSaving(true);
    try {
      const updated = await supervisionPlanningService.updateVisit(
        skipVisitId,
        { status: 'skipped', skipReason: skipReason || 'Sin motivo' },
        currentUser.id
      );
      setVisits((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
      setSkipVisitId(null);
      setSkipReason('');
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const createManual = async () => {
    if (!canEdit || !manualVisit.unitId || !manualVisit.supervisorStaffId) return;
    setSaving(true);
    try {
      await supervisionPlanningService.createManualVisit({ ...manualVisit, userId: currentUser.id });
      setShowManualVisit(false);
      await loadAll();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const shiftMonth = (delta: number) => {
    setCalendarMonth((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const visibleTabs: Array<{ id: PlanningTab; label: string; hidden?: boolean }> = [
    { id: 'assignments', label: 'Asignación', hidden: !canDesign },
    { id: 'routes', label: 'Rutas', hidden: !canDesign },
    { id: 'execution', label: 'Ejecución' },
  ];

  const dayCell = (
    unit: Unit,
    assignment: SupervisionAssignment | undefined,
    dateStr: string,
    compact = false
  ) => {
    const theoretical = assignment ? isTheoreticallyExpected(assignment, parseYmd(dateStr)) : false;
    const planned = assignment?.supervisorStaffId
      ? findPlanned(unit.id, dateStr, assignment.supervisorStaffId)
      : undefined;
    const size = compact ? 'w-9 h-9' : 'w-8 h-8';
    return (
      <button
        disabled={!canDesign || !canEdit || saving}
        onClick={() => togglePlannedDay(assignment, unit, dateStr)}
        className={`${size} rounded text-xs font-bold border ${
          planned
            ? planned.status === 'pending'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-emerald-600 text-white border-emerald-600'
            : theoretical
              ? 'bg-white text-slate-400 border-dashed border-slate-400'
              : 'bg-slate-50 text-slate-300 border-slate-200'
        }`}
        title={theoretical ? 'Día de supervisión (patrón)' : 'Programar visita real'}
      >
        {planned ? 'X' : theoretical ? '·' : ''}
      </button>
    );
  };

  const executionDone = dayExecutionVisits.filter((v) => v.status === 'completed').length;
  const executionProgress = dayExecutionVisits.filter((v) => v.status === 'in_progress').length;

  if (missingTable) {
    return (
      <div className="p-4 md:p-6">
        <div className="max-w-2xl bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-amber-900 flex items-center gap-2">
            <AlertTriangle size={18} /> Falta crear las tablas de supervisión
          </h2>
          <p className="text-sm text-amber-800 mt-2">
            Ejecute en Supabase <code className="font-mono">create_supervision_planning.sql</code> y{' '}
            <code className="font-mono">add_supervision_visit_evidence.sql</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Supervisión de campo</h1>
          <p className="text-sm text-slate-500 mt-1">
            Los días L–D son el patrón de la unidad. El calendario del mes es la programación real.
          </p>
        </div>
        {canEdit && tab === 'execution' && (
          <button
            onClick={() => {
              setManualVisit({
                unitId: '',
                supervisorStaffId: lockedSupervisorId || routeSupervisorId || supervisors[0]?.id || '',
                visitDate: selectedDay,
              });
              setShowManualVisit(true);
            }}
            className="min-h-[44px] px-4 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 flex items-center justify-center gap-1"
          >
            <Plus size={16} /> Visita extra
          </button>
        )}
      </div>

      {currentUser.role === 'OPERATIONS_SUPERVISOR' && !linkedStaff && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          Vincule el correo de su usuario con el personal de gestión para ver solo su ruta.
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3 flex justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
        {visibleTabs
          .filter((t) => !t.hidden)
          .map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex-1 min-h-[44px] px-3 rounded-lg text-sm font-medium ${
                tab === item.id ? 'bg-blue-600 text-white' : 'text-slate-600'
              }`}
            >
              {item.label}
            </button>
          ))}
      </div>

      {loading ? (
        <div className="text-sm text-slate-500 py-12 text-center">Cargando…</div>
      ) : tab === 'assignments' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => shiftMonth(-1)} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 bg-white flex items-center justify-center">
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-semibold text-slate-800 capitalize min-w-[140px] text-center">
              {formatMonthLabel(calendarMonth.year, calendarMonth.month)}
            </p>
            <button onClick={() => shiftMonth(1)} className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 bg-white flex items-center justify-center">
              <ChevronRight size={16} />
            </button>
            {canDesign && canEdit && (
              <button
                onClick={suggestMonth}
                disabled={saving}
                className="min-h-[44px] px-3 rounded-lg bg-slate-800 text-white text-sm disabled:opacity-50"
              >
                Sugerir mes según días de supervisión
              </button>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-3 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar unidad"
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-sm min-h-[44px]"
              />
            </div>
            <select
              value={filterSupervisor}
              onChange={(e) => setFilterSupervisor(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
            >
              <option value="all">Todos los supervisores</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as typeof filterCategory)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
            >
              <option value="all">Toda categoría</option>
              {SUPERVISION_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-slate-500">
            <span className="font-medium">Días de supervisión</span> (L–D): patrón de la unidad. El resto de columnas son
            fechas reales del mes: <span className="text-blue-700 font-semibold">X</span> visita programada, punto
            punteado = el patrón sugiere ese día.
          </p>

          {/* Móvil: tarjetas */}
          <div className="space-y-3 lg:hidden">
            {assignmentRows.map(({ unit, assignment }) => (
              <div key={unit.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
                <div>
                  <p className="font-semibold text-slate-800">{unit.name}</p>
                  <p className="text-xs text-slate-500">{unit.address || unit.clientName}</p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <select
                    disabled={!canDesign || !canEdit}
                    value={assignment?.supervisorStaffId || ''}
                    onChange={(e) =>
                      saveAssignment({
                        id: assignment?.id,
                        unitId: unit.id,
                        supervisorStaffId: e.target.value || null,
                        coordinatorStaffId: assignment?.coordinatorStaffId || unit.coordinator?.id || null,
                        category: assignment?.category || 'MEDIA',
                        frequency: assignment?.frequency || 'SEMANAL',
                        visitDays: assignment?.visitDays,
                        restWeekday: assignment?.restWeekday,
                      })
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[44px]"
                  >
                    <option value="">Supervisor…</option>
                    {supervisors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      disabled={!canDesign || !canEdit}
                      value={assignment?.category || 'MEDIA'}
                      onChange={(e) =>
                        saveAssignment({
                          id: assignment?.id,
                          unitId: unit.id,
                          supervisorStaffId: assignment?.supervisorStaffId || null,
                          coordinatorStaffId: assignment?.coordinatorStaffId || null,
                          category: e.target.value as SupervisionAssignment['category'],
                          frequency: assignment?.frequency || 'SEMANAL',
                          visitDays: assignment?.visitDays,
                          restWeekday: assignment?.restWeekday,
                        })
                      }
                      className="border border-slate-200 rounded-lg px-2 py-2 text-sm min-h-[44px]"
                    >
                      {SUPERVISION_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <select
                      disabled={!canDesign || !canEdit}
                      value={assignment?.frequency || 'SEMANAL'}
                      onChange={(e) =>
                        saveAssignment({
                          id: assignment?.id,
                          unitId: unit.id,
                          supervisorStaffId: assignment?.supervisorStaffId || null,
                          coordinatorStaffId: assignment?.coordinatorStaffId || null,
                          category: assignment?.category || 'MEDIA',
                          frequency: e.target.value as SupervisionAssignment['frequency'],
                          visitDays: assignment?.visitDays,
                          restWeekday: assignment?.restWeekday,
                        })
                      }
                      className="border border-slate-200 rounded-lg px-2 py-2 text-sm min-h-[44px]"
                    >
                      {SUPERVISION_FREQUENCIES.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Días de supervisión</p>
                  <div className="flex gap-1">
                    {WEEKDAYS.map((d) => {
                      const checked = Boolean(assignment?.visitDays?.[d.key]);
                      return (
                        <button
                          key={d.key}
                          disabled={!canDesign || !canEdit}
                          onClick={() =>
                            saveAssignment({
                              id: assignment?.id,
                              unitId: unit.id,
                              supervisorStaffId:
                                assignment?.supervisorStaffId || unit.rovingSupervisor?.id || null,
                              coordinatorStaffId:
                                assignment?.coordinatorStaffId || unit.coordinator?.id || null,
                              category: assignment?.category || 'MEDIA',
                              frequency: assignment?.frequency || 'SEMANAL',
                              visitDays: { ...(assignment?.visitDays || {}), [d.key]: !checked },
                              restWeekday: assignment?.restWeekday,
                            })
                          }
                          className={`flex-1 min-h-[40px] rounded-lg text-[11px] font-bold ${
                            checked ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Programación real del mes</p>
                  <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
                    {monthDays.map((dateStr) => (
                      <div key={dateStr} className="flex flex-col items-center gap-1 shrink-0">
                        <span className="text-[10px] text-slate-400">
                          {WEEKDAYS[isoFromYmd(dateStr) - 1].short[0]}
                        </span>
                        <span className="text-[10px] text-slate-500">{parseYmd(dateStr).getDate()}</span>
                        {dayCell(unit, assignment, dateStr, true)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Escritorio: tabla amplia */}
          <div className="hidden lg:block overflow-auto bg-white border border-slate-200 rounded-xl max-h-[70vh]">
            <table className="min-w-[1600px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 sticky top-0 z-[2]">
                <tr>
                  <th className="text-left px-3 py-2 font-medium sticky left-0 bg-slate-50 min-w-[180px]">Unidad</th>
                  <th className="text-left px-2 py-2 font-medium min-w-[140px]">Supervisor</th>
                  <th className="text-left px-2 py-2 font-medium min-w-[120px]">Coordinador</th>
                  <th className="text-left px-2 py-2 font-medium">Cat.</th>
                  <th className="text-left px-2 py-2 font-medium">Frec.</th>
                  <th className="px-1 py-2 font-medium text-center text-xs" colSpan={7}>
                    Días de supervisión
                  </th>
                  <th className="px-1 py-2 font-medium text-center text-xs" colSpan={monthDays.length}>
                    Programación real · {formatMonthLabel(calendarMonth.year, calendarMonth.month)}
                  </th>
                </tr>
                <tr>
                  <th className="sticky left-0 bg-slate-50" />
                  <th /><th /><th /><th />
                  {WEEKDAYS.map((d) => (
                    <th key={d.key} className="px-0.5 py-1 font-medium text-center w-8 text-[11px]">
                      {d.short}
                    </th>
                  ))}
                  {monthDays.map((dateStr) => {
                    const iso = isoFromYmd(dateStr);
                    const weekend = iso >= 6;
                    return (
                      <th
                        key={dateStr}
                        className={`px-0.5 py-1 font-medium text-center w-8 text-[10px] ${
                          weekend ? 'text-slate-400' : ''
                        }`}
                      >
                        <div>{WEEKDAYS[iso - 1].short[0]}</div>
                        <div>{parseYmd(dateStr).getDate()}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {assignmentRows.map(({ unit, assignment }) => (
                  <tr key={unit.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 sticky left-0 bg-white">
                      <p className="font-medium text-slate-800">{unit.name}</p>
                      <p className="text-xs text-slate-500">{unit.address || unit.clientName}</p>
                    </td>
                    <td className="px-2 py-1">
                      <select
                        disabled={!canDesign || !canEdit}
                        value={assignment?.supervisorStaffId || ''}
                        onChange={(e) =>
                          saveAssignment({
                            id: assignment?.id,
                            unitId: unit.id,
                            supervisorStaffId: e.target.value || null,
                            coordinatorStaffId: assignment?.coordinatorStaffId || unit.coordinator?.id || null,
                            category: assignment?.category || 'MEDIA',
                            frequency: assignment?.frequency || 'SEMANAL',
                            visitDays: assignment?.visitDays,
                            restWeekday: assignment?.restWeekday,
                          })
                        }
                        className="w-full border border-slate-200 rounded px-1 py-1"
                      >
                        <option value="">Sin asignar</option>
                        {supervisors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <select
                        disabled={!canDesign || !canEdit}
                        value={assignment?.coordinatorStaffId || ''}
                        onChange={(e) =>
                          saveAssignment({
                            id: assignment?.id,
                            unitId: unit.id,
                            supervisorStaffId: assignment?.supervisorStaffId || null,
                            coordinatorStaffId: e.target.value || null,
                            category: assignment?.category || 'MEDIA',
                            frequency: assignment?.frequency || 'SEMANAL',
                            visitDays: assignment?.visitDays,
                            restWeekday: assignment?.restWeekday,
                          })
                        }
                        className="w-full border border-slate-200 rounded px-1 py-1"
                      >
                        <option value="">—</option>
                        {coordinators.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <select
                        disabled={!canDesign || !canEdit}
                        value={assignment?.category || 'MEDIA'}
                        onChange={(e) =>
                          saveAssignment({
                            id: assignment?.id,
                            unitId: unit.id,
                            supervisorStaffId: assignment?.supervisorStaffId || null,
                            coordinatorStaffId: assignment?.coordinatorStaffId || null,
                            category: e.target.value as SupervisionAssignment['category'],
                            frequency: assignment?.frequency || 'SEMANAL',
                            visitDays: assignment?.visitDays,
                            restWeekday: assignment?.restWeekday,
                          })
                        }
                        className="border border-slate-200 rounded px-1 py-1"
                      >
                        {SUPERVISION_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <select
                        disabled={!canDesign || !canEdit}
                        value={assignment?.frequency || 'SEMANAL'}
                        onChange={(e) =>
                          saveAssignment({
                            id: assignment?.id,
                            unitId: unit.id,
                            supervisorStaffId: assignment?.supervisorStaffId || null,
                            coordinatorStaffId: assignment?.coordinatorStaffId || null,
                            category: assignment?.category || 'MEDIA',
                            frequency: e.target.value as SupervisionAssignment['frequency'],
                            visitDays: assignment?.visitDays,
                            restWeekday: assignment?.restWeekday,
                          })
                        }
                        className="border border-slate-200 rounded px-1 py-1 max-w-[120px]"
                      >
                        {SUPERVISION_FREQUENCIES.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    {WEEKDAYS.map((d) => {
                      const checked = Boolean(assignment?.visitDays?.[d.key]);
                      return (
                        <td key={d.key} className="px-0.5 py-1 text-center">
                          <button
                            disabled={!canDesign || !canEdit}
                            onClick={() =>
                              saveAssignment({
                                id: assignment?.id,
                                unitId: unit.id,
                                supervisorStaffId:
                                  assignment?.supervisorStaffId || unit.rovingSupervisor?.id || null,
                                coordinatorStaffId:
                                  assignment?.coordinatorStaffId || unit.coordinator?.id || null,
                                category: assignment?.category || 'MEDIA',
                                frequency: assignment?.frequency || 'SEMANAL',
                                visitDays: { ...(assignment?.visitDays || {}), [d.key]: !checked },
                                restWeekday: assignment?.restWeekday,
                              })
                            }
                            className={`w-7 h-8 rounded text-[11px] font-bold ${
                              checked ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {checked ? 'X' : ''}
                          </button>
                        </td>
                      );
                    })}
                    {monthDays.map((dateStr) => (
                      <td key={dateStr} className="px-0.5 py-1 text-center">
                        {dayCell(unit, assignment, dateStr)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'routes' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <select
              value={routeSupervisorId}
              onChange={(e) => setRouteSupervisorId(e.target.value)}
              className="flex-1 min-w-[160px] border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
              disabled={Boolean(lockedSupervisorId)}
            >
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={routeDate}
              onChange={(e) => setRouteDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
            >
              {monthDays.map((d) => (
                <option key={d} value={d}>
                  {WEEKDAYS[isoFromYmd(d) - 1].short} {parseYmd(d).getDate()}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-slate-500">
            Ruta del día programado (no del patrón L–D). El mapa sigue calles.
            {draftDistance != null ? ` ${draftDistance} km entre paradas.` : ''}
          </p>
          <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 order-2 lg:order-1">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={optimizeDraft}
                  disabled={!draftStops.length}
                  className="min-h-[44px] px-3 rounded-lg bg-slate-800 text-white text-sm flex items-center gap-1 disabled:opacity-50"
                >
                  <Sparkles size={16} /> Ruta más eficiente
                </button>
                {canDesign && canEdit && (
                  <button
                    onClick={saveDraftRoute}
                    disabled={saving || !draftStops.length}
                    className="min-h-[44px] px-3 rounded-lg bg-blue-600 text-white text-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    <Save size={16} /> Guardar orden
                  </button>
                )}
              </div>
              <ol className="space-y-2">
                {draftStops.map((stop, index) => (
                  <li key={stop.unitId} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{stop.unitName}</p>
                    </div>
                    {canDesign && canEdit && (
                      <div className="flex flex-col">
                        <button onClick={() => moveStop(index, -1)} className="p-1 text-slate-400">
                          <ChevronUp size={16} />
                        </button>
                        <button onClick={() => moveStop(index, 1)} className="p-1 text-slate-400">
                          <ChevronDown size={16} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
                {!draftStops.length && (
                  <li className="text-sm text-slate-500 py-6 text-center">
                    No hay visitas programadas este día. Márquelas en Asignación.
                  </li>
                )}
              </ol>
            </div>
            {!modalOpen && (
              <div className="order-1 lg:order-2">
                <SupervisionRouteMap
                  heightClass="h-64 md:h-[420px]"
                  stops={draftStops.map((s, i) => ({
                    id: s.unitId,
                    name: s.unitName,
                    latitude: s.latitude,
                    longitude: s.longitude,
                    order: i + 1,
                  }))}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 bg-white flex items-center justify-center"
            >
              <ChevronLeft size={18} />
            </button>
            <p className="flex-1 text-sm font-medium text-slate-700 text-center capitalize">
              {formatWeekRange(weekStart)}
            </p>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-300 bg-white flex items-center justify-center"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {canDesign && !lockedSupervisorId && (
            <select
              value={filterSupervisor}
              onChange={(e) => setFilterSupervisor(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
            >
              <option value="all">Todos los supervisores</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
            {weekVisitDates.map((dateStr, idx) => {
              const dayVisits = visitsForView.filter((v) => v.visitDate === dateStr);
              const done = dayVisits.filter((v) => v.status === 'completed').length;
              const selected = selectedDay === dateStr;
              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDay(dateStr)}
                  className={`snap-start shrink-0 min-w-[4.5rem] rounded-xl border p-3 text-left ${
                    selected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="text-[11px] font-semibold text-slate-500 uppercase">{WEEKDAYS[idx].short}</p>
                  <p className="text-lg font-bold text-slate-800">{parseYmd(dateStr).getDate()}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{dayVisits.length} vis.</p>
                  {dayVisits.length > 0 && <p className="text-[11px] text-emerald-700">{done} ok</p>}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">Hoy</p>
              <p className="text-xl font-bold text-slate-800">{dayExecutionVisits.length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">En ruta</p>
              <p className="text-xl font-bold text-blue-700">{executionProgress}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">Hechas</p>
              <p className="text-xl font-bold text-emerald-700">{executionDone}</p>
            </div>
          </div>
          <h3 className="font-semibold text-slate-800 capitalize flex items-center gap-2">
            <Calendar size={16} /> {formatDateFull(selectedDay)}
          </h3>
          <div className="space-y-3">
            {dayExecutionVisits.map((visit) => {
              const cat = categoryStyle(visit.category);
              return (
                <div key={visit.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{visit.unitName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {visit.supervisorName}
                        {visit.unitAddress ? ` · ${visit.unitAddress}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[11px] px-2 py-1 rounded-full ${visitStatusClass[visit.status]}`}>
                      {visitStatusLabel[visit.status]}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${cat.badge}`}>{cat.label}</span>
                    {visit.stopOrder ? <span className="text-xs text-slate-500">Parada {visit.stopOrder}</span> : null}
                    {visit.checkInAt && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock size={12} /> {formatTime(visit.checkInAt)}
                      </span>
                    )}
                  </div>
                  {!!visit.evidenceUrls?.length && (
                    <div className="flex gap-2 mt-2">
                      {visit.evidenceUrls.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt="Evidencia" className="w-16 h-16 object-cover rounded-lg border" />
                        </a>
                      ))}
                    </div>
                  )}
                  {canActOnVisit(visit) && (
                    <div className="flex flex-col sm:flex-row gap-2 mt-3">
                      {visit.status === 'pending' && (
                        <button
                          onClick={() => {
                            setCheckInVisit(visit);
                            setCheckInFile(null);
                            setCheckInPreview(null);
                          }}
                          className="min-h-[48px] px-4 rounded-xl bg-blue-600 text-white text-sm font-medium flex items-center justify-center gap-2"
                        >
                          <Camera size={16} /> Registrar llegada
                        </button>
                      )}
                      {visit.status === 'in_progress' && (
                        <button
                          onClick={() => checkOut(visit)}
                          className="min-h-[48px] px-4 rounded-xl bg-emerald-600 text-white text-sm font-medium"
                        >
                          Registrar salida
                        </button>
                      )}
                      {(visit.status === 'pending' || visit.status === 'in_progress') && (
                        <button
                          onClick={() => {
                            setSkipVisitId(visit.id);
                            setSkipReason('');
                          }}
                          className="min-h-[48px] px-4 rounded-xl border border-slate-300 text-sm"
                        >
                          Omitir
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!dayExecutionVisits.length && (
              <p className="text-sm text-slate-500 py-8 text-center">
                No hay visitas programadas este día. El coordinador las marca en Asignación.
              </p>
            )}
          </div>
          {!modalOpen && (
            <>
              <button
                onClick={() => setShowMap((v) => !v)}
                className="w-full md:hidden min-h-[44px] rounded-xl border border-slate-300 bg-white text-sm flex items-center justify-center gap-2"
              >
                <MapPin size={16} /> {showMap ? 'Ocultar mapa' : 'Ver ruta en mapa'}
              </button>
              <div className={`${showMap ? 'block' : 'hidden'} md:block`}>
                <SupervisionRouteMap
                  heightClass="h-64 md:h-[380px]"
                  stops={dayExecutionVisits.map((v, i) => ({
                    id: v.id,
                    name: v.unitName || v.unitId,
                    address: v.unitAddress,
                    latitude: v.latitude,
                    longitude: v.longitude,
                    order: v.stopOrder || i + 1,
                    status: v.status,
                  }))}
                />
              </div>
            </>
          )}
        </div>
      )}

      {showManualVisit && (
        <ModalShell onClose={() => setShowManualVisit(false)}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-slate-800">Visita extra</h3>
            <button onClick={() => setShowManualVisit(false)} className="p-2">
              <X size={18} />
            </button>
          </div>
          <div className="space-y-3">
            <select
              value={manualVisit.supervisorStaffId}
              onChange={(e) => setManualVisit((p) => ({ ...p, supervisorStaffId: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
              disabled={Boolean(lockedSupervisorId)}
            >
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={manualVisit.unitId}
              onChange={(e) => setManualVisit((p) => ({ ...p, unitId: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
            >
              <option value="">Seleccione unidad</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <DateInput
              value={manualVisit.visitDate}
              onChange={(value) => setManualVisit((p) => ({ ...p, visitDate: value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[44px]"
            />
            <button
              onClick={createManual}
              disabled={saving}
              className="w-full min-h-[48px] rounded-xl bg-blue-600 text-white text-sm font-medium"
            >
              Guardar
            </button>
          </div>
        </ModalShell>
      )}

      {skipVisitId && (
        <ModalShell onClose={() => setSkipVisitId(null)}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-slate-800">Omitir visita</h3>
            <button onClick={() => setSkipVisitId(null)} className="p-2">
              <X size={18} />
            </button>
          </div>
          <textarea
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="Motivo"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[90px]"
          />
          <button onClick={confirmSkip} className="w-full mt-3 min-h-[48px] rounded-xl bg-amber-600 text-white text-sm font-medium">
            Confirmar
          </button>
        </ModalShell>
      )}

      {checkInVisit && (
        <ModalShell
          onClose={() => {
            setCheckInVisit(null);
            setCheckInFile(null);
            setCheckInPreview(null);
          }}
        >
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-slate-800">Registrar llegada</h3>
            <button
              onClick={() => {
                setCheckInVisit(null);
                setCheckInFile(null);
                setCheckInPreview(null);
              }}
              className="p-2"
            >
              <X size={18} />
            </button>
          </div>
          <p className="text-sm text-slate-700 mb-1">{checkInVisit.unitName}</p>
          <p className="text-xs text-slate-500 mb-3">La foto de evidencia es obligatoria.</p>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-6 min-h-[120px] cursor-pointer">
            <Camera size={22} className="text-slate-400 mb-1" />
            <span className="text-sm text-slate-600 text-center">
              {checkInFile ? checkInFile.name : 'Tomar o elegir foto'}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setCheckInFile(file);
                setCheckInPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
          </label>
          {checkInPreview && (
            <img src={checkInPreview} alt="Vista previa" className="w-full h-44 object-cover rounded-xl mt-3" />
          )}
          <button
            onClick={submitCheckIn}
            disabled={saving || !checkInFile}
            className="w-full mt-4 min-h-[48px] rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
          >
            Confirmar llegada
          </button>
        </ModalShell>
      )}
    </div>
  );
};
