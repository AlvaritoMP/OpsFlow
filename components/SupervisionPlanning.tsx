import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
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
  formatTime,
  formatWeekRange,
  frequencyLabel,
  isMissingTableError,
  isTheoreticallyExpected,
  mondayOf,
  parseYmd,
  weekDates,
} from '../utils/supervisionPlanning';

interface SupervisionPlanningProps {
  units: Unit[];
  currentUser: User;
  managementStaff: ManagementStaff[];
  canEdit: boolean;
}

type PlanningTab = 'assignments' | 'plan' | 'routes' | 'execution';

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

  const [tab, setTab] = useState<PlanningTab>(canDesign ? 'plan' : 'execution');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingTable, setMissingTable] = useState(false);

  const [assignments, setAssignments] = useState<SupervisionAssignment[]>([]);
  const [routes, setRoutes] = useState<Awaited<ReturnType<typeof supervisionPlanningService.getRoutes>>>([]);
  const [visits, setVisits] = useState<SupervisionVisit[]>([]);

  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [search, setSearch] = useState('');
  const [filterSupervisor, setFilterSupervisor] = useState(lockedSupervisorId || 'all');
  const [filterCategory, setFilterCategory] = useState<'all' | SupervisionAssignment['category']>('all');
  const [planSupervisorId, setPlanSupervisorId] = useState(lockedSupervisorId || '');

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

  const hydratedAssignments = useMemo(
    () => assignments.map((a) => hydrateAssignment(a, units, activeStaff)),
    [assignments, units, activeStaff]
  );

  const hydratedVisits = useMemo(
    () => visits.map((v) => hydrateVisit(v, units, activeStaff, hydratedAssignments)),
    [visits, units, activeStaff, hydratedAssignments]
  );

  const weekVisitDates = useMemo(() => weekDates(weekStart), [weekStart]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = formatDateYmd(weekStart);
      const to = formatDateYmd(addDays(weekStart, 6));
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
      else setError(err instanceof Error ? err.message : 'No se pudo cargar la planificación');
    } finally {
      setLoading(false);
    }
  }, [weekStart, lockedSupervisorId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (lockedSupervisorId) {
      setFilterSupervisor(lockedSupervisorId);
      setRouteSupervisorId(lockedSupervisorId);
      setPlanSupervisorId(lockedSupervisorId);
    } else {
      if (!routeSupervisorId && supervisors[0]) setRouteSupervisorId(supervisors[0].id);
      if (!planSupervisorId && supervisors[0]) setPlanSupervisorId(supervisors[0].id);
    }
  }, [lockedSupervisorId, supervisors, routeSupervisorId, planSupervisorId]);

  useEffect(() => {
    if (!weekVisitDates.includes(selectedDay)) setSelectedDay(weekVisitDates[0]);
    if (!weekVisitDates.includes(routeDate)) setRouteDate(weekVisitDates[0]);
  }, [weekStart, selectedDay, routeDate, weekVisitDates]);

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

  const summary = useMemo(
    () =>
      supervisors
        .map((supervisor) => {
          const rows = hydratedAssignments.filter(
            (a) => a.supervisorStaffId === supervisor.id && a.isActive
          );
          return {
            supervisor,
            units: rows.length,
            alta: rows.filter((a) => a.category === 'ALTA').length,
            media: rows.filter((a) => a.category === 'MEDIA').length,
            baja: rows.filter((a) => a.category === 'BAJA').length,
          };
        })
        .filter((s) => s.units > 0),
    [supervisors, hydratedAssignments]
  );

  const visitsForView = useMemo(() => {
    const list = lockedSupervisorId
      ? hydratedVisits.filter((v) => v.supervisorStaffId === lockedSupervisorId)
      : filterSupervisor === 'all'
        ? hydratedVisits
        : hydratedVisits.filter((v) => v.supervisorStaffId === filterSupervisor);
    return [...list].sort((a, b) => (a.stopOrder || 99) - (b.stopOrder || 99));
  }, [hydratedVisits, lockedSupervisorId, filterSupervisor]);

  const dayExecutionVisits = visitsForView.filter((v) => v.visitDate === selectedDay);

  const planAssignments = useMemo(
    () =>
      hydratedAssignments.filter(
        (a) => a.isActive && a.supervisorStaffId && a.supervisorStaffId === planSupervisorId
      ),
    [hydratedAssignments, planSupervisorId]
  );

  const theoreticalCount = useMemo(
    () =>
      planAssignments.reduce(
        (sum, a) => sum + weekVisitDates.filter((d) => isTheoreticallyExpected(a, parseYmd(d))).length,
        0
      ),
    [planAssignments, weekVisitDates]
  );

  const plannedCount = hydratedVisits.filter(
    (v) => v.supervisorStaffId === planSupervisorId && v.status !== 'cancelled'
  ).length;

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
          return supervisionPlanningService.updateVisit(
            stop.visitId,
            { stopOrder: index + 1 },
            currentUser.id
          );
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

  const suggestFromTheoretical = async () => {
    if (!canDesign || !canEdit) return;
    setSaving(true);
    setError(null);
    try {
      await supervisionPlanningService.generateWeek(formatDateYmd(weekStart), currentUser.id);
      await loadAll();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const togglePlannedDay = async (assignment: SupervisionAssignment, dateStr: string) => {
    if (!canDesign || !canEdit || !assignment.supervisorStaffId) return;
    const existing = hydratedVisits.find(
      (v) =>
        v.unitId === assignment.unitId &&
        v.visitDate === dateStr &&
        v.supervisorStaffId === assignment.supervisorStaffId
    );
    setSaving(true);
    setError(null);
    try {
      if (existing) {
        if (existing.status !== 'pending') {
          setError('Esa visita ya tiene ejecución y no se puede quitar de la planificación.');
          return;
        }
        await supervisionPlanningService.deleteVisit(existing.id);
        setVisits((prev) => prev.filter((v) => v.id !== existing.id));
      } else {
        const weekdayRoute = routes.find(
          (r) => r.supervisorStaffId === assignment.supervisorStaffId && r.weekday === isoFromYmd(dateStr)
        );
        const created = await supervisionPlanningService.createManualVisit({
          unitId: assignment.unitId,
          supervisorStaffId: assignment.supervisorStaffId,
          coordinatorStaffId: assignment.coordinatorStaffId,
          visitDate: dateStr,
          userId: currentUser.id,
        });
        const stopOrder = weekdayRoute?.stops.find((s) => s.unitId === assignment.unitId)?.stopOrder;
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

  const visibleTabs: Array<{ id: PlanningTab; label: string; hidden?: boolean }> = [
    { id: 'assignments', label: 'Asignación teórica', hidden: !canDesign },
    { id: 'plan', label: 'Planificación', hidden: !canDesign },
    { id: 'routes', label: 'Rutas', hidden: !canDesign },
    { id: 'execution', label: lockedSupervisorId ? 'Mi ejecución' : 'Ejecución' },
  ];

  const weekNav = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => setWeekStart(addDays(weekStart, -7))}
        className="p-2 rounded-lg border border-slate-300 bg-white"
      >
        <ChevronLeft size={16} />
      </button>
      <p className="text-sm font-medium text-slate-700 min-w-[180px] text-center capitalize">
        {formatWeekRange(weekStart)}
      </p>
      <button
        onClick={() => setWeekStart(addDays(weekStart, 7))}
        className="p-2 rounded-lg border border-slate-300 bg-white"
      >
        <ChevronRight size={16} />
      </button>
      <button
        onClick={() => setWeekStart(mondayOf(new Date()))}
        className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
      >
        Esta semana
      </button>
    </div>
  );

  if (missingTable) {
    return (
      <div className="p-6">
        <div className="max-w-2xl bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-amber-900 flex items-center gap-2">
            <AlertTriangle size={18} /> Falta crear las tablas de supervisión
          </h2>
          <p className="text-sm text-amber-800 mt-2">
            Ejecute en Supabase <code className="font-mono">database/migrations/create_supervision_planning.sql</code>
            {' '}y, si ya lo corrió, también{' '}
            <code className="font-mono">database/migrations/add_supervision_visit_evidence.sql</code>.
          </p>
        </div>
      </div>
    );
  }

  const executionDone = dayExecutionVisits.filter((v) => v.status === 'completed').length;
  const executionProgress = dayExecutionVisits.filter((v) => v.status === 'in_progress').length;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Supervisión de campo</h1>
          <p className="text-sm text-slate-500 mt-1">
            Asignación teórica, programación real de la semana, rutas por calles y ejecución con evidencia.
          </p>
        </div>
        {canEdit && (tab === 'plan' || tab === 'execution') && (
          <button
            onClick={() => {
              setManualVisit({
                unitId: '',
                supervisorStaffId: lockedSupervisorId || planSupervisorId || supervisors[0]?.id || '',
                visitDate: selectedDay,
              });
              setShowManualVisit(true);
            }}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1"
          >
            <Plus size={16} /> Visita extra
          </button>
        )}
      </div>

      {currentUser.role === 'OPERATIONS_SUPERVISOR' && !linkedStaff && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          Su usuario no está vinculado a un supervisor del equipo de gestión. Pida que el correo coincida con el registro de Personal de gestión.
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

      {summary.length > 0 && tab === 'assignments' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {summary.map((item) => (
            <div key={item.supervisor.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="font-semibold text-slate-800">{item.supervisor.name}</p>
              <p className="text-xs text-slate-500 mt-1">{item.units} unidades en el teórico</p>
              <div className="flex gap-3 mt-3 text-xs">
                <span className="text-rose-700">Alta {item.alta}</span>
                <span className="text-amber-700">Media {item.media}</span>
                <span className="text-slate-600">Baja {item.baja}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        {visibleTabs
          .filter((t) => !t.hidden)
          .map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                tab === item.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
      </div>

      {loading ? (
        <div className="text-sm text-slate-500 py-12 text-center">Cargando planificación…</div>
      ) : tab === 'assignments' ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Patrón teórico de supervisión (frecuencia y días habituales). La programación real de cada semana se arma en Planificación.
          </p>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar unidad, cliente o supervisor"
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <select
              value={filterSupervisor}
              onChange={(e) => setFilterSupervisor(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
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
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">Toda categoría</option>
              {SUPERVISION_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-auto bg-white border border-slate-200 rounded-xl">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium sticky left-0 bg-slate-50">Unidad</th>
                  <th className="text-left px-3 py-2 font-medium">Supervisor</th>
                  <th className="text-left px-3 py-2 font-medium">Coordinador</th>
                  <th className="text-left px-3 py-2 font-medium">Categoría</th>
                  <th className="text-left px-3 py-2 font-medium">Frecuencia</th>
                  {WEEKDAYS.map((d) => (
                    <th key={d.key} className="px-1 py-2 font-medium text-center w-10">
                      {d.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assignmentRows.map(({ unit, assignment }) => (
                  <tr key={unit.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 sticky left-0 bg-white">
                      <p className="font-medium text-slate-800">{unit.name}</p>
                      <p className="text-xs text-slate-500">{unit.address || unit.clientName}</p>
                    </td>
                    <td className="px-3 py-2">
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
                        className="w-full border border-slate-200 rounded px-2 py-1"
                      >
                        <option value="">Sin asignar</option>
                        {supervisors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
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
                        className="w-full border border-slate-200 rounded px-2 py-1"
                      >
                        <option value="">Sin asignar</option>
                        {coordinators.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
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
                        className="w-full border border-slate-200 rounded px-2 py-1"
                      >
                        {SUPERVISION_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
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
                        className="w-full border border-slate-200 rounded px-2 py-1"
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
                        <td key={d.key} className="px-1 py-2 text-center">
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
                            className={`w-8 h-8 rounded text-xs font-bold ${
                              checked ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {checked ? 'X' : ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'plan' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {weekNav}
            <select
              value={planSupervisorId}
              onChange={(e) => setPlanSupervisorId(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              disabled={Boolean(lockedSupervisorId)}
            >
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {canDesign && canEdit && (
              <button
                onClick={suggestFromTheoretical}
                disabled={saving}
                className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm disabled:opacity-50"
              >
                Sugerir desde el teórico
              </button>
            )}
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-slate-600">
            Marque las visitas reales de la semana (como las fechas del Excel). <strong>T</strong> es lo que pide el teórico;
            la <strong>X</strong> azul es lo programado. Esta semana: <strong>{plannedCount}</strong> programadas de{' '}
            <strong>{theoreticalCount}</strong> teóricas.
          </div>
          <div className="overflow-auto bg-white border border-slate-200 rounded-xl">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium sticky left-0 bg-slate-50">Unidad</th>
                  <th className="text-left px-3 py-2 font-medium">Frecuencia</th>
                  {weekVisitDates.map((dateStr, idx) => (
                    <th key={dateStr} className="px-2 py-2 font-medium text-center">
                      <div>{WEEKDAYS[idx].short}</div>
                      <div className="text-xs font-normal text-slate-400">{parseYmd(dateStr).getDate()}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planAssignments.map((assignment) => (
                  <tr key={assignment.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 sticky left-0 bg-white">
                      <p className="font-medium text-slate-800">{assignment.unitName}</p>
                      <p className="text-xs text-slate-500">{assignment.unitAddress}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{frequencyLabel(assignment.frequency)}</td>
                    {weekVisitDates.map((dateStr) => {
                      const theoretical = isTheoreticallyExpected(assignment, parseYmd(dateStr));
                      const planned = hydratedVisits.find(
                        (v) =>
                          v.unitId === assignment.unitId &&
                          v.visitDate === dateStr &&
                          v.supervisorStaffId === assignment.supervisorStaffId &&
                          v.status !== 'cancelled'
                      );
                      return (
                        <td key={dateStr} className="px-2 py-2 text-center">
                          <button
                            disabled={!canDesign || !canEdit || saving}
                            onClick={() => togglePlannedDay(assignment, dateStr)}
                            className={`w-9 h-9 rounded text-xs font-bold border ${
                              planned
                                ? planned.status === 'pending'
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-emerald-600 text-white border-emerald-600'
                                : theoretical
                                  ? 'bg-white text-slate-400 border-dashed border-slate-400'
                                  : 'bg-slate-50 text-slate-300 border-slate-200'
                            }`}
                            title={theoretical ? 'El teórico sugiere este día' : 'Fuera del patrón teórico'}
                          >
                            {planned ? 'X' : theoretical ? 'T' : ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!planAssignments.length && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                      Asigne unidades a este supervisor en Asignación teórica.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'routes' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            {weekNav}
            <select
              value={routeSupervisorId}
              onChange={(e) => setRouteSupervisorId(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
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
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              {weekVisitDates.map((d, idx) => (
                <option key={d} value={d}>
                  {WEEKDAYS[idx].label} {parseYmd(d).getDate()}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-slate-500">
            El orden y el mapa usan las visitas planificadas de ese día, no el patrón teórico. El trazado sigue calles.
            {draftDistance != null ? ` Distancia entre paradas: ${draftDistance} km.` : ''}
          </p>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={optimizeDraft}
                  disabled={!draftStops.length}
                  className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm flex items-center gap-1 disabled:opacity-50"
                >
                  <Sparkles size={16} /> Ruta más eficiente
                </button>
                {canDesign && canEdit && (
                  <button
                    onClick={saveDraftRoute}
                    disabled={saving || !draftStops.length}
                    className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    <Save size={16} /> Guardar orden
                  </button>
                )}
              </div>
              <ol className="space-y-2 max-h-[420px] overflow-auto">
                {draftStops.map((stop, index) => (
                  <li key={stop.unitId} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{stop.unitName}</p>
                      <p className="text-xs text-slate-500">
                        {stop.latitude != null ? 'Con ubicación' : 'Sin coordenadas'}
                      </p>
                    </div>
                    {canDesign && canEdit && (
                      <div className="flex flex-col">
                        <button onClick={() => moveStop(index, -1)} className="text-slate-400 hover:text-slate-700">
                          <ChevronUp size={14} />
                        </button>
                        <button onClick={() => moveStop(index, 1)} className="text-slate-400 hover:text-slate-700">
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
                {!draftStops.length && (
                  <li className="text-sm text-slate-500 py-6 text-center">
                    No hay visitas planificadas este día. Ármelas en Planificación.
                  </li>
                )}
              </ol>
            </div>
            <SupervisionRouteMap
              stops={draftStops.map((s, i) => ({
                id: s.unitId,
                name: s.unitName,
                latitude: s.latitude,
                longitude: s.longitude,
                order: i + 1,
              }))}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {weekNav}
            {canDesign && !lockedSupervisorId && (
              <select
                value={filterSupervisor}
                onChange={(e) => setFilterSupervisor(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">Todos los supervisores</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Planificadas hoy</p>
              <p className="text-2xl font-bold text-slate-800">{dayExecutionVisits.length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">En ruta</p>
              <p className="text-2xl font-bold text-blue-700">{executionProgress}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Completadas</p>
              <p className="text-2xl font-bold text-emerald-700">{executionDone}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Avance</p>
              <p className="text-2xl font-bold text-slate-800">
                {dayExecutionVisits.length ? Math.round((executionDone / dayExecutionVisits.length) * 100) : 0}%
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {weekVisitDates.map((dateStr, idx) => {
              const dayVisits = visitsForView.filter((v) => v.visitDate === dateStr);
              const done = dayVisits.filter((v) => v.status === 'completed').length;
              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDay(dateStr)}
                  className={`text-left rounded-xl border p-3 ${
                    selectedDay === dateStr ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-500 uppercase">{WEEKDAYS[idx].short}</p>
                  <p className="text-sm font-bold text-slate-800">{parseYmd(dateStr).getDate()}</p>
                  <p className="text-xs text-slate-500 mt-2">{dayVisits.length} planificadas</p>
                  {dayVisits.length > 0 && <p className="text-xs text-emerald-700">{done} hechas</p>}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="font-semibold text-slate-800 capitalize flex items-center gap-2">
                <Calendar size={16} /> {formatDateFull(selectedDay)}
              </h3>
              <div className="mt-4 space-y-2">
                {dayExecutionVisits.map((visit) => {
                  const cat = categoryStyle(visit.category);
                  return (
                    <div key={visit.id} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-800">{visit.unitName}</p>
                          <p className="text-xs text-slate-500">
                            {visit.supervisorName} · {visit.unitAddress}
                          </p>
                        </div>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${visitStatusClass[visit.status]}`}>
                          {visitStatusLabel[visit.status]}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2 items-center">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${cat.badge}`}>{cat.label}</span>
                        {visit.stopOrder ? (
                          <span className="text-xs text-slate-500">Parada {visit.stopOrder}</span>
                        ) : null}
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
                              <img
                                src={url}
                                alt="Evidencia"
                                className="w-14 h-14 object-cover rounded border border-slate-200"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                      {canActOnVisit(visit) && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {visit.status === 'pending' && (
                            <button
                              onClick={() => {
                                setCheckInVisit(visit);
                                setCheckInFile(null);
                                setCheckInPreview(null);
                              }}
                              className="px-2 py-1 text-xs rounded bg-blue-600 text-white flex items-center gap-1"
                            >
                              <Camera size={12} /> Registrar llegada
                            </button>
                          )}
                          {visit.status === 'in_progress' && (
                            <button
                              onClick={() => checkOut(visit)}
                              className="px-2 py-1 text-xs rounded bg-emerald-600 text-white"
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
                              className="px-2 py-1 text-xs rounded border border-slate-300"
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
                  <p className="text-sm text-slate-500 py-6 text-center">
                    No hay visitas planificadas este día. El coordinador las marca en Planificación.
                  </p>
                )}
              </div>
            </div>
            <SupervisionRouteMap
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
        </div>
      )}

      {showManualVisit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-800">Visita extra</h3>
              <button onClick={() => setShowManualVisit(false)}>
                <X size={16} />
              </button>
            </div>
            <select
              value={manualVisit.supervisorStaffId}
              onChange={(e) => setManualVisit((p) => ({ ...p, supervisorStaffId: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
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
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
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
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowManualVisit(false)} className="px-3 py-2 text-sm">
                Cancelar
              </button>
              <button
                onClick={createManual}
                disabled={saving}
                className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {skipVisitId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-800">Omitir visita</h3>
              <button onClick={() => setSkipVisitId(null)}>
                <X size={16} />
              </button>
            </div>
            <textarea
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              placeholder="Motivo"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[90px]"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setSkipVisitId(null)} className="px-3 py-2 text-sm">
                Cancelar
              </button>
              <button onClick={confirmSkip} className="px-3 py-2 text-sm rounded-lg bg-amber-600 text-white">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {checkInVisit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-800">Registrar llegada</h3>
              <button
                onClick={() => {
                  setCheckInVisit(null);
                  setCheckInFile(null);
                  setCheckInPreview(null);
                }}
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-slate-600">{checkInVisit.unitName}</p>
            <p className="text-xs text-slate-500">Adjunte una foto de evidencia (obligatoria).</p>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-4 cursor-pointer hover:bg-slate-50">
              <Camera size={20} className="text-slate-400 mb-1" />
              <span className="text-sm text-slate-600">{checkInFile ? checkInFile.name : 'Tomar o elegir foto'}</span>
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
              <img src={checkInPreview} alt="Vista previa" className="w-full h-40 object-cover rounded-lg" />
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setCheckInVisit(null);
                  setCheckInFile(null);
                  setCheckInPreview(null);
                }}
                className="px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={submitCheckIn}
                disabled={saving || !checkInFile}
                className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50"
              >
                Confirmar llegada
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
