import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Palmtree, Users, FileText, Calendar, Plus, X, Save, Download,
  Search, Filter, AlertCircle, CheckCircle, Clock, Building, Info, FileSpreadsheet,
  Pencil, Trash2, History, ShieldCheck, XCircle,
} from 'lucide-react';
import { Unit, ResourceType, VacationBalanceSummary, VacationPapeleta, VacationDayEntry, User, VacationAuthorizationRequest } from '../types';
import type { AuditLog } from '../services/auditService';
import {
  vacationService,
  DAYS_PER_YEAR,
  DAYS_PER_MONTH,
  FIRST_BLOCK_DAYS,
  SECOND_BLOCK_DAYS,
  MIN_FRACTION_DAYS,
  SECOND_BLOCK_MULTIPLE,
  SERVICE_DAYS_PER_YEAR,
  MAX_VACATION_DAYS_WITHOUT_AUTH,
  requiresVacationAuthorization,
  finalizeVacationPeriod,
  expandVacationWithRestDays,
  allocatePapeletaDays,
} from '../services/vacationService';
import { vacationPdfService } from '../services/vacationPdfService';
import { vacationAuditService } from '../services/vacationAuditService';
import { canActAsVacationAuthorizer } from '../services/vacationAuthService';
import { vacationAuthorizationRequestService } from '../services/vacationAuthorizationRequestService';
import { VacationCalendarView } from './VacationCalendarView';
import { VacationAuthorizationModal } from './VacationAuthorizationModal';
import { DateInput } from './DateInput';
import { formatDateDisplay } from '../utils/dateFormat';
import { excelService } from '../services/excelService';
import { useUsers } from '../hooks/useUsers';

interface VacationsProps {
  units: Unit[];
  currentUser: User;
  /** Si se define, el panel queda fijado a una sola unidad (p. ej. desde UnitDetail) */
  fixedUnitId?: string;
  /** Modo embebido dentro de UnitDetail: sin padding externo ni banner largo */
  embedded?: boolean;
  /** Vista inicial (p. ej. 'approvals' desde alerta global) */
  initialActiveView?: ActiveView;
  /** Notifica al padre el conteo de solicitudes pendientes para el usuario actual */
  onPendingAuthCountChange?: (count: number) => void;
}

type ActiveView = 'balances' | 'monitoring' | 'calendar' | 'papeletas' | 'day-entries' | 'history' | 'approvals';

type AuthModalState = {
  title: string;
  message: string;
  justification?: string;
  onSubmit: (assignedAuthorizerId: string) => Promise<void>;
};

