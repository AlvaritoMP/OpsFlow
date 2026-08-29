import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
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
  isMissingTableError,
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

type PlanningTab = 'assignments' | 'routes' | 'schedule' | 'monitor';

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

  const [tab, setTab] = useState<PlanningTab>(canDesign ? 'monitor' : 'schedule');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingTable, setMissingTable] = useState(false);

  const [assignments, setAssignments] = useState<SupervisionAssignment[]>([]);
  const [routes, setRoutes] = useState<Awaited<ReturnType<typeof supervisionPlanningService.getRoutes>>>([]);
  const [visits, setVisits] = useState<SupervisionVisit[]>([]);

  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [monitorDate, setMonitorDate] = useState(formatDateYmd(new Date()));
  const [search, setSearch] = useState('');
  const [filterSupervisor, setFilterSupervisor] = useState(lockedSupervisorId || 'all');
  const [filterCategory, setFilterCategory] = useState<'all' | SupervisionAssignment['category']>('all');

  const [routeSupervisorId, setRouteSupervisorId] = useState('');
  const [routeWeekday, setRouteWeekday] = useState(1);
  const [draftStops, setDraftStops] = useState<
    Array<{ unitId: string; unitName: string; latitude?: number; longitude?: number }>
  >([]);
  const [draftDistance, setDraftDistance] = useState<number | undefined>();
  const [draftOptimized, setDraftOptimized] = useState(false);
  const [routeId, setRouteId] = useState<string | undefined>();

  const [selectedScheduleDay, setSelectedScheduleDay] = useState(formatDateYmd(new Date()));
  const [showManualVisit, setShowManualVisit] = useState(false);
  const [manualVisit, setManualVisit] = useState({ unitId: '', supervisorStaffId: '', visitDate: formatDateYmd(new Date()) });
  const [skipVisitId, setSkipVisitId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');

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
      const weekA = mondayOf(weekStart);
      const weekB = mondayOf(parseYmd(monitorDate));
      const fromDate = weekA <= weekB ? weekA : weekB;
      const toDate = addDays(weekA >= weekB ? weekA : weekB, 6);
      const from = formatDateYmd(fromDate);
      const to = formatDateYmd(toDate);
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
      if (isMissingTableError(err)) {
        setMissingTable(true);
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo cargar la planificación');
      }
    } finally {
      setLoading(false);
    }
  }, [weekStart, lockedSupervisorId, monitorDate]);

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
    const dates = weekDates(weekStart);
    if (!dates.includes(selectedScheduleDay)) {
      setSelectedScheduleDay(dates[0]);
    }
  }, [weekStart, selectedScheduleDay]);

  const loadRouteDraft = useCallback(() => {
    if (!routeSupervisorId) {
      setDraftStops([]);
      setRouteId(undefined);
      setDraftDistance(undefined);
      setDraftOptimized(false);
      return;
    }
    const existing = routes.find(
      (r) => r.supervisorStaffId === routeSupervisorId && r.weekday === routeWeekday
    );
    const fromAssignments = supervisionPlanningService.buildDayStopsFromAssignments(
      hydratedAssignments,
      routeSupervisorId,
      routeWeekday,
      units
    );
    if (existing) {
      const ordered = existing.stops
        .map((stop) => {
          const unit = units.find((u) => u.id === stop.unitId);
          return {
            unitId: stop.unitId,
            unitName: unit?.name || stop.unitName || stop.unitId,
            latitude: unit?.latitude,
            longitude: unit?.longitude,
          };
        })
        .filter((s) => fromAssignments.some((a) => a.unitId === s.unitId));
      const extra = fromAssignments.filter((a) => !ordered.some((s) => s.unitId === a.unitId));
      setDraftStops([...ordered, ...extra]);
      setRouteId(existing.id);
      setDraftDistance(existing.estimatedDistanceKm);
      setDraftOptimized(existing.isOptimized && extra.length === 0);
    } else {
      setDraftStops(fromAssignments);
      setRouteId(undefined);
      setDraftDistance(undefined);
      setDraftOptimized(false);
    }
  }, [routeSupervisorId, routeWeekday, routes, hydratedAssignments, units]);

  useEffect(() => {
    if (tab === 'routes') loadRouteDraft();
  }, [tab, loadRouteDraft]);

  const handleError = (err: unknown) => {
    if (isMissingTableError(err)) setMissingTable(true);
    else setError(err instanceof Error ? err.message : 'Ocurrió un error');
  };

  const saveAssignment = async (input: Parameters<typeof supervisionPlanningService.upsertAssignment>[0]) => {
    if (!canDesign || !canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await supervisionPlanningService.upsertAssignment({ ...input, userId: currentUser.id });
      setAssignments((prev) => {
        const rest = prev.filter((a) => a.unitId !== saved.unitId);
        return [...rest, saved];
      });
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
        if (filterSupervisor !== 'all') {
          if ((row.assignment?.supervisorStaffId || '') !== filterSupervisor) return false;
        }
        if (filterCategory !== 'all' && row.assignment?.category !== filterCategory) return false;
        if (!q) return true;
        return `${row.unit.name} ${row.unit.clientName} ${row.unit.address} ${row.assignment?.supervisorName || ''}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => a.unit.name.localeCompare(b.unit.name, 'es'));
  }, [units, hydratedAssignments, search, filterSupervisor, filterCategory]);

  const summary = useMemo(() => {
    return supervisors.map((supervisor) => {
      const rows = hydratedAssignments.filter((a) => a.supervisorStaffId === supervisor.id && a.isActive);
      return {
        supervisor,
        units: rows.length,
        alta: rows.filter((a) => a.category === 'ALTA').length,
        media: rows.filter((a) => a.category === 'MEDIA').length,
        baja: rows.filter((a) => a.category === 'BAJA').length,
      };
    }).filter((s) => s.units > 0);
  }, [supervisors, hydratedAssignments]);

  const weekVisitDates = weekDates(weekStart);
  const visitsForSchedule = useMemo(() => {
    const list = lockedSupervisorId
      ? hydratedVisits.filter((v) => v.supervisorStaffId === lockedSupervisorId)
      : filterSupervisor === 'all'
        ? hydratedVisits
        : hydratedVisits.filter((v) => v.supervisorStaffId === filterSupervisor);
    return [...list].sort((a, b) => (a.stopOrder || 99) - (b.stopOrder || 99));
  }, [hydratedVisits, lockedSupervisorId, filterSupervisor]);

  const monitorVisits = useMemo(() => {
    const dayVisits = hydratedVisits.filter((v) => v.visitDate === monitorDate);
    if (lockedSupervisorId) return dayVisits.filter((v) => v.supervisorStaffId === lockedSupervisorId);
    if (filterSupervisor !== 'all') return dayVisits.filter((v) => v.supervisorStaffId === filterSupervisor);
    return dayVisits;
  }, [hydratedVisits, monitorDate, lockedSupervisorId, filterSupervisor]);

  const dayScheduleVisits = visitsForSchedule.filter((v) => v.visitDate === selectedScheduleDay);

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
    const weekday = WEEKDAYS.find((d) => d.iso === routeWeekday);
    setSaving(true);
    setError(null);
    try {
      const saved = await supervisionPlanningService.saveRoute({
        id: routeId,
        supervisorStaffId: routeSupervisorId,
        weekday: routeWeekday,
        name: `Ruta ${weekday?.label || ''} · ${supervisor?.name || ''}`.trim(),
        unitIds: draftStops.map((s) => s.unitId),
        isOptimized: draftOptimized,
        estimatedDistanceKm: draftDistance,
        userId: currentUser.id,
      });
      setRoutes((prev) => {
        const rest = prev.filter(
          (r) => !(r.supervisorStaffId === saved.supervisorStaffId && r.weekday === saved.weekday)
        );
        return [...rest, saved];
      });
      setRouteId(saved.id);
      const dateStr = weekDates(weekStart)[routeWeekday - 1];
      if (dateStr) {
        const orderByUnit = new Map<string, number>(
          draftStops.map((stop, index) => [stop.unitId, index + 1])
        );
        const pending = visits.filter(
          (v) =>
            v.visitDate === dateStr &&
            v.supervisorStaffId === routeSupervisorId &&
            v.status === 'pending'
        );
        const updatedVisits = await Promise.all(
          pending.map(async (visit) => {
            const order = orderByUnit.get(visit.unitId);
            if (!order || visit.stopOrder === order) return visit;
            return supervisionPlanningService.updateVisit(visit.id, { stopOrder: order }, currentUser.id);
          })
        );
        setVisits((prev) =>
          prev.map((visit) => updatedVisits.find((u) => u.id === visit.id) || visit)
        );
      }
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const generateWeek = async () => {
    if (!canDesign || !canEdit) return;
    if (!window.confirm(`¿Generar las visitas de la semana ${formatWeekRange(weekStart)}? Las ya existentes no se duplican.`)) {
      return;
    }
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

  const canActOnVisit = (visit: SupervisionVisit) => {
    if (!canEdit) return false;
    if (canDesign) return true;
    return Boolean(lockedSupervisorId && visit.supervisorStaffId === lockedSupervisorId);
  };

  const checkIn = async (visit: SupervisionVisit) => {
    if (!canActOnVisit(visit)) return;
    setSaving(true);
    try {
      const geo = await getGeo();
      const updated = await supervisionPlanningService.updateVisit(
        visit.id,
        {
          status: 'in_progress',
          checkInAt: new Date().toISOString(),
          checkInLat: geo?.lat ?? null,
          checkInLng: geo?.lng ?? null,
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
      await supervisionPlanningService.createManualVisit({
        ...manualVisit,
        userId: currentUser.id,
      });
      setShowManualVisit(false);
      await loadAll();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ id: PlanningTab; label: string; hidden?: boolean }> = [
    { id: 'assignments', label: 'Asignación', hidden: !canDesign },
    { id: 'routes', label: 'Rutas', hidden: !canDesign },
    { id: 'schedule', label: lockedSupervisorId ? 'Mi semana' : 'Cronograma' },
    { id: 'monitor', label: 'Monitoreo' },
  ];

  const visibleTabs = tabs.filter((t) => !t.hidden);

  if (missingTable) {
    return (
      <div className="p-6">
        <div className="max-w-2xl bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-amber-900 flex items-center gap-2">
            <AlertTriangle size={18} /> Falta crear las tablas de supervisión
          </h2>
          <p className="text-sm text-amber-800 mt-2">
            Ejecute en Supabase el archivo <code className="font-mono">database/migrations/create_supervision_planning.sql</code> y recargue esta sección.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Supervisión de campo</h1>
          <p className="text-sm text-slate-500 mt-1">
            Rutas y cronograma semanal de supervisores, con seguimiento de ejecución para coordinadores.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canDesign && canEdit && tab === 'schedule' && (
            <button
              onClick={generateWeek}
              disabled={saving}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Generar semana
            </button>
          )}
          {canEdit && (tab === 'schedule' || tab === 'monitor') && (
            <button
              onClick={() => {
                setManualVisit({
                  unitId: '',
                  supervisorStaffId: lockedSupervisorId || routeSupervisorId || supervisors[0]?.id || '',
                  visitDate: tab === 'monitor' ? monitorDate : selectedScheduleDay,
                });
                setShowManualVisit(true);
              }}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1"
            >
              <Plus size={16} /> Visita extra
            </button>
          )}
        </div>
      </div>

      {currentUser.role === 'OPERATIONS_SUPERVISOR' && !linkedStaff && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          Su usuario no está vinculado a un supervisor del equipo de gestión. Pida que el correo coincida con el registro de Personal de gestión para ver solo su ruta.
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3 flex justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}

      {summary.length > 0 && (tab === 'assignments' || tab === 'monitor') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {summary.map((item) => (
            <div key={item.supervisor.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="font-semibold text-slate-800">{item.supervisor.name}</p>
              <p className="text-xs text-slate-500 mt-1">{item.units} unidades asignadas</p>
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
        {visibleTabs.map((item) => (
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
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as typeof filterCategory)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">Toda categoría</option>
              {SUPERVISION_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
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
                    <th key={d.key} className="px-1 py-2 font-medium text-center w-10">{d.short}</th>
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
                          <option key={s.id} value={s.id}>{s.name}</option>
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
                          <option key={s.id} value={s.id}>{s.name}</option>
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
                          <option key={c.value} value={c.value}>{c.label}</option>
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
                          <option key={f.value} value={f.value}>{f.label}</option>
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
                                supervisorStaffId: assignment?.supervisorStaffId || unit.rovingSupervisor?.id || null,
                                coordinatorStaffId: assignment?.coordinatorStaffId || unit.coordinator?.id || null,
                                category: assignment?.category || 'MEDIA',
                                frequency: assignment?.frequency || 'SEMANAL',
                                visitDays: {
                                  ...(assignment?.visitDays || {}),
                                  [d.key]: !checked,
                                },
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
      ) : tab === 'routes' ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <select
                value={routeSupervisorId}
                onChange={(e) => setRouteSupervisorId(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[180px]"
                disabled={Boolean(lockedSupervisorId)}
              >
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select
                value={routeWeekday}
                onChange={(e) => setRouteWeekday(Number(e.target.value))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.iso} value={d.iso}>{d.label}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500">
              Las paradas salen de las unidades marcadas ese día. Use optimizar para el recorrido más corto según coordenadas.
              {draftDistance != null ? ` Distancia estimada: ${draftDistance} km.` : ''}
            </p>
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
                  <Save size={16} /> Guardar ruta
                </button>
              )}
              {draftOptimized && (
                <span className="text-xs text-emerald-700 self-center">Orden optimizado</span>
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
                      <button onClick={() => moveStop(index, -1)} className="text-slate-400 hover:text-slate-700"><ChevronUp size={14} /></button>
                      <button onClick={() => moveStop(index, 1)} className="text-slate-400 hover:text-slate-700"><ChevronDown size={14} /></button>
                    </div>
                  )}
                </li>
              ))}
              {!draftStops.length && (
                <li className="text-sm text-slate-500 py-6 text-center">
                  No hay unidades asignadas a este supervisor en este día.
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
      ) : tab === 'schedule' ? (
        <div className="space-y-4">
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
            {canDesign && !lockedSupervisorId && (
              <select
                value={filterSupervisor}
                onChange={(e) => setFilterSupervisor(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">Todos los supervisores</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {weekVisitDates.map((dateStr, idx) => {
              const dayVisits = visitsForSchedule.filter((v) => v.visitDate === dateStr);
              const done = dayVisits.filter((v) => v.status === 'completed').length;
              const selected = selectedScheduleDay === dateStr;
              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedScheduleDay(dateStr)}
                  className={`text-left rounded-xl border p-3 ${
                    selected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-500 uppercase">{WEEKDAYS[idx].short}</p>
                  <p className="text-sm font-bold text-slate-800">{parseYmd(dateStr).getDate()}</p>
                  <p className="text-xs text-slate-500 mt-2">{dayVisits.length} visitas</p>
                  {dayVisits.length > 0 && (
                    <p className="text-xs text-emerald-700">{done} hechas</p>
                  )}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="font-semibold text-slate-800 capitalize flex items-center gap-2">
                <Calendar size={16} /> {formatDateFull(selectedScheduleDay)}
              </h3>
              <div className="mt-4 space-y-2">
                {dayScheduleVisits.map((visit) => {
                  const cat = categoryStyle(visit.category);
                  return (
                    <div key={visit.id} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-800">{visit.unitName}</p>
                          <p className="text-xs text-slate-500">{visit.supervisorName} · {visit.unitAddress}</p>
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
                      {canActOnVisit(visit) && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {visit.status === 'pending' && (
                            <button onClick={() => checkIn(visit)} className="px-2 py-1 text-xs rounded bg-blue-600 text-white">
                              Registrar llegada
                            </button>
                          )}
                          {visit.status === 'in_progress' && (
                            <button onClick={() => checkOut(visit)} className="px-2 py-1 text-xs rounded bg-emerald-600 text-white">
                              Registrar salida
                            </button>
                          )}
                          {(visit.status === 'pending' || visit.status === 'in_progress') && (
                            <button
                              onClick={() => { setSkipVisitId(visit.id); setSkipReason(''); }}
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
                {!dayScheduleVisits.length && (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    No hay visitas este día. El coordinador puede generar la semana o agregar una visita extra.
                  </p>
                )}
              </div>
            </div>
            <SupervisionRouteMap
              stops={dayScheduleVisits.map((v, i) => ({
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
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <DateInput value={monitorDate} onChange={setMonitorDate} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            {canDesign && !lockedSupervisorId && (
              <select
                value={filterSupervisor}
                onChange={(e) => setFilterSupervisor(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">Todos los supervisores</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          {(() => {
            const groups = supervisors
              .map((supervisor) => {
                const list = monitorVisits.filter((v) => v.supervisorStaffId === supervisor.id);
                const done = list.filter((v) => v.status === 'completed').length;
                return { supervisor, list, done };
              })
              .filter((g) => g.list.length > 0);
            const total = monitorVisits.length;
            const done = monitorVisits.filter((v) => v.status === 'completed').length;
            const inProgress = monitorVisits.filter((v) => v.status === 'in_progress').length;
            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs text-slate-500">Programadas</p>
                    <p className="text-2xl font-bold text-slate-800">{total}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs text-slate-500">En ruta</p>
                    <p className="text-2xl font-bold text-blue-700">{inProgress}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs text-slate-500">Completadas</p>
                    <p className="text-2xl font-bold text-emerald-700">{done}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs text-slate-500">Avance</p>
                    <p className="text-2xl font-bold text-slate-800">{total ? Math.round((done / total) * 100) : 0}%</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    {groups.map((group) => (
                      <div key={group.supervisor.id} className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <p className="font-semibold text-slate-800">{group.supervisor.name}</p>
                            <p className="text-xs text-slate-500">{group.done}/{group.list.length} completadas</p>
                          </div>
                          <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${group.list.length ? (group.done / group.list.length) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                        <ul className="space-y-2">
                          {group.list
                            .slice()
                            .sort((a, b) => (a.stopOrder || 99) - (b.stopOrder || 99))
                            .map((visit) => (
                              <li key={visit.id} className="flex items-center justify-between gap-2 text-sm">
                                <span className="truncate">{visit.stopOrder ? `${visit.stopOrder}. ` : ''}{visit.unitName}</span>
                                <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${visitStatusClass[visit.status]}`}>
                                  {visitStatusLabel[visit.status]}
                                  {visit.checkInAt ? ` · ${formatTime(visit.checkInAt)}` : ''}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                    {!groups.length && (
                      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
                        No hay visitas este día. Genere la semana desde Cronograma.
                      </div>
                    )}
                  </div>
                  <SupervisionRouteMap
                    stops={monitorVisits.map((v, i) => ({
                      id: v.id,
                      name: `${v.supervisorName || ''} · ${v.unitName || v.unitId}`,
                      address: v.unitAddress,
                      latitude: v.latitude,
                      longitude: v.longitude,
                      order: v.stopOrder || i + 1,
                      status: v.status,
                    }))}
                  />
                </div>
              </>
            );
          })()}
        </div>
      )}

      {showManualVisit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-800">Visita extra</h3>
              <button onClick={() => setShowManualVisit(false)}><X size={16} /></button>
            </div>
            <select
              value={manualVisit.supervisorStaffId}
              onChange={(e) => setManualVisit((p) => ({ ...p, supervisorStaffId: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              disabled={Boolean(lockedSupervisorId)}
            >
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={manualVisit.unitId}
              onChange={(e) => setManualVisit((p) => ({ ...p, unitId: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Seleccione unidad</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <DateInput
              value={manualVisit.visitDate}
              onChange={(value) => setManualVisit((p) => ({ ...p, visitDate: value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowManualVisit(false)} className="px-3 py-2 text-sm">Cancelar</button>
              <button onClick={createManual} disabled={saving} className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white">
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
              <button onClick={() => setSkipVisitId(null)}><X size={16} /></button>
            </div>
            <textarea
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              placeholder="Motivo (cliente cerrado, coordinación, etc.)"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[90px]"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setSkipVisitId(null)} className="px-3 py-2 text-sm">Cancelar</button>
              <button onClick={confirmSkip} className="px-3 py-2 text-sm rounded-lg bg-amber-600 text-white">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