export const Vacations: React.FC<VacationsProps> = ({
  units,
  currentUser,
  fixedUnitId,
  embedded = false,
  initialActiveView,
  onPendingAuthCountChange,
}) => {
  const { users } = useUsers(true);
  const [activeView, setActiveView] = useState<ActiveView>(initialActiveView || (embedded ? 'calendar' : 'balances'));
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<VacationBalanceSummary[]>([]);
  const [papeletas, setPapeletas] = useState<VacationPapeleta[]>([]);
  const [dayEntries, setDayEntries] = useState<VacationDayEntry[]>([]);
  const [onVacation, setOnVacation] = useState<Awaited<ReturnType<typeof vacationService.getWorkersOnVacation>>>([]);

  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>(fixedUnitId ? [fixedUnitId] : []);
  const [searchTerm, setSearchTerm] = useState('');

  const scopedUnits = useMemo(() => {
    if (fixedUnitId) return units.filter(u => u.id === fixedUnitId);
    return units;
  }, [units, fixedUnitId]);

  const filteredUnits = useMemo(() => {
    if (fixedUnitId) return scopedUnits;
    if (selectedUnitIds.length === 0) return units;
    return units.filter(u => selectedUnitIds.includes(u.id));
  }, [units, selectedUnitIds, fixedUnitId, scopedUnits]);

  /**
   * Clave estable: evita recargas cuando el padre refresca `units` con la misma
   * composición (p. ej. visibilitychange / silent reload de useUnits).
   */
  const filteredUnitIdsKey = useMemo(
    () => filteredUnits.map(u => u.id).sort().join(','),
    [filteredUnits]
  );

  const filteredUnitsRef = useRef(filteredUnits);
  filteredUnitsRef.current = filteredUnits;

  const loadSeqRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  // Modales
  const [showHistoricalModal, setShowHistoricalModal] = useState(false);
  const [historicalForm, setHistoricalForm] = useState({ resourceId: '', days: 0, notes: '' });

  const [showDayModal, setShowDayModal] = useState(false);
  const [dayForm, setDayForm] = useState({ resourceId: '', unitId: '', date: '', notes: '', daysCount: 1 as 0.5 | 1 });

  const [showPapeletaModal, setShowPapeletaModal] = useState(false);
  const [papeletaMode, setPapeletaMode] = useState<'direct' | 'accumulated'>('direct');
  const [papeletaForm, setPapeletaForm] = useState({
    resourceId: '',
    unitId: '',
    startDate: '',
    endDate: '',
    returnDate: '',
    notes: '',
    justification: '',
    selectedDayIds: [] as string[],
    /** Días laborales solicitados; si > 0, se expanden con descanso semanal */
    requestedWorkDays: '' as string,
  });

  const [detailPapeleta, setDetailPapeleta] = useState<VacationPapeleta | null>(null);
  const [detailSummary, setDetailSummary] = useState<VacationBalanceSummary | null>(null);
  const [exporting, setExporting] = useState<'balances' | 'papeletas' | 'history' | null>(null);

  const [authModal, setAuthModal] = useState<AuthModalState | null>(null);
  const [editPapeleta, setEditPapeleta] = useState<VacationPapeleta | null>(null);
  const [editPapeletaForm, setEditPapeletaForm] = useState({
    startDate: '', endDate: '', returnDate: '', notes: '',
  });
  const [editDayEntry, setEditDayEntry] = useState<VacationDayEntry | null>(null);
  const [editDayForm, setEditDayForm] = useState({ date: '', daysCount: 1 as 0.5 | 1, notes: '' });

  const [changeLogs, setChangeLogs] = useState<AuditLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');

  const [authRequestsForMe, setAuthRequestsForMe] = useState<VacationAuthorizationRequest[]>([]);
  const [authRequestsByMe, setAuthRequestsByMe] = useState<VacationAuthorizationRequest[]>([]);
  const [authRequestsLoading, setAuthRequestsLoading] = useState(false);
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);

  const allPersonnel = useMemo(() => {
    const list: { resourceId: string; name: string; dni?: string; unitId: string; unitName: string; startDate?: string }[] = [];
    filteredUnits.forEach(unit => {
      (unit.resources || [])
        .filter(r => r.type === ResourceType.PERSONNEL && r.personnelStatus !== 'cesado' && !r.archived)
        .forEach(r => {
          list.push({
            resourceId: r.id,
            name: r.name,
            dni: r.dni,
            unitId: unit.id,
            unitName: unit.name,
            startDate: r.startDate,
          });
        });
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredUnits]);

  const fixedUnitName = fixedUnitId ? scopedUnits[0]?.name : undefined;

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    const unitsSnapshot = filteredUnitsRef.current;
    if (unitsSnapshot.length === 0) {
      setSummaries([]);
      setPapeletas([]);
      setDayEntries([]);
      setOnVacation([]);
      setLoading(false);
      return;
    }

    const silent = options?.silent === true && hasLoadedOnceRef.current;
    const seq = ++loadSeqRef.current;
    if (!silent) setLoading(true);

    try {
      const today = new Date().toISOString().split('T')[0];
      const in30 = new Date();
      in30.setDate(in30.getDate() + 30);
      const toDate = in30.toISOString().split('T')[0];

      const [sums, paps, days, onVac] = await Promise.all([
        vacationService.getUnitSummaries(unitsSnapshot),
        Promise.all(unitsSnapshot.map(u => vacationService.getPapeletas(undefined, u.id))).then(r => r.flat()),
        Promise.all(unitsSnapshot.map(u => vacationService.getDayEntries(undefined, u.id))).then(r => r.flat()),
        vacationService.getWorkersOnVacation(unitsSnapshot, today, toDate),
      ]);

      // Descarta respuestas obsoletas si hubo otra carga más reciente
      if (seq !== loadSeqRef.current) return;

      setSummaries(sums);
      setPapeletas(paps);
      setDayEntries(days);
      setOnVacation(onVac);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      if (seq === loadSeqRef.current) {
        console.error('Error cargando vacaciones:', err);
      }
    } finally {
      if (seq === loadSeqRef.current && !silent) {
        setLoading(false);
      }
    }
  }, []);

  // Solo recargar cuando cambian las unidades filtradas (por id), no por referencia del array
  useEffect(() => {
    void loadData();
  }, [filteredUnitIdsKey, loadData]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const logs = await vacationAuditService.getChangeLogs({
        startDate: historyFrom || undefined,
        endDate: historyTo || undefined,
      });
      setChangeLogs(logs);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyFrom, historyTo]);

  const loadAuthRequests = useCallback(async () => {
    setAuthRequestsLoading(true);
    try {
      const [forMe, byMe] = await Promise.all([
        canActAsVacationAuthorizer(currentUser.role)
          ? vacationAuthorizationRequestService.listPendingForAuthorizer(currentUser.id)
          : Promise.resolve([]),
        vacationAuthorizationRequestService.listPendingByRequester(currentUser.id),
      ]);
      setAuthRequestsForMe(forMe);
      setAuthRequestsByMe(byMe);
      onPendingAuthCountChange?.(forMe.length);
    } finally {
      setAuthRequestsLoading(false);
    }
  }, [currentUser.id, currentUser.role, onPendingAuthCountChange]);

  useEffect(() => {
    if (initialActiveView) setActiveView(initialActiveView);
  }, [initialActiveView]);

  useEffect(() => {
    if (activeView === 'history') {
      void loadHistory();
    }
  }, [activeView, loadHistory]);

  useEffect(() => {
    void loadAuthRequests();
    const interval = setInterval(() => void loadAuthRequests(), 20000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadAuthRequests();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadAuthRequests]);

  useEffect(() => {
    if (activeView === 'approvals') {
      void loadAuthRequests();
    }
  }, [activeView, loadAuthRequests]);

  const openAuthModal = (
    title: string,
    message: string,
    onSubmit: AuthModalState['onSubmit'],
    justification?: string
  ) => {
    setAuthModal({ title, message, onSubmit, justification });
  };

  const handleExportHistory = async () => {
    if (changeLogs.length === 0) {
      alert('No hay registros para exportar.');
      return;
    }
    try {
      setExporting('history');
      await excelService.exportVacationChangeLog(
        changeLogs.map(l => ({
          createdAt: l.createdAt,
          userName: l.userName,
          userEmail: l.userEmail,
          actionType: l.actionType,
          entityType: l.entityType,
          entityName: l.entityName,
          description: l.description,
          authorizedByName: (l.changes as any)?.authorizedBy?.name,
          authorizedByEmail: (l.changes as any)?.authorizedBy?.email,
          justification: (l.changes as any)?.justification,
          changesJson: l.changes ? JSON.stringify(l.changes) : '',
        }))
      );
    } catch {
      alert('Error al exportar historial.');
    } finally {
      setExporting(null);
    }
  };

  const filteredSummaries = useMemo(() => {
    if (!searchTerm.trim()) return summaries;
    const q = searchTerm.toLowerCase();
    return summaries.filter(s =>
      s.workerName.toLowerCase().includes(q) ||
      s.unitName.toLowerCase().includes(q) ||
      s.workerDni?.includes(q)
    );
  }, [summaries, searchTerm]);

  const filteredPapeletas = useMemo(() => {
    let list = papeletas.filter(p => p.status !== 'cancelled');
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(p =>
        p.workerName.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.unitName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [papeletas, searchTerm]);

  const papeletaAccumulatedDates = useMemo(() => {
    const map = new Map<string, string[]>();
    dayEntries
      .filter(d => d.status === 'batched' && d.papeletaId)
      .forEach(d => {
        const list = map.get(d.papeletaId!) || [];
        list.push(d.vacationDate);
        map.set(d.papeletaId!, list);
      });
    map.forEach((dates, id) => map.set(id, dates.sort()));
    return map;
  }, [dayEntries]);

  const handleExportBalances = async () => {
    if (filteredSummaries.length === 0) {
      alert('No hay saldos para exportar con los filtros actuales.');
      return;
    }
    try {
      setExporting('balances');
      await excelService.exportVacationBalances(filteredSummaries, {
        includeUnit: !fixedUnitId,
        unitName: fixedUnitName,
      });
    } catch (err) {
      console.error(err);
      alert('Error al exportar saldos a Excel.');
    } finally {
      setExporting(null);
    }
  };

  const handleExportPapeletas = async () => {
    if (filteredPapeletas.length === 0) {
      alert('No hay papeletas para exportar con los filtros actuales.');
      return;
    }
    try {
      setExporting('papeletas');
      await excelService.exportVacationPapeletas(
        filteredPapeletas.map(p => ({
          ...p,
          accumulatedDates: papeletaAccumulatedDates.get(p.id)?.join(', ') || '',
        })),
        {
          includeUnit: !fixedUnitId,
          unitName: fixedUnitName,
        }
      );
    } catch (err) {
      console.error(err);
      alert('Error al exportar papeletas a Excel.');
    } finally {
      setExporting(null);
    }
  };

  const handleSaveHistorical = async () => {
    if (!historicalForm.resourceId) return;
    const worker = allPersonnel.find(p => p.resourceId === historicalForm.resourceId);
    try {
      await vacationService.upsertBalance(
        historicalForm.resourceId,
        historicalForm.days,
        historicalForm.notes,
        currentUser.id,
        undefined,
        worker?.name
      );
      setShowHistoricalModal(false);
      setHistoricalForm({ resourceId: '', days: 0, notes: '' });
      await loadData();
      if (activeView === 'history') await loadHistory();
    } catch (err: any) {
      alert(err.message || 'Error al guardar saldo histórico');
    }
  };

  const handleAddDay = async () => {
    if (!dayForm.resourceId || !dayForm.unitId || !dayForm.date) return;
    try {
      await vacationService.addDayEntry(
        dayForm.resourceId,
        dayForm.unitId,
        dayForm.date,
        dayForm.notes,
        currentUser.id,
        dayForm.daysCount
      );
      setShowDayModal(false);
      setDayForm({ resourceId: '', unitId: '', date: '', notes: '', daysCount: 1 });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error al registrar día');
    }
  };

  const selectedWorkerSummary = useMemo(
    () => summaries.find(s => s.resourceId === papeletaForm.resourceId) || null,
    [summaries, papeletaForm.resourceId]
  );

  const papeletaPreview = useMemo(() => {
    const summary = selectedWorkerSummary;
    const restDay = summary?.weeklyRestDay ?? 0;
    if (!papeletaForm.startDate) return null;

    if (papeletaMode === 'direct') {
      const workDays = Number(papeletaForm.requestedWorkDays);
      if (workDays > 0) {
        try {
          const expanded = expandVacationWithRestDays(papeletaForm.startDate, workDays, restDay);
          const alloc = allocatePapeletaDays(
            expanded.calendarDays,
            summary?.first15Available ?? 0,
            summary?.second15Available ?? 0
          );
          return { ...expanded, allocation: alloc, restDayLabel: summary?.weeklyRestDayLabel || 'Domingo' };
        } catch {
          return null;
        }
      }
      if (papeletaForm.endDate) {
        try {
          const finalized = finalizeVacationPeriod(papeletaForm.startDate, papeletaForm.endDate, restDay);
          const alloc = allocatePapeletaDays(
            finalized.calendarDays,
            summary?.first15Available ?? 0,
            summary?.second15Available ?? 0
          );
          return {
            endDate: finalized.endDate,
            returnDate: finalized.returnDate,
            calendarDays: finalized.calendarDays,
            includedRestDates: finalized.includedRestDates,
            workDays: 0,
            allocation: alloc,
            restDayLabel: summary?.weeklyRestDayLabel || 'Domingo',
          };
        } catch {
          return null;
        }
      }
    }

    if (papeletaMode === 'accumulated' && papeletaForm.selectedDayIds.length > 0) {
      const selected = dayEntries.filter(d => papeletaForm.selectedDayIds.includes(d.id));
      const daysCount = selected.reduce((s, d) => s + Number(d.daysCount ?? 1), 0);
      // Liberar cupo de pendientes seleccionados al estimar imputación
      const pendingSelected = daysCount;
      const first = Math.round(((summary?.first15Available ?? 0) + pendingSelected) * 10) / 10;
      // Aproximación UI; el servicio recalcula con precisión
      const second = summary?.second15Available ?? 0;
      const alloc = allocatePapeletaDays(daysCount, first, second);
      let period = null as ReturnType<typeof finalizeVacationPeriod> | null;
      if (papeletaForm.startDate && papeletaForm.endDate) {
        try {
          period = finalizeVacationPeriod(papeletaForm.startDate, papeletaForm.endDate, restDay);
        } catch {
          period = null;
        }
      }
      return {
        endDate: period?.endDate || papeletaForm.endDate,
        returnDate: period?.returnDate || papeletaForm.returnDate,
        calendarDays: daysCount,
        includedRestDates: period?.includedRestDates || [],
        workDays: daysCount,
        allocation: alloc,
        restDayLabel: summary?.weeklyRestDayLabel || 'Domingo',
      };
    }
    return null;
  }, [papeletaForm, papeletaMode, selectedWorkerSummary, dayEntries]);

  const submitCreatePapeletaRequest = async (assignedAuthorizerId: string) => {
    const worker = allPersonnel.find(p => p.resourceId === papeletaForm.resourceId);
    if (!worker) return;

    const calendarDays = papeletaPreview?.calendarDays ?? 0;
    const workDays = Number(papeletaForm.requestedWorkDays);
    const endDate = papeletaPreview?.endDate || papeletaForm.endDate;
    const returnDate = papeletaForm.returnDate || papeletaPreview?.returnDate || '';
    const justification = papeletaForm.justification.trim();
    const authorizerName = users.find(u => u.id === assignedAuthorizerId)?.name || 'el autorizador';

    await vacationAuthorizationRequestService.createRequest({
      requestType: 'create_papeleta',
      requesterId: currentUser.id,
      assignedAuthorizerId,
      resourceId: papeletaForm.resourceId,
      unitId: worker.unitId,
      justification,
      summary: `Emitir papeleta — ${worker.name} (${calendarDays} días)`,
      payload: {
        mode: papeletaMode,
        resourceId: papeletaForm.resourceId,
        unitId: worker.unitId,
        unitName: worker.unitName,
        workerName: worker.name,
        workerDni: worker.dni,
        startDate: papeletaForm.startDate,
        endDate: endDate || papeletaForm.endDate,
        returnDate: returnDate || papeletaForm.returnDate,
        notes: papeletaForm.notes,
        requestedWorkDays: workDays > 0 ? workDays : undefined,
        weeklyRestDay: selectedWorkerSummary?.weeklyRestDay,
        selectedDayIds: papeletaForm.selectedDayIds,
        calendarDays,
      },
    });

    setShowPapeletaModal(false);
    setPapeletaForm({
      resourceId: '', unitId: '', startDate: '', endDate: '', returnDate: '', notes: '', justification: '', selectedDayIds: [], requestedWorkDays: '',
    });
    await loadAuthRequests();
    setActiveView('approvals');
    alert(`Solicitud enviada. ${authorizerName} debe ingresar a Vacaciones → Autorizaciones para aprobarla.`);
  };

  const handleCreatePapeleta = async () => {
    const worker = allPersonnel.find(p => p.resourceId === papeletaForm.resourceId);
    if (!worker) return;

    const calendarDays = papeletaPreview?.calendarDays ?? 0;
    const needsAuthorization = requiresVacationAuthorization(calendarDays);
    const justification = papeletaForm.justification.trim();

    if (needsAuthorization && !justification) {
      alert(`Debe ingresar la justificación del goce mayor a ${MAX_VACATION_DAYS_WITHOUT_AUTH} días.`);
      return;
    }

    if (needsAuthorization) {
      openAuthModal(
        'Solicitar autorización de vacaciones',
        `El goce de ${calendarDays} días supera el máximo de ${MAX_VACATION_DAYS_WITHOUT_AUTH} días. Se enviará una solicitud al usuario que designe.`,
        submitCreatePapeletaRequest,
        justification
      );
      return;
    }

    try {
      let result: VacationPapeleta;
      const workDays = Number(papeletaForm.requestedWorkDays);
      const endDate = papeletaPreview?.endDate || papeletaForm.endDate;
      const returnDate = papeletaForm.returnDate || papeletaPreview?.returnDate || '';

      if (papeletaMode === 'direct') {
        result = await vacationService.createDirectPapeleta({
          resourceId: papeletaForm.resourceId,
          unitId: worker.unitId,
          unitName: worker.unitName,
          workerName: worker.name,
          workerDni: worker.dni,
          startDate: papeletaForm.startDate,
          endDate: endDate || papeletaForm.endDate,
          returnDate: returnDate || papeletaForm.returnDate,
          notes: papeletaForm.notes,
          issuedBy: currentUser.id,
          requestedWorkDays: workDays > 0 ? workDays : undefined,
          weeklyRestDay: selectedWorkerSummary?.weeklyRestDay,
        });
      } else {
        result = await vacationService.createPapeletaFromAccumulated({
          resourceId: papeletaForm.resourceId,
          unitId: worker.unitId,
          unitName: worker.unitName,
          workerName: worker.name,
          workerDni: worker.dni,
          startDate: papeletaForm.startDate,
          endDate: endDate || papeletaForm.endDate,
          returnDate: returnDate || papeletaForm.returnDate,
          dayEntryIds: papeletaForm.selectedDayIds,
          notes: papeletaForm.notes,
          issuedBy: currentUser.id,
          weeklyRestDay: selectedWorkerSummary?.weeklyRestDay,
        });
      }

      setShowPapeletaModal(false);
      setPapeletaForm({
        resourceId: '', unitId: '', startDate: '', endDate: '', returnDate: '', notes: '', justification: '', selectedDayIds: [], requestedWorkDays: '',
      });
      await loadData();

      const full = await vacationService.getPapeletaWithDays(result.id);
      if (full) {
        await vacationPdfService.downloadPapeletaPDF(full);
      }
    } catch (err: any) {
      alert(err.message || 'Error al crear papeleta');
    }
  };

  const requestCancelPapeleta = (p: VacationPapeleta) => {
    openAuthModal(
      'Solicitar anulación de papeleta',
      `Se enviará una solicitud para anular la papeleta ${p.code} de ${p.workerName} (${p.calendarDays} días). La anulación se ejecutará cuando el autorizador la apruebe.`,
      async assignedAuthorizerId => {
        const authorizerName = users.find(u => u.id === assignedAuthorizerId)?.name || 'el autorizador';
        await vacationAuthorizationRequestService.createRequest({
          requestType: 'cancel_papeleta',
          requesterId: currentUser.id,
          assignedAuthorizerId,
          resourceId: p.resourceId,
          unitId: p.unitId,
          summary: `Anular papeleta ${p.code} — ${p.workerName} (${p.calendarDays} días)`,
          payload: {
            papeletaId: p.id,
            papeletaCode: p.code,
            workerName: p.workerName,
            calendarDays: p.calendarDays,
            resourceId: p.resourceId,
            unitId: p.unitId,
          },
        });
        await loadAuthRequests();
        setActiveView('approvals');
        alert(`Solicitud enviada. ${authorizerName} debe aprobar la anulación en Autorizaciones.`);
      }
    );
  };

  const requestCancelDayEntry = (d: VacationDayEntry) => {
    const worker = allPersonnel.find(p => p.resourceId === d.resourceId);
    openAuthModal(
      'Solicitar anulación de día a cuenta',
      `Se enviará una solicitud para anular el día ${formatDateDisplay(d.vacationDate)} (${d.daysCount ?? 1} d). La anulación se ejecutará cuando el autorizador la apruebe.`,
      async assignedAuthorizerId => {
        const authorizerName = users.find(u => u.id === assignedAuthorizerId)?.name || 'el autorizador';
        await vacationAuthorizationRequestService.createRequest({
          requestType: 'cancel_day_entry',
          requesterId: currentUser.id,
          assignedAuthorizerId,
          resourceId: d.resourceId,
          unitId: d.unitId,
          summary: `Anular día a cuenta ${formatDateDisplay(d.vacationDate)} — ${worker?.name || 'trabajador'} (${d.daysCount ?? 1} d)`,
          payload: {
            dayEntryId: d.id,
            resourceId: d.resourceId,
            unitId: d.unitId,
            vacationDate: d.vacationDate,
            daysCount: d.daysCount ?? 1,
            workerName: worker?.name,
          },
        });
        await loadAuthRequests();
        setActiveView('approvals');
        alert(`Solicitud enviada. ${authorizerName} debe aprobar la anulación en Autorizaciones.`);
      }
    );
  };

  const handleApproveAuthRequest = async (req: VacationAuthorizationRequest) => {
    if (!window.confirm(`¿Aprobar esta solicitud?\n\n${req.summary}`)) return;
    setResolvingRequestId(req.id);
    try {
      const outcome = await vacationAuthorizationRequestService.approve(req.id, currentUser);
      await loadData();
      await loadAuthRequests();
      if (activeView === 'history') await loadHistory();
      if (outcome.papeletaId) {
        const full = await vacationService.getPapeletaWithDays(outcome.papeletaId);
        if (full) await vacationPdfService.downloadPapeletaPDF(full);
      }
      alert('Solicitud aprobada y acción ejecutada.');
    } catch (err: any) {
      alert(err.message || 'No se pudo aprobar la solicitud');
    } finally {
      setResolvingRequestId(null);
    }
  };

  const handleRejectAuthRequest = async (req: VacationAuthorizationRequest) => {
    const reason = window.prompt('Motivo del rechazo (opcional):') ?? '';
    if (reason === null) return;
    setResolvingRequestId(req.id);
    try {
      await vacationAuthorizationRequestService.reject(req.id, currentUser, reason || undefined);
      await loadAuthRequests();
      alert('Solicitud rechazada.');
    } catch (err: any) {
      alert(err.message || 'No se pudo rechazar la solicitud');
    } finally {
      setResolvingRequestId(null);
    }
  };

  const handleCancelAuthRequest = async (req: VacationAuthorizationRequest) => {
    if (!window.confirm('¿Retirar esta solicitud pendiente?')) return;
    try {
      await vacationAuthorizationRequestService.cancelByRequester(req.id, currentUser.id);
      await loadAuthRequests();
    } catch (err: any) {
      alert(err.message || 'No se pudo cancelar la solicitud');
    }
  };

  const handleSaveEditPapeleta = async () => {
    if (!editPapeleta) return;
    try {
      await vacationService.updatePapeleta(
        editPapeleta.id,
        {
          startDate: editPapeletaForm.startDate,
          endDate: editPapeletaForm.endDate,
          returnDate: editPapeletaForm.returnDate,
          notes: editPapeletaForm.notes,
        },
        currentUser.id
      );
      setEditPapeleta(null);
      await loadData();
      if (activeView === 'history') await loadHistory();
    } catch (err: any) {
      alert(err.message || 'Error al editar papeleta');
    }
  };

  const handleSaveEditDayEntry = async () => {
    if (!editDayEntry) return;
    try {
      await vacationService.updateDayEntry(
        editDayEntry.id,
        {
          vacationDate: editDayForm.date,
          daysCount: editDayForm.daysCount,
          notes: editDayForm.notes,
        },
        currentUser.id
      );
      setEditDayEntry(null);
      await loadData();
      if (activeView === 'history') await loadHistory();
    } catch (err: any) {
      alert(err.message || 'Error al editar día');
    }
  };

  const openPapeletaForWorker = (resourceId: string, mode: 'direct' | 'accumulated') => {
    const worker = allPersonnel.find(p => p.resourceId === resourceId);
    const summary = summaries.find(s => s.resourceId === resourceId);
    const pending = dayEntries.filter(d => d.resourceId === resourceId && d.status === 'pending_batch');

    setPapeletaMode(mode);
    setPapeletaForm({
      resourceId,
      unitId: worker?.unitId || '',
      startDate: '',
      endDate: '',
      returnDate: '',
      notes: '',
      justification: '',
      selectedDayIds: mode === 'accumulated' ? pending.map(d => d.id) : [],
      requestedWorkDays: '',
    });
    setShowPapeletaModal(true);

    if (mode === 'accumulated' && summary && pending.length === 0) {
      alert('No hay días a cuenta pendientes para agrupar en papeleta.');
    }
  };

  const toggleDaySelection = (id: string) => {
    setPapeletaForm(prev => ({
      ...prev,
      selectedDayIds: prev.selectedDayIds.includes(id)
        ? prev.selectedDayIds.filter(x => x !== id)
        : [...prev.selectedDayIds, id],
    }));
  };

  const calcReturnDate = (endDate: string, weeklyRestDay = 0) => {
    if (!endDate) return '';
    try {
      return finalizeVacationPeriod(endDate, endDate, weeklyRestDay).returnDate;
    } catch {
      const [y, m, d] = endDate.split('-').map(Number);
      const dt = new Date(y, m - 1, d + 1);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }
  };

  const pendingAuthCount = authRequestsForMe.length;

  const tabs: { id: ActiveView; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'balances', label: 'Saldos y Control', icon: <Users size={16} /> },
    { id: 'calendar', label: 'Calendario', icon: <Calendar size={16} /> },
    { id: 'monitoring', label: 'Monitoreo', icon: <Clock size={16} /> },
    { id: 'papeletas', label: 'Papeletas', icon: <FileText size={16} /> },
    { id: 'day-entries', label: 'Días a Cuenta', icon: <Building size={16} /> },
    {
      id: 'approvals',
      label: 'Autorizaciones',
      icon: <ShieldCheck size={16} />,
      badge: pendingAuthCount + authRequestsByMe.length > 0
        ? pendingAuthCount + authRequestsByMe.length
        : undefined,
    },
    { id: 'history', label: 'Historial', icon: <History size={16} /> },
  ];

  return (
    <div className={embedded ? 'space-y-4' : 'p-6 md:p-8 space-y-6 animate-in fade-in duration-500'}>
      {/* Header */}
      {!embedded && (
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Palmtree className="text-emerald-600" size={28} />
            Control de Vacaciones
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Régimen general Perú — {DAYS_PER_YEAR} días/año proporcional ({SERVICE_DAYS_PER_YEAR} días servicio) · Primeros {FIRST_BLOCK_DAYS} fraccionables · Segundos {SECOND_BLOCK_DAYS} en múltiplos de {SECOND_BLOCK_MULTIPLE}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setDayForm({ resourceId: '', unitId: '', date: new Date().toISOString().split('T')[0], notes: '', daysCount: 1 }); setShowDayModal(true); }}
            className="bg-amber-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-amber-600 text-sm"
          >
            <Plus size={16} /> Día a cuenta
          </button>
          <button
            onClick={() => { setPapeletaMode('direct'); setPapeletaForm({ resourceId: '', unitId: '', startDate: '', endDate: '', returnDate: '', notes: '', justification: '', selectedDayIds: [], requestedWorkDays: '' }); setShowPapeletaModal(true); }}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-700 text-sm"
          >
            <FileText size={16} /> Nueva Papeleta
          </button>
        </div>
      </div>
      )}

      {embedded && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Palmtree className="text-emerald-600" size={22} />
              Vacaciones — {fixedUnitName || 'Unidad'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Gestión de saldos, papeletas y días a cuenta del personal de esta unidad
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                setDayForm({
                  resourceId: '',
                  unitId: fixedUnitId || '',
                  date: new Date().toISOString().split('T')[0],
                  notes: '',
                  daysCount: 1,
                });
                setShowDayModal(true);
              }}
              className="bg-amber-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 hover:bg-amber-600 text-sm"
            >
              <Plus size={14} /> Día a cuenta
            </button>
            <button
              onClick={() => {
                setPapeletaMode('direct');
                setPapeletaForm({ resourceId: '', unitId: fixedUnitId || '', startDate: '', endDate: '', returnDate: '', notes: '', justification: '', selectedDayIds: [], requestedWorkDays: '' });
                setShowPapeletaModal(true);
              }}
              className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 hover:bg-emerald-700 text-sm"
            >
              <FileText size={14} /> Nueva Papeleta
            </button>
          </div>
        </div>
      )}

      {/* Info banner */}
      {!embedded && (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3 text-sm text-blue-800">
        <Info size={18} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Normativa aplicada (fracción 15 + 15)</p>
          <p className="text-blue-700 mt-1">
            Cada trabajador acumula vacaciones de forma proporcional: {DAYS_PER_YEAR} días por cada {SERVICE_DAYS_PER_YEAR} días
            de servicio calendario (≈ {DAYS_PER_MONTH} por mes completo de 30 días). Los primeros {FIRST_BLOCK_DAYS} días
            ganados de cada año son fraccionables desde medio día. Los segundos {SECOND_BLOCK_DAYS} se gozan en
            múltiplos de {SECOND_BLOCK_MULTIPLE}. El periodo vacacional es calendario e incluye el día de descanso
            semanal (p. ej. 6 días laborales → 7 en papeleta). Otorgar más de {MAX_VACATION_DAYS_WITHOUT_AUTH} días o
            anular vacaciones requiere solicitar autorización a otro usuario; el designado la aprueba en la pestaña Autorizaciones.
          </p>
        </div>
      </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder={fixedUnitId ? 'Buscar trabajador o DNI...' : 'Buscar trabajador, DNI o unidad...'}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
        {!fixedUnitId && (
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          <select
            className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm min-w-[180px]"
            value={selectedUnitIds.length === 1 ? selectedUnitIds[0] : ''}
            onChange={e => setSelectedUnitIds(e.target.value ? [e.target.value] : [])}
          >
            <option value="">Todas las unidades</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeView === tab.id
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
        </div>
      ) : (
        <>
          {/* TAB: Saldos */}
          {activeView === 'balances' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleExportBalances}
                  disabled={exporting === 'balances' || filteredSummaries.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileSpreadsheet size={16} />
                  {exporting === 'balances' ? 'Exportando...' : 'Exportar saldos a Excel'}
                </button>
              </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                    <tr>
                      <th className="text-left p-3">Trabajador</th>
                      {!fixedUnitId && <th className="text-left p-3">Unidad</th>}
                      <th className="text-left p-3">Ingreso</th>
                      <th className="text-center p-3">Ganados</th>
                      <th className="text-center p-3" title="Primeros 15: fraccionables desde 0.5">1.ºs 15</th>
                      <th className="text-center p-3" title="Segundos 15: múltiplos de 7">2.ºs 15</th>
                      <th className="text-center p-3">Usado</th>
                      <th className="text-center p-3">Saldo</th>
                      <th className="text-center p-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSummaries.map(s => (
                      <tr key={s.resourceId} className="hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-medium text-slate-800">{s.workerName}</div>
                          {s.workerDni && <div className="text-xs text-slate-400">DNI: {s.workerDni}</div>}
                          {s.puesto && <div className="text-xs text-slate-400">{s.puesto}</div>}
                          <div className="text-[10px] text-slate-400 mt-0.5">Descanso: {s.weeklyRestDayLabel}</div>
                        </td>
                        {!fixedUnitId && <td className="p-3 text-slate-600">{s.unitName}</td>}
                        <td className="p-3 text-slate-600">{formatDateDisplay(s.startDate) || '—'}</td>
                        <td className="p-3 text-center font-medium text-blue-600">
                          <div>{s.accruedDays}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{s.serviceDays} d. servicio</div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="font-semibold text-sky-700">{s.first15Available}</div>
                          <div className="text-[10px] text-slate-400">disp. / frac.</div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="font-semibold text-violet-700">{s.second15Available}</div>
                          <div className="text-[10px] text-slate-400">×{SECOND_BLOCK_MULTIPLE}</div>
                        </td>
                        <td className="p-3 text-center text-slate-600">
                          <div>{s.totalUsedDays}</div>
                          <div className="text-[10px] text-slate-400">
                            H {s.historicalTakenDays} · P {s.papeletaDays} · A {s.pendingIndividualDays}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`font-bold ${s.availableDays < 0 ? 'text-red-600' : s.availableDays < MIN_FRACTION_DAYS ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {s.availableDays}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-center flex-wrap">
                            <button
                              onClick={() => setDetailSummary(s)}
                              className="text-xs px-2 py-1 bg-sky-100 hover:bg-sky-200 rounded text-sky-800"
                              title="Ver bloques por año"
                            >
                              Bloques
                            </button>
                            <button
                              onClick={() => { setHistoricalForm({ resourceId: s.resourceId, days: s.historicalTakenDays, notes: '' }); setShowHistoricalModal(true); }}
                              className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700"
                              title="Saldo histórico pre-sistema"
                            >
                              Histórico
                            </button>
                            {s.canIssuePapeleta && (
                              <button
                                onClick={() => openPapeletaForWorker(s.resourceId, 'direct')}
                                className="text-xs px-2 py-1 bg-emerald-100 hover:bg-emerald-200 rounded text-emerald-700"
                              >
                                Papeleta
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredSummaries.length === 0 && (
                      <tr>
                        <td colSpan={fixedUnitId ? 8 : 9} className="p-8 text-center text-slate-400">
                          No hay trabajadores con fecha de ingreso registrada. Configure la fecha de ingreso en el personal de cada unidad.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            </div>
          )}

          {/* TAB: Calendario visual */}
          {activeView === 'calendar' && (
            <VacationCalendarView
              units={filteredUnits}
              fixedUnitId={fixedUnitId}
              showUnitLegend={!fixedUnitId}
            />
          )}

          {/* TAB: Monitoreo */}
          {activeView === 'monitoring' && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {onVacation.length === 0 ? (
                <div className="col-span-full p-12 text-center text-slate-400 bg-white rounded-xl border border-dashed">
                  <Palmtree size={48} className="mx-auto mb-3 opacity-30" />
                  <p>Nadie en vacaciones en los próximos 30 días</p>
                </div>
              ) : (
                onVacation.map((v, i) => (
                  <div key={`${v.resourceId}-${v.startDate}-${i}`} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-800">{v.workerName}</h3>
                        {!fixedUnitId && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <Building size={12} /> {v.unitName}
                        </p>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${v.type === 'papeleta' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {v.type === 'papeleta' ? 'Papeleta' : 'Día a cuenta'}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-slate-600">
                      <div className="flex justify-between">
                        <span>Desde:</span>
                        <span className="font-medium">{formatDateDisplay(v.startDate)}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span>Hasta:</span>
                        <span className="font-medium">{formatDateDisplay(v.endDate)}</span>
                      </div>
                      {v.code && (
                        <div className="flex justify-between mt-1">
                          <span>Código:</span>
                          <span className="font-mono text-xs">{v.code}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: Papeletas */}
          {activeView === 'papeletas' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleExportPapeletas}
                  disabled={exporting === 'papeletas' || filteredPapeletas.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileSpreadsheet size={16} />
                  {exporting === 'papeletas' ? 'Exportando...' : 'Exportar papeletas a Excel'}
                </button>
              </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                  <tr>
                    <th className="text-left p-3">Código</th>
                    <th className="text-left p-3">Trabajador</th>
                    <th className="text-left p-3">Unidad</th>
                    <th className="text-left p-3">Salida</th>
                    <th className="text-left p-3">Término</th>
                    <th className="text-left p-3">Retorno</th>
                    <th className="text-center p-3">Días</th>
                    <th className="text-center p-3">Tipo</th>
                    <th className="text-center p-3">Estado</th>
                    <th className="text-center p-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPapeletas.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono text-xs">{p.code}</td>
                      <td className="p-3 font-medium">{p.workerName}</td>
                      <td className="p-3 text-slate-600">{p.unitName}</td>
                        <td className="p-3">{formatDateDisplay(p.startDate)}</td>
                        <td className="p-3">{formatDateDisplay(p.endDate)}</td>
                        <td className="p-3">{formatDateDisplay(p.returnDate)}</td>
                      <td className="p-3 text-center">{p.calendarDays}</td>
                      <td className="p-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.sourceType === 'accumulated' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {p.sourceType === 'accumulated' ? 'Acumulada' : 'Directa'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'issued' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {p.status === 'issued' ? 'Emitida' : p.status === 'cancelled' ? 'Anulada' : p.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          <button
                            onClick={async () => {
                              const full = await vacationService.getPapeletaWithDays(p.id);
                              if (full) await vacationPdfService.downloadPapeletaPDF(full);
                            }}
                            className="text-emerald-600 hover:text-emerald-800 p-1"
                            title="Descargar PDF"
                          >
                            <Download size={16} />
                          </button>
                          {p.status === 'issued' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditPapeleta(p);
                                  setEditPapeletaForm({
                                    startDate: p.startDate,
                                    endDate: p.endDate,
                                    returnDate: p.returnDate,
                                    notes: p.notes || '',
                                  });
                                }}
                                className="text-blue-600 hover:text-blue-800 p-1"
                                title="Editar"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => requestCancelPapeleta(p)}
                                className="text-red-600 hover:text-red-800 p-1"
                                title="Anular (requiere autorización)"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                          {p.sourceType === 'accumulated' && (
                            <button
                              onClick={async () => {
                                const full = await vacationService.getPapeletaWithDays(p.id);
                                setDetailPapeleta(full);
                              }}
                              className="text-blue-600 hover:text-blue-800 text-xs px-1"
                            >
                              Ver días
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredPapeletas.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400">No hay papeletas emitidas</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            </div>
          )}

          {/* TAB: Días a cuenta */}
          {activeView === 'day-entries' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                  <tr>
                    <th className="text-left p-3">Trabajador</th>
                    <th className="text-left p-3">Unidad</th>
                    <th className="text-left p-3">Fecha</th>
                    <th className="text-center p-3">Días</th>
                    <th className="text-center p-3">Estado</th>
                    <th className="text-center p-3">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dayEntries
                    .filter(d => d.status !== 'cancelled')
                    .filter(d => !searchTerm || allPersonnel.find(p => p.resourceId === d.resourceId)?.name.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(d => {
                      const worker = allPersonnel.find(p => p.resourceId === d.resourceId);
                      return (
                        <tr key={d.id} className="hover:bg-slate-50">
                          <td className="p-3 font-medium">{worker?.name || '—'}</td>
                          <td className="p-3 text-slate-600">{worker?.unitName}</td>
                          <td className="p-3">{formatDateDisplay(d.vacationDate)}</td>
                          <td className="p-3 text-center">{d.daysCount ?? 1}</td>
                          <td className="p-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              d.status === 'pending_batch' ? 'bg-amber-100 text-amber-700' :
                              d.status === 'batched' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {d.status === 'pending_batch' ? 'Pendiente' : d.status === 'batched' ? 'En papeleta' : d.status}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {d.status === 'pending_batch' && (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditDayEntry(d);
                                    setEditDayForm({
                                      date: d.vacationDate,
                                      daysCount: (d.daysCount === 0.5 ? 0.5 : 1) as 0.5 | 1,
                                      notes: d.notes || '',
                                    });
                                  }}
                                  className="text-blue-600 hover:text-blue-800 text-xs inline-flex items-center gap-0.5"
                                >
                                  <Pencil size={12} /> Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestCancelDayEntry(d)}
                                  className="text-red-500 hover:text-red-700 text-xs inline-flex items-center gap-0.5"
                                >
                                  <Trash2 size={12} /> Anular
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: Autorizaciones */}
          {activeView === 'approvals' && (
            <div className="space-y-6">
              {pendingAuthCount > 0 && canActAsVacationAuthorizer(currentUser.role) && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex gap-3">
                  <ShieldCheck className="text-indigo-600 shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="font-semibold text-indigo-900">
                      Tiene {pendingAuthCount} solicitud{pendingAuthCount !== 1 ? 'es' : ''} pendiente{pendingAuthCount !== 1 ? 's' : ''} de autorizar
                    </p>
                    <p className="text-sm text-indigo-700 mt-1">
                      Revise cada caso y apruebe o rechace. La acción se ejecutará al aprobar.
                    </p>
                  </div>
                </div>
              )}

              {canActAsVacationAuthorizer(currentUser.role) && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                    <h3 className="font-semibold text-slate-800">Pendientes de mi autorización</h3>
                  </div>
                  {authRequestsLoading ? (
                    <div className="flex justify-center py-10">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                    </div>
                  ) : authRequestsForMe.length === 0 ? (
                    <p className="p-6 text-sm text-slate-500 text-center">No hay solicitudes pendientes para usted.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {authRequestsForMe
                        .filter(r => !fixedUnitId || r.unitId === fixedUnitId)
                        .map(req => (
                          <div key={req.id} className="p-4 space-y-3">
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                                    {req.requestType === 'create_papeleta' ? 'Emitir papeleta' :
                                     req.requestType === 'cancel_papeleta' ? 'Anular papeleta' : 'Anular día a cuenta'}
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    {new Date(req.createdAt).toLocaleString('es-PE')}
                                  </span>
                                </div>
                                <p className="font-medium text-slate-800 mt-1">{req.summary}</p>
                                <p className="text-sm text-slate-600">
                                  Solicitado por <strong>{req.requesterName}</strong>
                                </p>
                                {req.justification && (
                                  <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg p-2 mt-2 whitespace-pre-wrap">
                                    <span className="font-medium">Justificación: </span>{req.justification}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={resolvingRequestId === req.id}
                                  onClick={() => void handleApproveAuthRequest(req)}
                                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  <CheckCircle size={14} /> Aprobar
                                </button>
                                <button
                                  type="button"
                                  disabled={resolvingRequestId === req.id}
                                  onClick={() => void handleRejectAuthRequest(req)}
                                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm hover:bg-red-100 disabled:opacity-50"
                                >
                                  <XCircle size={14} /> Rechazar
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <h3 className="font-semibold text-slate-800">Mis solicitudes enviadas</h3>
                </div>
                {authRequestsLoading ? (
                  <div className="flex justify-center py-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-400" />
                  </div>
                ) : authRequestsByMe.length === 0 ? (
                  <p className="p-6 text-sm text-slate-500 text-center">No tiene solicitudes en espera.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {authRequestsByMe
                      .filter(r => !fixedUnitId || r.unitId === fixedUnitId)
                      .map(req => (
                        <div key={req.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-800">{req.summary}</p>
                            <p className="text-sm text-slate-600 mt-1">
                              Esperando a <strong>{req.assignedAuthorizerName}</strong>
                              <span className="text-slate-400"> · {new Date(req.createdAt).toLocaleString('es-PE')}</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleCancelAuthRequest(req)}
                            className="text-sm text-slate-600 hover:text-red-600 border border-slate-200 px-3 py-1.5 rounded-lg"
                          >
                            Retirar solicitud
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: Historial de cambios */}
          {activeView === 'history' && (
            <div className="space-y-3">
              <div className="flex flex-col md:flex-row gap-3 md:items-end justify-between">
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Desde</label>
                    <DateInput
                      className="border rounded-lg px-3 py-2 text-sm w-full min-w-[140px]"
                      value={historyFrom}
                      onChange={setHistoryFrom}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Hasta</label>
                    <DateInput
                      className="border rounded-lg px-3 py-2 text-sm w-full min-w-[140px]"
                      value={historyTo}
                      onChange={setHistoryTo}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadHistory()}
                    className="self-end px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm hover:bg-slate-200"
                  >
                    Filtrar
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleExportHistory}
                  disabled={exporting === 'history' || changeLogs.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  <FileSpreadsheet size={16} />
                  {exporting === 'history' ? 'Exportando...' : 'Exportar historial a Excel'}
                </button>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {historyLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600 text-xs uppercase sticky top-0">
                        <tr>
                          <th className="text-left p-3">Fecha</th>
                          <th className="text-left p-3">Usuario</th>
                          <th className="text-left p-3">Acción</th>
                          <th className="text-left p-3">Entidad</th>
                          <th className="text-left p-3">Referencia</th>
                          <th className="text-left p-3">Autorizador</th>
                          <th className="text-left p-3">Justificación</th>
                          <th className="text-left p-3">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {changeLogs.map(log => (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="p-3 text-xs whitespace-nowrap">{new Date(log.createdAt).toLocaleString('es-PE')}</td>
                            <td className="p-3">
                              <div className="font-medium">{log.userName}</div>
                              <div className="text-[10px] text-slate-400">{log.userEmail}</div>
                            </td>
                            <td className="p-3">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100">{log.actionType}</span>
                            </td>
                            <td className="p-3 text-xs">{log.entityType}</td>
                            <td className="p-3 text-xs font-mono">{log.entityName || '—'}</td>
                            <td className="p-3 text-xs">{(log.changes as any)?.authorizedBy?.name || '—'}</td>
                            <td className="p-3 text-xs text-slate-600 max-w-[200px] truncate" title={(log.changes as any)?.justification || ''}>
                              {(log.changes as any)?.justification || '—'}
                            </td>
                            <td className="p-3 text-xs text-slate-600 max-w-xs truncate" title={log.description}>{log.description}</td>
                          </tr>
                        ))}
                        {changeLogs.length === 0 && (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-slate-400">No hay cambios registrados en el periodo</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal: Saldo histórico */}
      {showHistoricalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="bg-slate-800 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
              <span className="font-bold">Saldo histórico (pre-sistema)</span>
              <button onClick={() => setShowHistoricalModal(false)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Ingrese los días de vacaciones ya gozados antes de implementar OpsFlow. Estos se descontarán del saldo acumulado.
              </p>
              <div>
                <label className="block text-sm font-medium mb-1">Días gozados (histórico)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="w-full border rounded-lg p-2"
                  value={historicalForm.days}
                  onChange={e => setHistoricalForm({ ...historicalForm, days: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notas (opcional)</label>
                <textarea
                  className="w-full border rounded-lg p-2 text-sm"
                  rows={2}
                  value={historicalForm.notes}
                  onChange={e => setHistoricalForm({ ...historicalForm, notes: e.target.value })}
                />
              </div>
              <button
                onClick={handleSaveHistorical}
                className="w-full bg-emerald-600 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-emerald-700"
              >
                <Save size={16} /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Día a cuenta */}
      {showDayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="bg-amber-500 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
              <span className="font-bold">Registrar día de vacaciones a cuenta</span>
              <button onClick={() => setShowDayModal(false)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Trabajador</label>
                <select
                  className="w-full border rounded-lg p-2"
                  value={dayForm.resourceId}
                  onChange={e => {
                    const w = allPersonnel.find(p => p.resourceId === e.target.value);
                    setDayForm({ ...dayForm, resourceId: e.target.value, unitId: w?.unitId || '' });
                  }}
                >
                  <option value="">Seleccionar...</option>
                  {allPersonnel.map(p => (
                    <option key={p.resourceId} value={p.resourceId}>{p.name} — {p.unitName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fecha del día gozado</label>
                <DateInput
                  value={dayForm.date}
                  onChange={date => setDayForm({ ...dayForm, date })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Duración</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDayForm({ ...dayForm, daysCount: 1 })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${dayForm.daysCount === 1 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    1 día
                  </button>
                  <button
                    type="button"
                    onClick={() => setDayForm({ ...dayForm, daysCount: 0.5 })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${dayForm.daysCount === 0.5 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    Medio día (0.5)
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notas (opcional)</label>
                <input
                  className="w-full border rounded-lg p-2 text-sm"
                  value={dayForm.notes}
                  onChange={e => setDayForm({ ...dayForm, notes: e.target.value })}
                />
              </div>
              <button
                onClick={handleAddDay}
                disabled={!dayForm.resourceId || !dayForm.date}
                className="w-full bg-amber-500 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-amber-600 disabled:opacity-50"
              >
                <Plus size={16} /> Registrar día
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Papeleta */}
      {showPapeletaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="bg-emerald-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center sticky top-0">
              <span className="font-bold">Emitir Papeleta de Vacaciones</span>
              <button onClick={() => setShowPapeletaModal(false)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setPapeletaMode('direct')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${papeletaMode === 'direct' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  Vacaciones continuas
                </button>
                <button
                  onClick={() => setPapeletaMode('accumulated')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${papeletaMode === 'accumulated' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  Desde días acumulados
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Trabajador</label>
                <select
                  className="w-full border rounded-lg p-2"
                  value={papeletaForm.resourceId}
                  onChange={e => {
                    const pending = dayEntries.filter(d => d.resourceId === e.target.value && d.status === 'pending_batch');
                    setPapeletaForm({
                      ...papeletaForm,
                      resourceId: e.target.value,
                      selectedDayIds: papeletaMode === 'accumulated' ? pending.map(d => d.id) : [],
                      requestedWorkDays: '',
                    });
                  }}
                >
                  <option value="">Seleccionar...</option>
                  {allPersonnel.map(p => (
                    <option key={p.resourceId} value={p.resourceId}>{p.name} — {p.unitName}</option>
                  ))}
                </select>
              </div>

              {selectedWorkerSummary && (
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div>
                    <span className="text-slate-500">1.ºs 15 disp.</span>
                    <div className="font-bold text-sky-700 text-sm">{selectedWorkerSummary.first15Available}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">2.ºs 15 disp.</span>
                    <div className="font-bold text-violet-700 text-sm">{selectedWorkerSummary.second15Available}</div>
                  </div>
                  <div className="col-span-2 text-slate-500">
                    Descanso semanal: <strong>{selectedWorkerSummary.weeklyRestDayLabel}</strong>
                    {' '}· Saldo total: <strong>{selectedWorkerSummary.availableDays}</strong>
                  </div>
                </div>
              )}

              {papeletaMode === 'accumulated' && papeletaForm.resourceId && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-amber-800 mb-2">
                    Seleccione los días a cuenta a formalizar:
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {dayEntries
                      .filter(d => d.resourceId === papeletaForm.resourceId && d.status === 'pending_batch')
                      .map(d => (
                        <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={papeletaForm.selectedDayIds.includes(d.id)}
                            onChange={() => toggleDaySelection(d.id)}
                          />
                          {formatDateDisplay(d.vacationDate)}
                          <span className="text-xs text-slate-400">({d.daysCount ?? 1} d)</span>
                        </label>
                      ))}
                  </div>
                  <p className="text-xs text-amber-700 mt-2">
                    Seleccionados:{' '}
                    {dayEntries
                      .filter(d => papeletaForm.selectedDayIds.includes(d.id))
                      .reduce((s, d) => s + Number(d.daysCount ?? 1), 0)}{' '}
                    día(s)
                  </p>
                </div>
              )}

              {papeletaMode === 'direct' && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Días laborales solicitados (opcional)
                  </label>
                  <input
                    type="number"
                    min={MIN_FRACTION_DAYS}
                    step={MIN_FRACTION_DAYS}
                    className="w-full border rounded-lg p-2"
                    placeholder="Ej: 6 → genera 7 calendario con descanso"
                    value={papeletaForm.requestedWorkDays}
                    onChange={e => setPapeletaForm({ ...papeletaForm, requestedWorkDays: e.target.value, endDate: '' })}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Si indica días laborales, el sistema amplia automáticamente el periodo con el descanso semanal.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Fecha salida</label>
                  <DateInput
                    value={papeletaForm.startDate}
                    onChange={startDate => setPapeletaForm({ ...papeletaForm, startDate })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Fecha término</label>
                  <DateInput
                    disabled={papeletaMode === 'direct' && Number(papeletaForm.requestedWorkDays) > 0}
                    value={papeletaForm.endDate || papeletaPreview?.endDate || ''}
                    onChange={end => {
                      setPapeletaForm({
                        ...papeletaForm,
                        endDate: end,
                        returnDate: calcReturnDate(end, selectedWorkerSummary?.weeklyRestDay ?? 0),
                        requestedWorkDays: '',
                      });
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fecha retorno (reincorporación)</label>
                <DateInput
                  value={papeletaForm.returnDate || ''}
                  onChange={returnDate => setPapeletaForm({ ...papeletaForm, returnDate })}
                />
              </div>

              {papeletaPreview && (
                <div className={`rounded-lg border p-3 text-xs space-y-1 ${papeletaPreview.allocation.valid ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-800'}`}>
                  <p className="font-medium flex items-center gap-1">
                    {papeletaPreview.allocation.valid ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                    Resumen del goce
                  </p>
                  <p>Días a descontar del saldo: <strong>{papeletaPreview.calendarDays}</strong></p>
                  {papeletaPreview.endDate && <p>Término efectivo: <strong>{formatDateDisplay(papeletaPreview.endDate)}</strong></p>}
                  {papeletaPreview.returnDate && <p>Retorno sugerido: <strong>{formatDateDisplay(papeletaPreview.returnDate)}</strong></p>}
                  {papeletaPreview.includedRestDates.length > 0 && (
                    <p>Incluye descanso ({papeletaPreview.restDayLabel}): {papeletaPreview.includedRestDates.map(formatDateDisplay).join(', ')}</p>
                  )}
                  {papeletaPreview.allocation.valid ? (
                    <>
                      <p>
                        Imputación → 1.ºs 15: {papeletaPreview.allocation.fromFirst15}
                        {papeletaPreview.allocation.fromSecond15 > 0 && (
                          <> · 2.ºs 15: {papeletaPreview.allocation.fromSecond15}</>
                        )}
                      </p>
                      {requiresVacationAuthorization(papeletaPreview.calendarDays) && (
                        <p className="text-amber-700 font-medium">
                          Requiere justificación y solicitud de autorización (supera {MAX_VACATION_DAYS_WITHOUT_AUTH} días).
                        </p>
                      )}
                    </>
                  ) : (
                    <p>{papeletaPreview.allocation.error}</p>
                  )}
                </div>
              )}

              {papeletaPreview && requiresVacationAuthorization(papeletaPreview.calendarDays) && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Justificación del goce <span className="text-red-600">*</span>
                  </label>
                  <p className="text-xs text-slate-500 mb-2">
                    Obligatorio para solicitudes mayores a {MAX_VACATION_DAYS_WITHOUT_AUTH} días. El autorizador verá este texto.
                  </p>
                  <textarea
                    className="w-full border border-amber-200 rounded-lg p-2 text-sm bg-amber-50/50"
                    rows={3}
                    value={papeletaForm.justification}
                    onChange={e => setPapeletaForm({ ...papeletaForm, justification: e.target.value })}
                    placeholder="Indique el motivo o sustento del otorgamiento de vacaciones por más de 7 días..."
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Observaciones</label>
                <textarea
                  className="w-full border rounded-lg p-2 text-sm"
                  rows={2}
                  value={papeletaForm.notes}
                  onChange={e => setPapeletaForm({ ...papeletaForm, notes: e.target.value })}
                />
              </div>
              <button
                onClick={() => void handleCreatePapeleta()}
                disabled={
                  !papeletaForm.resourceId ||
                  !papeletaForm.startDate ||
                  !(papeletaForm.endDate || papeletaPreview?.endDate) ||
                  !(papeletaForm.returnDate || papeletaPreview?.returnDate) ||
                  (papeletaMode === 'accumulated' && papeletaForm.selectedDayIds.length < 1) ||
                  (papeletaPreview != null && !papeletaPreview.allocation.valid) ||
                  (papeletaPreview != null &&
                    requiresVacationAuthorization(papeletaPreview.calendarDays) &&
                    !papeletaForm.justification.trim())
                }
                className="w-full bg-emerald-600 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-50"
              >
                <FileText size={16} /> Emitir y descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bloques 15+15 por año */}
      {detailSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-sky-700 text-white px-6 py-4 rounded-t-xl flex justify-between items-center sticky top-0">
              <div>
                <span className="font-bold">Bloques vacacionales — {detailSummary.workerName}</span>
                <p className="text-xs text-sky-100 mt-0.5">
                  Primeros {FIRST_BLOCK_DAYS} fraccionables · Segundos {SECOND_BLOCK_DAYS} en ×{SECOND_BLOCK_MULTIPLE}
                </p>
              </div>
              <button onClick={() => setDetailSummary(null)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-slate-500">Ganados</div>
                  <div className="text-xl font-bold text-blue-600">{detailSummary.accruedDays}</div>
                </div>
                <div className="bg-sky-50 rounded-lg p-3">
                  <div className="text-xs text-slate-500">1.ºs 15 disp.</div>
                  <div className="text-xl font-bold text-sky-700">{detailSummary.first15Available}</div>
                </div>
                <div className="bg-violet-50 rounded-lg p-3">
                  <div className="text-xs text-slate-500">2.ºs 15 disp.</div>
                  <div className="text-xl font-bold text-violet-700">{detailSummary.second15Available}</div>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left p-2">Año / periodo</th>
                    <th className="text-center p-2">Ganados</th>
                    <th className="text-center p-2">1.º 15</th>
                    <th className="text-center p-2">2.º 15</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailSummary.periodBlocks.map(b => (
                    <tr key={b.periodIndex}>
                      <td className="p-2">
                        <div className="font-medium">Periodo {b.periodIndex}</div>
                        <div className="text-[11px] text-slate-400">{formatDateDisplay(b.periodStart)} → {formatDateDisplay(b.periodEnd)}</div>
                      </td>
                      <td className="p-2 text-center">{b.accruedInPeriod}</td>
                      <td className="p-2 text-center">
                        <div className="text-sky-700 font-semibold">{b.firstBlockAvailable} disp.</div>
                        <div className="text-[10px] text-slate-400">
                          {b.firstBlockEarned} gan. · {b.firstBlockUsed} us.
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        <div className="text-violet-700 font-semibold">{b.secondBlockAvailable} disp.</div>
                        <div className="text-[10px] text-slate-400">
                          {b.secondBlockEarned} gan. · {b.secondBlockUsed} us.
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-500">
                Descanso semanal inferido: <strong>{detailSummary.weeklyRestDayLabel}</strong>. Acumulación proporcional:
                {detailSummary.serviceDays} días de servicio → {detailSummary.accruedDays} días ganados
                ({DAYS_PER_YEAR}/{SERVICE_DAYS_PER_YEAR}). Fraccionamiento mínimo de primeros 15: {MIN_FRACTION_DAYS} día.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalle días acumulados en papeleta */}
      {detailPapeleta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
              <span className="font-bold">Días acumulados — {detailPapeleta.code}</span>
              <button onClick={() => setDetailPapeleta(null)}><X size={20} /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-3">
                Papeleta formal: {formatDateDisplay(detailPapeleta.startDate)} al {formatDateDisplay(detailPapeleta.endDate)} (retorno: {formatDateDisplay(detailPapeleta.returnDate)})
              </p>
              <p className="text-sm font-medium mb-2">Días individuales que se acumularon:</p>
              <ul className="space-y-1">
                {detailPapeleta.accumulatedDays?.map(d => (
                  <li key={d.id} className="text-sm bg-slate-50 px-3 py-2 rounded flex justify-between">
                    <span>{formatDateDisplay(d.vacationDate)}</span>
                    <span className="text-slate-400 text-xs">{d.daysCount ?? 1} d · a cuenta</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {authModal && (
        <VacationAuthorizationModal
          open
          title={authModal.title}
          message={authModal.message}
          currentUser={currentUser}
          users={users}
          justification={authModal.justification}
          onSubmit={authModal.onSubmit}
          onClose={() => setAuthModal(null)}
        />
      )}

      {editPapeleta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
              <span className="font-bold">Editar papeleta {editPapeleta.code}</span>
              <button type="button" onClick={() => setEditPapeleta(null)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">{editPapeleta.workerName} — {editPapeleta.unitName}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Salida</label>
                  <DateInput
                    value={editPapeletaForm.startDate}
                    onChange={startDate => setEditPapeletaForm({ ...editPapeletaForm, startDate })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Término</label>
                  <DateInput
                    value={editPapeletaForm.endDate}
                    onChange={endDate => setEditPapeletaForm({ ...editPapeletaForm, endDate })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Retorno</label>
                <DateInput
                  value={editPapeletaForm.returnDate}
                  onChange={returnDate => setEditPapeletaForm({ ...editPapeletaForm, returnDate })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Observaciones</label>
                <textarea className="w-full border rounded-lg p-2 text-sm" rows={2} value={editPapeletaForm.notes}
                  onChange={e => setEditPapeletaForm({ ...editPapeletaForm, notes: e.target.value })} />
              </div>
              <button type="button" onClick={() => void handleSaveEditPapeleta()}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700">
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {editDayEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="bg-amber-500 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
              <span className="font-bold">Editar día a cuenta</span>
              <button type="button" onClick={() => setEditDayEntry(null)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Fecha</label>
                <DateInput
                  value={editDayForm.date}
                  onChange={date => setEditDayForm({ ...editDayForm, date })}
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditDayForm({ ...editDayForm, daysCount: 1 })}
                  className={`flex-1 py-2 rounded-lg text-sm ${editDayForm.daysCount === 1 ? 'bg-amber-500 text-white' : 'bg-slate-100'}`}>1 día</button>
                <button type="button" onClick={() => setEditDayForm({ ...editDayForm, daysCount: 0.5 })}
                  className={`flex-1 py-2 rounded-lg text-sm ${editDayForm.daysCount === 0.5 ? 'bg-amber-500 text-white' : 'bg-slate-100'}`}>0.5 día</button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notas</label>
                <input className="w-full border rounded-lg p-2 text-sm" value={editDayForm.notes}
                  onChange={e => setEditDayForm({ ...editDayForm, notes: e.target.value })} />
              </div>
              <button type="button" onClick={() => void handleSaveEditDayEntry()}
                className="w-full bg-amber-500 text-white py-2.5 rounded-lg hover:bg-amber-600">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
