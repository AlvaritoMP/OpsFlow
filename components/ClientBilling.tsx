import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Check,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  HelpCircle,
  Plus,
  Receipt,
  CalendarRange,
  RefreshCw,
  Save,
  Trash2,
  Users,
} from 'lucide-react';
import { Unit, User } from '../types';
import {
  BillingActor,
  BillingNoteKind,
  BillingStatus,
  ClientBillingAuditEntry,
  ClientBillingNote,
  ClientBillingRecord,
  ClientBillingRun,
  SavedBillingCalc,
  findActiveBilling,
  getBillingAudit,
  listBillingNotes,
  listBillingRuns,
  listClientBillings,
  prepareBillingDraft,
  refreshWorkersFromUnit,
  loadBillingDayGlance,
  BillingDayGlance,
  saveBillingNote,
  saveBillingProfile,
  saveClientBilling,
  setBillingNoteStatus,
  setBillingStatus,
} from '../services/clientBillingService';
import { BillingRunCompare } from './BillingRunCompare';
import {
  BillingComputation,
  BillingCostLine,
  BillingRates,
  BillingWorkerInput,
  ClientBillingModel,
  ComputedWorker,
  attendanceWindowError,
  attendanceWindowKey,
  cloneModel,
  computeBilling,
  diffBillingModels,
  formatAttendanceRange,
  formatPeriodLabel,
  inclusiveDayCount,
  monthDateBounds,
  newBillingId,
  pen,
  resolveAttendanceWindow,
} from '../utils/clientBillingCalc';

interface ClientBillingProps {
  units: Unit[];
  currentUser: User;
  canEdit: boolean;
  onOpenHelp?: () => void;
}

interface EditorState {
  id?: string;
  unitId: string;
  clientName: string;
  unitName: string;
  periodMonth: string;
  status: BillingStatus;
  model: ClientBillingModel;
  baseline: ClientBillingModel;
  audit: ClientBillingAuditEntry[];
  createdByName?: string;
  updatedByName?: string;
  issuedAt?: string;
  issuedByName?: string;
}

type TabId = 'labor' | 'ops' | 'admin' | 'params' | 'trace';

const OPS_KINDS: [string, string][] = [
  ['materiales', 'Materiales'],
  ['equipos', 'Equipos'],
  ['maquinaria', 'Maquinaria'],
  ['otros', 'Otros'],
];

const ADMIN_KINDS: [string, string][] = [
  ['financiero', 'Costo financiero'],
  ['gestion_rrhh', 'Gestión de RRHH'],
  ['estructura', 'Estructura'],
];

const ACTION_LABEL: Record<string, string> = {
  created: 'Creación',
  saved: 'Ajuste',
  issued: 'Emisión',
  reopened: 'Reapertura',
  voided: 'Anulación',
  adjustment_note: 'Nota de ajuste',
};

export const ClientBilling: React.FC<ClientBillingProps> = ({ units, currentUser, canEdit, onOpenHelp }) => {
  const actor: BillingActor = { id: currentUser.id, name: currentUser.name || currentUser.email };
  const billingUnits = useMemo(
    () => units.filter((unit) => unit.unitClass !== 'BPO').sort((a, b) => a.clientName.localeCompare(b.clientName, 'es') || a.name.localeCompare(b.name, 'es')),
    [units]
  );
  const clients = useMemo(() => {
    const unique = new Set<string>();
    billingUnits.forEach((unit) => {
      if (unit.clientName) unique.add(unit.clientName);
    });
    const list: string[] = [];
    unique.forEach((name) => list.push(name));
    return list.sort((a, b) => a.localeCompare(b, 'es'));
  }, [billingUnits]);

  const [records, setRecords] = useState<ClientBillingRecord[]>([]);
  const [runs, setRuns] = useState<ClientBillingRun[]>([]);
  const [notes, setNotes] = useState<ClientBillingNote[]>([]);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [editorCompare, setEditorCompare] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | BillingStatus>('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [tab, setTab] = useState<TabId>('labor');
  const [busy, setBusy] = useState<string | null>(null);
  const [workerQuery, setWorkerQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createUnitId, setCreateUnitId] = useState('');
  const [createPeriod, setCreatePeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [createFrom, setCreateFrom] = useState(() => monthDateBounds(new Date().toISOString().slice(0, 7)).from);
  const [createTo, setCreateTo] = useState(() => monthDateBounds(new Date().toISOString().slice(0, 7)).to);
  const [copyPrevious, setCopyPrevious] = useState(true);
  const [appliedAttendanceKey, setAppliedAttendanceKey] = useState('');

  const loadList = async () => {
    setLoadingList(true);
    try {
      const rows = await listClientBillings();
      setRecords(rows);
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'No se pudo cargar la facturación.');
    }
    try {
      setRuns(await listBillingRuns());
    } catch {
      setRuns([]);
    }
    try {
      setNotes(await listBillingNotes());
      setNotesError(null);
    } catch (error) {
      setNotes([]);
      setNotesError(error instanceof Error ? error.message : 'No se pudieron cargar las notas.');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, []);

  const computed = useMemo(() => (editor ? computeBilling(editor.model) : null), [editor]);
  const pendingChanges = useMemo(
    () => (editor ? diffBillingModels(editor.baseline, editor.model) : []),
    [editor]
  );
  const locked = !canEdit || editor?.status === 'issued' || editor?.status === 'void';

  const visibleRecords = records.filter((record) => {
    if (filterClient && record.clientName !== filterClient) return false;
    if (filterStatus && record.status !== filterStatus) return false;
    return record.status !== 'void' || filterStatus === 'void';
  });

  const openRecord = async (record: ClientBillingRecord) => {
    setBusy('Abriendo liquidación');
    setBanner(null);
    try {
      const audit = await getBillingAudit(record.id);
      setEditor({
        id: record.id,
        unitId: record.unitId,
        clientName: record.clientName,
        unitName: record.unitName,
        periodMonth: record.periodMonth,
        status: record.status,
        model: cloneModel(record.model),
        baseline: cloneModel(record.model),
        audit,
        createdByName: record.createdByName,
        updatedByName: record.updatedByName,
        issuedAt: record.issuedAt,
        issuedByName: record.issuedByName,
      });
      setAppliedAttendanceKey(attendanceWindowKey(record.periodMonth, record.model.attendanceFrom, record.model.attendanceTo));
      setEditorCompare(false);
      setTab('labor');
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo abrir la liquidación.');
    } finally {
      setBusy(null);
    }
  };

  const startDraft = async () => {
    const unit = billingUnits.find((item) => item.id === createUnitId);
    if (!unit) {
      setBanner('Seleccione una unidad.');
      return;
    }
    const windowError = attendanceWindowError(createFrom, createTo);
    if (windowError) {
      setBanner(windowError);
      return;
    }
    setBusy('Armando la liquidación con el personal de la unidad');
    setBanner(null);
    try {
      const existing = await findActiveBilling(unit.id, createPeriod);
      if (existing) {
        setShowCreate(false);
        await openRecord(existing);
        setBanner(`Ya hay una facturación de ${unit.name} para ${formatPeriodLabel(createPeriod)}. Se abrió para continuar.`);
        return;
      }
      const model = await prepareBillingDraft(
        { id: unit.id, name: unit.name, clientName: unit.clientName },
        createPeriod,
        { copyPreviousCosts: copyPrevious, attendanceFrom: createFrom, attendanceTo: createTo }
      );
      setEditor({
        unitId: unit.id,
        clientName: unit.clientName,
        unitName: unit.name,
        periodMonth: createPeriod,
        status: 'draft',
        model,
        baseline: cloneModel(model),
        audit: [],
      });
      setAppliedAttendanceKey(attendanceWindowKey(createPeriod, model.attendanceFrom, model.attendanceTo));
      setShowCreate(false);
      setTab('labor');
      setBanner(`Borrador armado con el personal activo. Las faltas se tomaron del ${formatAttendanceRange(model.attendanceFrom, model.attendanceTo)}.`);
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo preparar la facturación.');
    } finally {
      setBusy(null);
    }
  };

  const patchModel = (patch: Partial<ClientBillingModel>) => {
    setEditor((current) => (current ? { ...current, model: { ...current.model, ...patch } } : current));
  };

  const patchWorker = (id: string, patch: Partial<BillingWorkerInput>) => {
    setEditor((current) => {
      if (!current) return current;
      return {
        ...current,
        model: {
          ...current.model,
          workers: current.model.workers.map((worker) => (worker.id === id ? { ...worker, ...patch } : worker)),
        },
      };
    });
  };

  const patchRates = (patch: Partial<BillingRates>) => {
    setEditor((current) =>
      current ? { ...current, model: { ...current.model, rates: { ...current.model.rates, ...patch } } } : current
    );
  };

  const syncAttendance = async (current: EditorState, force = false): Promise<EditorState> => {
    const range = resolveAttendanceWindow(current.periodMonth, current.model.attendanceFrom, current.model.attendanceTo);
    const windowError = attendanceWindowError(range.from, range.to);
    if (windowError) throw new Error(windowError);
    const key = `${range.from}|${range.to}`;
    if (!force && key === appliedAttendanceKey) return current;
    const model = await refreshWorkersFromUnit(current.unitId, current.periodMonth, {
      ...current.model,
      attendanceFrom: range.from,
      attendanceTo: range.to,
    });
    setAppliedAttendanceKey(key);
    return { ...current, model };
  };

  const save = async () => {
    if (!editor || locked) return;
    setBusy('Guardando');
    setBanner(null);
    try {
      const current = await syncAttendance(editor);
      const changes = current.id ? diffBillingModels(current.baseline, current.model) : describeCreation(current.model);
      const saved = await saveClientBilling({
        id: current.id,
        unit: { id: current.unitId, name: current.unitName, clientName: current.clientName },
        periodMonth: current.periodMonth,
        model: current.model,
        actor,
        changes,
      });
      const audit = await getBillingAudit(saved.id);
      setEditor({
        ...current,
        id: saved.id,
        status: saved.status,
        model: cloneModel(saved.model),
        baseline: cloneModel(saved.model),
        audit,
        createdByName: saved.createdByName,
        updatedByName: saved.updatedByName,
      });
      setBanner(changes.length || !current.id ? 'Liquidación guardada. Los ajustes quedaron en la trazabilidad.' : 'No había cambios nuevos.');
      await loadList();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = async (status: BillingStatus) => {
    if (!editor) return;
    if (status !== 'issued' && !editor.id) {
      setBanner('Guarde la liquidación antes de anularla.');
      return;
    }
    const summaries: Record<BillingStatus, string> = {
      issued: 'Emitió la facturación. A partir de aquí solo se modifica reabriendo el borrador.',
      draft: 'Reabrió la facturación para corregirla.',
      void: 'Anuló la facturación de este mes.',
    };
    setBusy(status === 'issued' ? 'Emitiendo' : status === 'void' ? 'Anulando' : 'Reabriendo');
    setBanner(null);
    try {
      let issuedEditor = editor;
      if (status === 'issued') issuedEditor = await syncAttendance(editor);
      let billingId = issuedEditor.id;
      if (status === 'issued' && (!billingId || diffBillingModels(issuedEditor.baseline, issuedEditor.model).length)) {
        const savedDraft = await saveClientBilling({
          id: issuedEditor.id,
          unit: { id: issuedEditor.unitId, name: issuedEditor.unitName, clientName: issuedEditor.clientName },
          periodMonth: issuedEditor.periodMonth,
          model: issuedEditor.model,
          actor,
          changes: issuedEditor.id ? diffBillingModels(issuedEditor.baseline, issuedEditor.model) : describeCreation(issuedEditor.model),
        });
        billingId = savedDraft.id;
        issuedEditor = {
          ...issuedEditor,
          id: savedDraft.id,
          model: cloneModel(savedDraft.model),
          baseline: cloneModel(savedDraft.model),
          createdByName: savedDraft.createdByName,
          updatedByName: savedDraft.updatedByName,
        };
      }
      if (!billingId) return;
      const saved = await setBillingStatus(billingId, status, actor, summaries[status]);
      const audit = await getBillingAudit(saved.id);
      setEditor({
        ...issuedEditor,
        id: saved.id,
        status: saved.status,
        issuedAt: saved.issuedAt,
        issuedByName: saved.issuedByName,
        updatedByName: saved.updatedByName,
        audit,
        baseline: cloneModel(issuedEditor.model),
      });
      setBanner(summaries[status]);
      await loadList();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo actualizar el estado.');
    } finally {
      setBusy(null);
    }
  };

  const refreshOpenAudit = async () => {
    if (!editor?.id) return;
    const billingId = editor.id;
    try {
      const audit = await getBillingAudit(billingId);
      setEditor((current) => (current && current.id === billingId ? { ...current, audit } : current));
    } catch {
      // La nota ya quedó guardada. La trazabilidad se vuelve a leer al abrir la liquidación.
    }
  };

  const createAdjustmentNote = async (input: {
    source: SavedBillingCalc;
    base: SavedBillingCalc;
    noteKind: BillingNoteKind;
    itemDescription: string;
  }) => {
    setBusy('Guardando la nota');
    setBanner(null);
    try {
      const saved = await saveBillingNote({ ...input, actor });
      const kind = saved.noteKind === 'credit' ? 'nota de crédito' : 'nota de débito';
      setBanner(`La diferencia quedó como ítem de una ${kind} por ${pen(saved.amount)}.`);
      await loadList();
      await refreshOpenAudit();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo crear la nota.');
    } finally {
      setBusy(null);
    }
  };

  const updateNoteStatus = async (id: string, status: BillingStatus) => {
    const summaries: Record<BillingStatus, string> = {
      issued: 'Emitió la nota. El ítem queda cerrado hasta que se reabra.',
      draft: 'Reabrió la nota.',
      void: 'Anuló la nota. El ítem dejó de estar vigente.',
    };
    setBusy(status === 'issued' ? 'Emitiendo la nota' : status === 'void' ? 'Anulando la nota' : 'Reabriendo la nota');
    setBanner(null);
    try {
      await setBillingNoteStatus(id, status, actor, summaries[status]);
      setBanner(summaries[status]);
      await loadList();
      await refreshOpenAudit();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo actualizar la nota.');
    } finally {
      setBusy(null);
    }
  };

  const reloadPersonnel = async () => {
    if (!editor || locked) return;
    setBusy('Recalculando faltas del corte');
    try {
      const next = await syncAttendance(editor, true);
      setEditor(next);
      const range = resolveAttendanceWindow(next.periodMonth, next.model.attendanceFrom, next.model.attendanceTo);
      setBanner(`Se tomaron la asistencia y las novedades del ${formatAttendanceRange(range.from, range.to)}. Los campos que usted ya había ajustado se conservaron.`);
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo actualizar el personal.');
    } finally {
      setBusy(null);
    }
  };

  const rememberConditions = async () => {
    if (!editor || !canEdit) return;
    setBusy('Guardando condiciones de la unidad');
    try {
      await saveBillingProfile(editor.unitId, editor.model, actor);
      setBanner('Las tasas, la utilidad y los gastos administrativos quedaron como condición de esta unidad para los próximos meses.');
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudieron guardar las condiciones.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-[1500px] mx-auto p-4 md:p-6 space-y-4">
        {!editor && (
          <>
            <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-blue-700">
                  <Receipt size={22} />
                  <h1 className="text-2xl font-bold text-slate-900">Facturación de clientes</h1>
                </div>
                <p className="text-sm text-slate-600 mt-1 max-w-3xl">
                  Arma la facturación de intermediación y tercerización con el personal de la unidad, los costos operativos, los gastos administrativos y la utilidad. Cada ajuste queda registrado. También puede restar dos cálculos guardados y convertir la diferencia en un ítem de nota de crédito o de débito.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowCompare((open) => !open)}
                  className="inline-flex items-center justify-center gap-2 border border-slate-200 bg-white text-slate-800 px-4 py-2.5 rounded-lg hover:bg-slate-50 shadow-sm"
                >
                  <ArrowLeftRight size={18} /> Corrida entre cálculos
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(true);
                      setCreateUnitId(billingUnits[0]?.id || '');
                    }}
                    className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 shadow-sm"
                  >
                    <Plus size={18} /> Nueva facturación
                  </button>
                )}
              </div>
            </header>

            <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <InfoCard title="1. Costo laboral" text="Sueldo del personal de la unidad, días trabajados y cargas: vacaciones, gratificación, CTS, EsSalud, Vida Ley y SCTR." />
              <InfoCard title="2. Costo operativo" text="Materiales, equipos y maquinaria del mes. Se cargan como ítems con monto." />
              <InfoCard title="3. Gastos administrativos" text="Estructura del cliente: costo financiero, gestión de recurso humano y otros ítems." />
              <InfoCard title="4. Utilidad" text="Porcentaje de la unidad. Puede ser un margen sobre el precio o un recargo sobre el costo." />
            </section>

            {storageError && <Banner tone="danger" text={storageError} />}
            {banner && <Banner tone="info" text={banner} />}

            {(showCompare || notes.length > 0) && (
              <BillingRunCompare
                records={records}
                runs={runs}
                notes={notes}
                notesError={notesError}
                canEdit={canEdit}
                busy={!!busy}
                showForm={showCompare}
                onSave={(input) => void createAdjustmentNote(input)}
                onIssue={(id) => void updateNoteStatus(id, 'issued')}
                onReopen={(id) => void updateNoteStatus(id, 'draft')}
                onVoid={(id) => void updateNoteStatus(id, 'void')}
              />
            )}

            {showCreate && (
              <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <h2 className="font-semibold text-slate-800">Nueva liquidación</h2>
                <div className="grid md:grid-cols-2 gap-3">
                  <label className="text-sm text-slate-600">
                    Unidad
                    <select className={fieldClass} value={createUnitId} onChange={(event) => setCreateUnitId(event.target.value)}>
                      <option value="">Seleccione</option>
                      {clients.map((client) => (
                        <optgroup key={client} label={client}>
                          {billingUnits
                            .filter((unit) => unit.clientName === client)
                            .map((unit) => (
                              <option key={unit.id} value={unit.id}>
                                {unit.name}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-slate-600">
                    Mes de facturación
                    <input
                      className={fieldClass}
                      type="month"
                      value={createPeriod}
                      onChange={(event) => {
                        const period = event.target.value;
                        setCreatePeriod(period);
                        const bounds = monthDateBounds(period);
                        setCreateFrom(bounds.from);
                        setCreateTo(bounds.to);
                      }}
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Asistencia y novedades desde
                    <input className={fieldClass} type="date" value={createFrom} onChange={(event) => setCreateFrom(event.target.value)} />
                  </label>
                  <label className="text-sm text-slate-600">
                    Asistencia y novedades hasta
                    <input className={fieldClass} type="date" value={createTo} onChange={(event) => setCreateTo(event.target.value)} />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={copyPrevious} onChange={(event) => setCopyPrevious(event.target.checked)} />
                  Copiar costos operativos y administrativos del mes anterior
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-slate-500">El mes identifica la liquidación. El rango define la asistencia, las novedades y los días a facturar.</p>
                  {onOpenHelp && (
                    <button type="button" onClick={onOpenHelp} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900">
                      <HelpCircle size={14} /> Ayuda del corte
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void startDraft()} disabled={!!busy} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60">
                    Armar liquidación
                  </button>
                  <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">
                    Cancelar
                  </button>
                </div>
              </section>
            )}

            <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="flex flex-col md:flex-row gap-2 p-3 border-b border-slate-100">
                <select className={fieldClass} value={filterClient} onChange={(event) => setFilterClient(event.target.value)}>
                  <option value="">Todos los clientes</option>
                  {clients.map((client) => (
                    <option key={client} value={client}>
                      {client}
                    </option>
                  ))}
                </select>
                <select className={fieldClass} value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as '' | BillingStatus)}>
                  <option value="">Borradores y emitidas</option>
                  <option value="draft">Solo borradores</option>
                  <option value="issued">Solo emitidas</option>
                  <option value="void">Anuladas</option>
                </select>
              </div>
              {loadingList ? (
                <div className="p-8 text-center text-slate-500 text-sm">Cargando facturaciones...</div>
              ) : visibleRecords.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">Todavía no hay facturaciones con este filtro.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-left">
                      <tr>
                        <th className="px-4 py-2 font-medium">Periodo</th>
                        <th className="px-4 py-2 font-medium">Cliente / unidad</th>
                        <th className="px-4 py-2 font-medium">Estado</th>
                        <th className="px-4 py-2 font-medium text-right">Total sin IGV</th>
                        <th className="px-4 py-2 font-medium">Último ajuste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRecords.map((record) => {
                        const attendance = resolveAttendanceWindow(record.periodMonth, record.model?.attendanceFrom, record.model?.attendanceTo);
                        return (
                        <tr key={record.id} className="border-t border-slate-100 hover:bg-blue-50/50 cursor-pointer" onClick={() => void openRecord(record)}>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {formatPeriodLabel(record.periodMonth)}
                            <div className="text-xs font-normal text-slate-500">{formatAttendanceRange(attendance.from, attendance.to)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-800">{record.clientName}</div>
                            <div className="text-xs text-slate-500">{record.unitName}</div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill status={record.status} />
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">{pen(record.grandTotal)}</td>
                          <td className="px-4 py-3 text-slate-500">
                            {record.updatedByName || record.createdByName || '—'}
                            <div className="text-xs">{new Date(record.updatedAt).toLocaleString('es-PE')}</div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {editor && computed && (
          <EditorView
            editor={editor}
            computed={computed}
            pendingChanges={pendingChanges}
            locked={locked}
            canEdit={canEdit}
            busy={busy}
            banner={banner}
            tab={tab}
            setTab={setTab}
            workerQuery={workerQuery}
            setWorkerQuery={setWorkerQuery}
            appliedAttendanceKey={appliedAttendanceKey}
            onBack={() => {
              setEditor(null);
              setEditorCompare(false);
              setBanner(null);
            }}
            onPatchModel={patchModel}
            onPatchWorker={patchWorker}
            onPatchRates={patchRates}
            onSave={() => void save()}
            onIssue={() => void changeStatus('issued')}
            onReopen={() => void changeStatus('draft')}
            onVoid={() => {
              if (window.confirm('¿Anular esta facturación? Quedará en el historial y podrá crear otra del mismo mes.')) {
                void changeStatus('void');
              }
            }}
            onReload={() => void reloadPersonnel()}
            onRemember={() => void rememberConditions()}
            onExport={() => exportExcel(editor, computed)}
            onOpenHelp={onOpenHelp}
            onOpenCompare={() => {
              if (!editor.id) {
                setBanner('Guarde la liquidación antes de compararla con otro cálculo.');
                return;
              }
              setEditorCompare((open) => !open);
            }}
            compareSlot={
              editorCompare && editor.id ? (
                <BillingRunCompare
                  records={records}
                  runs={runs}
                  notes={notes}
                  notesError={notesError}
                  canEdit={canEdit}
                  busy={!!busy}
                  showForm
                  presetSourceId={editor.id}
                  contextUnitId={editor.unitId}
                  unsavedWarning={pendingChanges.length > 0}
                  onSave={(input) => void createAdjustmentNote(input)}
                  onIssue={(id) => void updateNoteStatus(id, 'issued')}
                  onReopen={(id) => void updateNoteStatus(id, 'draft')}
                  onVoid={(id) => void updateNoteStatus(id, 'void')}
                />
              ) : null
            }
          />
        )}

        {busy && (
          <div className="fixed bottom-4 right-4 bg-slate-900 text-white text-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> {busy}
          </div>
        )}
      </div>
    </div>
  );
};

function EditorView(props: {
  editor: EditorState;
  computed: BillingComputation;
  pendingChanges: { label: string; before: string; after: string }[];
  locked: boolean;
  canEdit: boolean;
  busy: string | null;
  banner: string | null;
  tab: TabId;
  setTab: (tab: TabId) => void;
  workerQuery: string;
  setWorkerQuery: (value: string) => void;
  onBack: () => void;
  onPatchModel: (patch: Partial<ClientBillingModel>) => void;
  onPatchWorker: (id: string, patch: Partial<BillingWorkerInput>) => void;
  onPatchRates: (patch: Partial<BillingRates>) => void;
  onSave: () => void;
  onIssue: () => void;
  onReopen: () => void;
  onVoid: () => void;
  onReload: () => void;
  onRemember: () => void;
  onExport: () => void;
  onOpenHelp?: () => void;
  onOpenCompare: () => void;
  compareSlot: React.ReactNode;
  appliedAttendanceKey: string;
}) {
  const { editor, computed, locked } = props;
  const workerMap = new Map(computed.workers.map((worker) => [worker.id, worker]));
  const filteredWorkers = editor.model.workers.filter((worker) => {
    const q = props.workerQuery.trim().toLowerCase();
    if (!q) return true;
    return `${worker.name} ${worker.position} ${worker.dni || ''}`.toLowerCase().includes(q);
  });
  const includedCount = editor.model.workers.filter((worker) => worker.included).length;
  const [sheetMode, setSheetMode] = useState<'costs' | 'attendance' | 'novedades'>('costs');
  const [glance, setGlance] = useState<BillingDayGlance | null>(null);
  const [glanceLoading, setGlanceLoading] = useState(false);
  const [glanceError, setGlanceError] = useState<string | null>(null);
  const attendance = resolveAttendanceWindow(editor.periodMonth, editor.model.attendanceFrom, editor.model.attendanceTo);
  const attendanceError = attendanceWindowError(attendance.from, attendance.to);
  const attendanceStale = attendanceWindowKey(editor.periodMonth, attendance.from, attendance.to) !== props.appliedAttendanceKey;
  const attendanceDays = inclusiveDayCount(attendance.from, attendance.to);
  const crossesMonth = attendance.from.slice(0, 7) !== attendance.to.slice(0, 7);

  useEffect(() => {
    if (attendanceError && sheetMode !== 'costs') setSheetMode('costs');
  }, [attendanceError, sheetMode]);

  useEffect(() => {
    if (sheetMode === 'costs') return;
    if (attendanceError) return;
    let cancelled = false;
    setGlanceLoading(true);
    setGlanceError(null);
    loadBillingDayGlance(editor.unitId, attendance.from, attendance.to)
      .then((data) => {
        if (!cancelled) setGlance(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) setGlanceError(error instanceof Error ? error.message : 'No se pudo leer la asistencia del corte.');
      })
      .finally(() => {
        if (!cancelled) setGlanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sheetMode, editor.unitId, attendance.from, attendance.to, attendanceError]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={props.onBack} className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 mb-2">
            <ArrowLeft size={16} /> Volver al listado
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{editor.clientName}</h1>
            <StatusPill status={editor.status} />
            {props.pendingChanges.length > 0 && editor.status !== 'issued' && (
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{props.pendingChanges.length} cambios sin guardar</span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {editor.unitName} · {formatPeriodLabel(editor.periodMonth)} · Corte {formatAttendanceRange(attendance.from, attendance.to)}
            {editor.updatedByName ? ` · Último guardado por ${editor.updatedByName}` : ''}
            {editor.issuedByName ? ` · Emitida por ${editor.issuedByName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={props.onExport} title="Descargar Excel listo para imprimir en una hoja horizontal" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm hover:bg-slate-50">
            <Download size={16} /> Excel
          </button>
          {editor.id && (
            <button type="button" onClick={props.onOpenCompare} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm hover:bg-slate-50">
              <ArrowLeftRight size={16} /> Corrida
            </button>
          )}
          {editor.status === 'issued' && props.canEdit && (
            <button type="button" onClick={props.onReopen} className="px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm">
              Reabrir para corregir
            </button>
          )}
          {editor.status === 'draft' && props.canEdit && (
            <>
              <button type="button" onClick={props.onSave} disabled={!!props.busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-60">
                <Save size={16} /> Guardar
              </button>
              <button
                type="button"
                onClick={props.onIssue}
                disabled={!!props.busy}
                title="Guarda los cambios pendientes, actualiza las faltas si el corte cambió y bloquea la liquidación. No envía un comprobante a SUNAT."
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60"
              >
                <Check size={16} /> Emitir
              </button>
            </>
          )}
          {editor.id && editor.status !== 'void' && props.canEdit && (
            <button type="button" onClick={props.onVoid} className="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50">
              Anular
            </button>
          )}
        </div>
      </div>

      {editor.status === 'issued' && (
        <Banner tone="info" text="Emitir guardó el cálculo, aplicó el corte de asistencia si había cambiado y dejó esta liquidación bloqueada. No se envió un comprobante a SUNAT. Para cambiar un sueldo, un costo o la utilidad hay que reabrirla; la reapertura y cada corrección quedan en la trazabilidad." />
      )}
      {props.banner && <Banner tone="info" text={props.banner} />}
      {props.compareSlot}

      <div className={props.tab === 'labor' ? 'space-y-4' : 'grid xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start'}>
        <div className="space-y-3 min-w-0">
          <div className="bg-white border border-slate-200 rounded-xl p-3 grid md:grid-cols-2 gap-3">
            <label className="text-sm text-slate-600">
              Título de la facturación
              <input className={fieldClass} disabled={locked} value={editor.model.title} onChange={(event) => props.onPatchModel({ title: event.target.value })} />
            </label>
            <label className="text-sm text-slate-600">
              Servicio facturado
              <input className={fieldClass} disabled={locked} value={editor.model.serviceLabel} onChange={(event) => props.onPatchModel({ serviceLabel: event.target.value })} />
            </label>
            <label className="text-sm text-slate-600 md:col-span-2">
              Comentario de esta versión
              <input
                className={fieldClass}
                disabled={locked}
                placeholder="Ej. Se bajó a 6 días a Bazo y se cargó bono nocturno de 224 horas en tres abastecedores."
                value={editor.model.comment}
                onChange={(event) => props.onPatchModel({ comment: event.target.value })}
              />
            </label>
          </div>

          <div className={`bg-white border rounded-xl p-3 space-y-3 ${attendanceError || attendanceStale ? 'border-amber-300' : 'border-slate-200'}`}>
            <div className="flex flex-col xl:flex-row xl:items-end gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-800">Corte de asistencia y novedades</p>
                  {props.onOpenHelp && (
                    <button type="button" onClick={props.onOpenHelp} title="Ayuda del corte" aria-label="Ayuda del corte" className="text-slate-500 hover:text-blue-700">
                      <HelpCircle size={16} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {attendanceDays} días
                  {crossesMonth ? ', cruzando de un mes a otro' : ''}. Pulse el botón de ayuda para ver cómo se cuentan las faltas y los días.
                </p>
              </div>
              <label className="text-sm text-slate-600">
                Desde
                <input
                  className={fieldClass}
                  type="date"
                  disabled={locked}
                  value={attendance.from}
                  onChange={(event) => props.onPatchModel({ attendanceFrom: event.target.value, attendanceTo: editor.model.attendanceTo || attendance.to })}
                />
              </label>
              <label className="text-sm text-slate-600">
                Hasta
                <input
                  className={fieldClass}
                  type="date"
                  disabled={locked}
                  value={attendance.to}
                  onChange={(event) => props.onPatchModel({ attendanceFrom: editor.model.attendanceFrom || attendance.from, attendanceTo: event.target.value })}
                />
              </label>
              {!locked && (
                <button type="button" onClick={props.onReload} disabled={!!props.busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm whitespace-nowrap disabled:opacity-60">
                  <RefreshCw size={14} /> Recalcular faltas
                </button>
              )}
            </div>
            {attendanceError && <p className="text-xs text-red-700">{attendanceError}</p>}
            {attendanceStale && !attendanceError && (
              <p className="text-xs text-amber-800">El rango cambió. Recalcule las faltas para aplicar este corte a los días de cada trabajador.</p>
            )}
          </div>

          <div className="flex gap-1 overflow-x-auto">
            {(
              [
                ['labor', `Personal (${includedCount})`],
                ['ops', 'Operativo'],
                ['admin', 'Administrativo'],
                ['params', 'Parámetros'],
                ['trace', 'Trazabilidad'],
              ] as [TabId, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => props.setTab(id)}
                className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap ${props.tab === id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {props.tab === 'labor' && (
            <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="p-3 flex flex-col md:flex-row gap-2 md:items-center justify-between border-b border-slate-100">
                <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
                  <Users size={16} className="shrink-0" />
                  <span>
                    {sheetMode === 'costs'
                      ? 'Cada fila es un trabajador. Los días ya restan las faltas del corte. Lo amarillo fue ajustado a mano.'
                      : sheetMode === 'attendance'
                        ? 'Asistencia del corte, por día. ✓ marcación completa, ½ incompleta, F falta o sin marcas, T tardanza.'
                        : 'Novedades de tareo del corte, con la misma clave que en la unidad.'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    {(
                      [
                        ['costs', 'Costos'],
                        ['attendance', 'Asistencia'],
                        ['novedades', 'Novedades'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        disabled={id !== 'costs' && !!attendanceError}
                        title={id !== 'costs' && attendanceError ? attendanceError : undefined}
                        onClick={() => setSheetMode(id)}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
                          sheetMode === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                        } disabled:opacity-40`}
                      >
                        {id === 'costs' ? label : <span className="inline-flex items-center gap-1"><CalendarRange size={12} />{label}</span>}
                      </button>
                    ))}
                  </div>
                  <input className="w-44 max-w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800" placeholder="Buscar trabajador" value={props.workerQuery} onChange={(event) => props.setWorkerQuery(event.target.value)} />
                  {!locked && (
                    <>
                      <button type="button" onClick={props.onReload} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm whitespace-nowrap">
                        <RefreshCw size={14} /> Actualizar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const id = newBillingId();
                          props.onPatchModel({
                            workers: [
                              ...editor.model.workers,
                              {
                                id,
                                name: '',
                                position: '',
                                included: true,
                                origin: 'manual',
                                contractualSalary: 0,
                                daysWorked: 30,
                                calendarDays: 30,
                                absenceDays: 0,
                                familyAllowance: 0,
                                workCondition: 0,
                                bonus: 0,
                                he25Hours: 0,
                                he25Manual: null,
                                he35Hours: 0,
                                he35Manual: null,
                                nightHours: 0,
                                nightManual: null,
                                socialBaseManual: false,
                                socialBase: 0,
                                factor: 1,
                              },
                            ],
                          });
                        }}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm whitespace-nowrap"
                      >
                        <Plus size={14} /> Agregar
                      </button>
                    </>
                  )}
                </div>
              </div>
              {sheetMode === 'costs' ? (
                <LaborSheet
                  workers={filteredWorkers}
                  lines={workerMap}
                  locked={locked}
                  onPatchWorker={props.onPatchWorker}
                  onRemove={(id) => props.onPatchModel({ workers: editor.model.workers.filter((item) => item.id !== id) })}
                />
              ) : (
                <DayGlanceSheet
                  mode={sheetMode}
                  workers={filteredWorkers}
                  glance={glance}
                  loading={glanceLoading}
                  error={glanceError}
                />
              )}
            </section>
          )}

          {props.tab === 'ops' && (
            <LinesEditor
              title="Costos operativos"
              hint="Materiales, equipos o maquinaria del mes. El monto es el costo mensual que entra a la factura."
              lines={editor.model.operational}
              kinds={OPS_KINDS}
              locked={locked}
              computed={computed.operational}
              onChange={(operational) => props.onPatchModel({ operational })}
            />
          )}

          {props.tab === 'admin' && (
            <div className="space-y-3">
              <section className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
                <p className="font-medium text-slate-800 mb-2">Costo financiero</p>
                <p>
                  Se calcula como (costo laboral + costo operativo) × ({Math.round(editor.model.rates.financialAnnualRate * 1000) / 10}% anual / 365) × {editor.model.rates.financialDays} días = <strong>{pen(computed.financialAmount)}</strong>.
                </p>
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <label>
                    Tasa anual (%)
                    <input className={fieldClass} type="number" step="0.1" disabled={locked} value={Number((editor.model.rates.financialAnnualRate * 100).toFixed(4))} onChange={(event) => props.onPatchRates({ financialAnnualRate: (Number(event.target.value) || 0) / 100 })} />
                  </label>
                  <label>
                    Días financiados
                    <input className={fieldClass} type="number" step="1" disabled={locked} value={editor.model.rates.financialDays} onChange={(event) => props.onPatchRates({ financialDays: Number(event.target.value) || 0 })} />
                  </label>
                </div>
              </section>
              <LinesEditor
                title="Gastos administrativos"
                hint="Ítems de estructura del cliente. El costo financiero puede seguir la fórmula o un monto que usted escriba."
                lines={editor.model.administrative}
                kinds={ADMIN_KINDS}
                locked={locked}
                computed={computed.administrative}
                onChange={(administrative) => props.onPatchModel({ administrative })}
              />
            </div>
          )}

          {props.tab === 'params' && (
            <ParametersPanel rates={editor.model.rates} considerations={editor.model.considerations} locked={locked} onRates={props.onPatchRates} onConsiderations={(considerations) => props.onPatchModel({ considerations })} onRemember={props.onRemember} canEdit={props.canEdit} />
          )}

          {props.tab === 'trace' && <TracePanel editor={editor} pendingChanges={props.pendingChanges} />}
        </div>

        <aside className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3 xl:sticky xl:top-4">
          <h2 className="font-semibold text-slate-900">Resumen del mes</h2>
          <SummaryRow label="Costo laboral" value={computed.laborTotal} share={share(computed.laborTotal, computed.grandTotal)} />
          <SummaryRow label="Costo operativo" value={computed.operationalTotal} share={share(computed.operationalTotal, computed.grandTotal)} />
          <SummaryRow label="Gastos administrativos" value={computed.adminTotal} share={share(computed.adminTotal, computed.grandTotal)} />
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <label className="text-xs text-slate-500 block">
              Utilidad
              <select className={fieldClass} disabled={locked} value={editor.model.rates.profitMode} onChange={(event) => props.onPatchRates({ profitMode: event.target.value as BillingRates['profitMode'] })}>
                <option value="margin_on_price">Margen sobre el precio de venta</option>
                <option value="markup_on_cost">Recargo sobre el costo</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                Tasa %
                <input className={fieldClass} type="number" step="0.1" disabled={locked} value={Number((editor.model.rates.profitRate * 100).toFixed(4))} onChange={(event) => props.onPatchRates({ profitRate: (Number(event.target.value) || 0) / 100 })} />
              </label>
              <label className="text-xs text-slate-500">
                Base
                <select className={fieldClass} disabled={locked} value={editor.model.rates.profitBase} onChange={(event) => props.onPatchRates({ profitBase: event.target.value as BillingRates['profitBase'] })}>
                  <option value="all">Todo el costo</option>
                  <option value="labor">Solo laboral</option>
                </select>
              </label>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {editor.model.rates.profitMode === 'margin_on_price'
                ? `La utilidad es el ${Number((editor.model.rates.profitRate * 100).toFixed(2))}% del precio. El total sin IGV queda en costo / ${(1 - editor.model.rates.profitRate).toFixed(2)}.`
                : `La utilidad es el ${Number((editor.model.rates.profitRate * 100).toFixed(2))}% adicional sobre la base.`}
            </p>
            <SummaryRow label="Utilidad" value={computed.profitAmount} share={share(computed.profitAmount, computed.grandTotal)} />
          </div>
          <div className="border-t border-slate-100 pt-3">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Total sin IGV</span>
              <span className="text-lg font-bold text-slate-900">{pen(computed.grandTotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>IGV {Number((editor.model.rates.igvRate * 100).toFixed(2))}%</span>
              <span>{pen(computed.igvAmount)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-slate-600">Total con IGV</span>
              <span className="font-semibold text-slate-800">{pen(computed.totalWithIgv)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const GLANCE_TONE: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-800',
  warn: 'bg-amber-50 text-amber-800',
  bad: 'bg-red-50 text-red-700',
  muted: 'bg-slate-50 text-slate-600',
};

const GLANCE_WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const GLANCE_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function glanceDayParts(iso: string): { day: string; weekday: string; month: string } {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return {
    day: String(day || 0).padStart(2, '0'),
    weekday: GLANCE_WEEKDAYS[date.getDay()] || '',
    month: GLANCE_MONTHS[(month || 1) - 1] || '',
  };
}

function DayGlanceSheet(props: {
  mode: 'attendance' | 'novedades';
  workers: BillingWorkerInput[];
  glance: BillingDayGlance | null;
  loading: boolean;
  error: string | null;
}) {
  if (props.loading && !props.glance) {
    return (
      <div className="p-8 text-sm text-slate-500 flex items-center justify-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Leyendo el corte…
      </div>
    );
  }
  if (props.error) {
    return <div className="p-6 text-sm text-red-700">{props.error}</div>;
  }
  if (!props.glance) {
    return <div className="p-6 text-sm text-slate-500">Elija Asistencia o Novedades para ver el corte.</div>;
  }
  if (props.workers.length === 0) {
    return <div className="p-6 text-sm text-slate-500">No hay personal para este filtro.</div>;
  }
  const cells = props.mode === 'attendance' ? props.glance.attendance : props.glance.novedades;
  const head = 'sticky top-0 z-30 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-center px-0.5 py-1 border-b border-slate-200';
  return (
    <div>
      {props.mode === 'novedades' && props.glance.legend.length > 0 && (
        <div className="px-3 py-2 flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/80">
          {props.glance.legend.map((item) => (
            <span key={`${item.code}-${item.name}`} className="inline-flex items-center gap-1 text-[11px] text-slate-600 bg-white border border-slate-200 rounded-full px-2 py-0.5">
              <span>{item.icon}</span>
              <span className="font-medium">{item.code}</span>
              <span className="text-slate-400">{item.name}</span>
            </span>
          ))}
        </div>
      )}
      {props.loading && (
        <div className="px-3 py-1.5 text-[11px] text-slate-500 border-b border-slate-100">Actualizando el corte…</div>
      )}
      <div className="overflow-auto max-h-[72vh]">
        <table className="min-w-max border-separate border-spacing-0 text-[11px]">
          <thead>
            <tr>
              <th className={`${head} sticky left-0 z-40 text-left min-w-[180px] px-2`}>Trabajador</th>
              {props.glance.days.map((iso, index) => {
                const parts = glanceDayParts(iso);
                const showMonth = index === 0 || parts.day === '01';
                return (
                  <th key={iso} className={`${head} min-w-[2.1rem]`} title={iso}>
                    <div className="font-normal normal-case text-slate-400">{parts.weekday}</div>
                    <div>{parts.day}</div>
                    {showMonth && <div className="font-normal normal-case text-slate-400">{parts.month}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {props.workers.map((worker) => {
              const row = worker.resourceId ? cells[worker.resourceId] : undefined;
              return (
                <tr key={worker.id} className={worker.included ? '' : 'opacity-50'}>
                  <td className="sticky left-0 z-20 bg-white px-2 py-1 border-t border-slate-100 min-w-[180px]">
                    <div className="font-medium text-slate-800 truncate max-w-[200px]">{worker.name || 'Sin nombre'}</div>
                    <div className="text-[10px] text-slate-400 truncate">{worker.position || (worker.resourceId ? '' : 'Manual, sin ficha')}</div>
                  </td>
                  {props.glance.days.map((iso) => {
                    const cell = row?.[iso];
                    if (!worker.resourceId) {
                      return <td key={iso} className="border-t border-slate-100 bg-slate-50/40" />;
                    }
                    return (
                      <td key={iso} className="border-t border-slate-100 p-0.5 text-center align-middle" title={cell?.title || iso}>
                        {cell ? (
                          <span className={`inline-flex min-w-[1.7rem] justify-center rounded px-0.5 py-0.5 leading-none ${GLANCE_TONE[cell.tone] || ''}`}>
                            {cell.text}
                          </span>
                        ) : (
                          <span className="text-slate-200">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LaborSheet(props: {
  workers: BillingWorkerInput[];
  lines: Map<string, ComputedWorker>;
  locked: boolean;
  onPatchWorker: (id: string, patch: Partial<BillingWorkerInput>) => void;
  onRemove: (id: string) => void;
}) {
  const head = 'sticky top-0 z-30 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-right px-1.5 py-2 whitespace-nowrap border-b border-slate-200';
  const headLeft = `${head} text-left`;
  if (props.workers.length === 0) {
    return <div className="p-6 text-sm text-slate-500">No hay personal para este filtro. Actualice desde la unidad o agregue una persona.</div>;
  }
  return (
    <div className="overflow-auto max-h-[72vh]">
      <table className="min-w-max border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className={`${headLeft} sticky left-0 z-30 w-8`} />
            <th className={`${headLeft} sticky left-8 z-30 min-w-[180px] bg-slate-100`}>Trabajador</th>
            <th className={headLeft}>Puesto</th>
            <th className={head}>Sueldo</th>
            <th className={head} title="Días del corte, antes de restar faltas">Días corte</th>
            <th className={head}>Faltas</th>
            <th className={head}>Días</th>
            <th className={head}>Asig. fam.</th>
            <th className={head}>HE 25 h</th>
            <th className={head} title="(sueldo + asignación familiar) / días del mes / horas por día × factor 1.25 × horas">HE 25 S/</th>
            <th className={head}>HE 35 h</th>
            <th className={head} title="(sueldo + asignación familiar) / días del mes / horas por día × factor 1.35 × horas">HE 35 S/</th>
            <th className={head}>Noc. h</th>
            <th className={head}>Noc. S/</th>
            <th className={head}>Cond. trab.</th>
            <th className={head}>Bonos</th>
            <th className={head}>Factor</th>
            <th className={head}>Base EsSalud</th>
            <th className={head}>Rem. básica</th>
            <th className={head}>Rem. cargas</th>
            <th className={head}>Vacaciones</th>
            <th className={head}>Gratific.</th>
            <th className={head}>CTS</th>
            <th className={head}>EsSalud</th>
            <th className={head}>Vida Ley</th>
            <th className={head}>SCTR</th>
            <th className={head}>Costo</th>
          </tr>
        </thead>
        <tbody>
          {props.workers.map((worker) => {
            const line = props.lines.get(worker.id);
            const salary = (value: number) =>
              props.onPatchWorker(worker.id, worker.socialBaseManual ? { contractualSalary: value } : { contractualSalary: value, socialBase: value });
            const dim = worker.included ? '' : 'opacity-50';
            return (
              <tr key={worker.id} className={`border-t border-slate-100 ${dim}`}>
                <td className="sticky left-0 z-20 bg-white px-1.5 py-1 align-middle">
                  <input type="checkbox" checked={worker.included} disabled={props.locked} onChange={(event) => props.onPatchWorker(worker.id, { included: event.target.checked })} />
                </td>
                <td className="sticky left-8 z-20 bg-white px-1.5 py-1 min-w-[180px] align-middle">
                  <input className={gridText} disabled={props.locked} value={worker.name} placeholder="Nombre" onChange={(event) => props.onPatchWorker(worker.id, { name: event.target.value })} />
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate">
                    <span className="truncate">{worker.origin === 'manual' ? 'Manual' : worker.missingFromUnit ? 'Ya no está en la unidad' : worker.contractualSalary <= 0 ? 'Sin sueldo en ficha' : ''}</span>
                    {worker.origin === 'manual' && !props.locked && (
                      <button type="button" className="text-red-500 shrink-0" onClick={() => props.onRemove(worker.id)} title="Quitar">
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-1 py-1"><input className={`${gridText} w-36`} disabled={props.locked} value={worker.position} onChange={(event) => props.onPatchWorker(worker.id, { position: event.target.value })} /></td>
                <td className="px-1 py-1"><GridNum amber={isAdjusted(worker, 'contractualSalary')} title={hint(worker, 'contractualSalary')} disabled={props.locked} value={worker.contractualSalary} onChange={salary} /></td>
                <td className="px-1.5 py-1 text-right tabular-nums text-slate-500">{worker.calendarDays ?? '—'}</td>
                <td className={`px-1.5 py-1 text-right tabular-nums font-medium ${worker.absenceDays ? 'text-red-700' : 'text-slate-400'}`} title={worker.absenceDetail || 'Sin faltas en el corte'}>
                  {worker.absenceDays || 0}
                </td>
                <td className="px-1 py-1">
                  <GridNum
                    step="1"
                    amber={isAdjusted(worker, 'daysWorked')}
                    title={worker.absenceDays ? `Corte ${worker.calendarDays ?? '—'} − faltas ${worker.absenceDays}${worker.absenceDetail ? ` (${worker.absenceDetail})` : ''}` : hint(worker, 'daysWorked')}
                    disabled={props.locked}
                    value={worker.daysWorked}
                    onChange={(daysWorked) => props.onPatchWorker(worker.id, { daysWorked })}
                  />
                </td>
                <td className="px-1 py-1"><GridNum amber={isAdjusted(worker, 'familyAllowance')} title={hint(worker, 'familyAllowance')} disabled={props.locked} value={worker.familyAllowance} onChange={(familyAllowance) => props.onPatchWorker(worker.id, { familyAllowance })} /></td>
                <td className="px-1 py-1"><GridNum step="0.5" disabled={props.locked} value={worker.he25Hours} onChange={(he25Hours) => props.onPatchWorker(worker.id, { he25Hours, he25Manual: null })} /></td>
                <td className="px-1 py-1"><GridNum amber={worker.he25Manual !== null} title={worker.he25Manual !== null ? 'Monto escrito a mano' : 'Calculado sobre sueldo + asignación familiar'} disabled={props.locked} value={worker.he25Manual !== null ? worker.he25Manual : roundShown(line?.he25)} onChange={(he25Manual) => props.onPatchWorker(worker.id, { he25Manual })} /></td>
                <td className="px-1 py-1"><GridNum step="0.5" disabled={props.locked} value={worker.he35Hours} onChange={(he35Hours) => props.onPatchWorker(worker.id, { he35Hours, he35Manual: null })} /></td>
                <td className="px-1 py-1"><GridNum amber={worker.he35Manual !== null} title={worker.he35Manual !== null ? 'Monto escrito a mano' : 'Calculado sobre sueldo + asignación familiar'} disabled={props.locked} value={worker.he35Manual !== null ? worker.he35Manual : roundShown(line?.he35)} onChange={(he35Manual) => props.onPatchWorker(worker.id, { he35Manual })} /></td>
                <td className="px-1 py-1"><GridNum step="0.5" disabled={props.locked} value={worker.nightHours} onChange={(nightHours) => props.onPatchWorker(worker.id, { nightHours, nightManual: null })} /></td>
                <td className="px-1 py-1"><GridNum amber={worker.nightManual !== null} disabled={props.locked} value={worker.nightManual !== null ? worker.nightManual : roundShown(line?.night)} onChange={(nightManual) => props.onPatchWorker(worker.id, { nightManual })} /></td>
                <td className="px-1 py-1"><GridNum amber={isAdjusted(worker, 'workCondition')} title={hint(worker, 'workCondition')} disabled={props.locked} value={worker.workCondition} onChange={(workCondition) => props.onPatchWorker(worker.id, { workCondition })} /></td>
                <td className="px-1 py-1"><GridNum amber={isAdjusted(worker, 'bonus')} title={worker.bonusConcept || hint(worker, 'bonus')} disabled={props.locked} value={worker.bonus} onChange={(bonus) => props.onPatchWorker(worker.id, { bonus })} /></td>
                <td className="px-1 py-1"><GridNum amber={!same(worker.factor, 1)} disabled={props.locked} value={worker.factor} onChange={(factor) => props.onPatchWorker(worker.id, { factor })} /></td>
                <td className="px-1 py-1">
                  <GridNum
                    amber={worker.socialBaseManual}
                    title="Sueldo completo para EsSalud y SCTR. No se prorratea por días."
                    disabled={props.locked}
                    value={worker.socialBaseManual ? worker.socialBase : worker.contractualSalary}
                    onChange={(socialBase) => props.onPatchWorker(worker.id, { socialBaseManual: true, socialBase })}
                  />
                </td>
                <td className="px-1.5 py-1"><GridMoney value={line?.basic} /></td>
                <td className="px-1.5 py-1"><GridMoney value={line?.remLlss} /></td>
                <td className="px-1.5 py-1"><GridMoney value={line?.vacation} /></td>
                <td className="px-1.5 py-1"><GridMoney value={line?.gratification} /></td>
                <td className="px-1.5 py-1"><GridMoney value={line?.cts} /></td>
                <td className="px-1.5 py-1"><GridMoney value={line?.essalud} /></td>
                <td className="px-1.5 py-1"><GridMoney value={line?.vidaLey} /></td>
                <td className="px-1.5 py-1"><GridMoney value={line?.sctr} /></td>
                <td className="px-1.5 py-1"><GridMoney value={worker.included ? line?.totalCost : 0} strong /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GridNum(props: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  amber?: boolean;
  title?: string;
  step?: string;
}) {
  return (
    <input
      type="number"
      step={props.step || '0.01'}
      title={props.title}
      disabled={props.disabled}
      value={Number.isFinite(props.value) ? props.value : 0}
      onChange={(event) => props.onChange(event.target.value === '' ? 0 : Number(event.target.value))}
      className={`w-[4.4rem] rounded border px-1 py-0.5 text-right text-[11px] tabular-nums disabled:bg-slate-50 ${props.amber ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}
    />
  );
}

function GridMoney({ value, strong }: { value?: number; strong?: boolean }) {
  const amount = Number.isFinite(value) ? (value as number) : 0;
  return <span className={`block text-right tabular-nums whitespace-nowrap ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
}

function roundShown(value: number | undefined): number {
  return Number((value || 0).toFixed(2));
}

const gridText = 'w-full rounded border border-slate-200 px-1 py-0.5 text-[11px] disabled:bg-slate-50';

function LinesEditor(props: {
  title: string;
  hint: string;
  lines: BillingCostLine[];
  kinds: [string, string][];
  locked: boolean;
  computed: { id: string; amount: number; formula: boolean }[];
  onChange: (lines: BillingCostLine[]) => void;
}) {
  const amounts = new Map(props.computed.map((line) => [line.id, line]));
  const update = (id: string, patch: Partial<BillingCostLine>) => {
    props.onChange(props.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{props.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{props.hint}</p>
        </div>
        {!props.locked && (
          <button
            type="button"
            onClick={() =>
              props.onChange([
                ...props.lines,
                { id: newBillingId(), kind: props.kinds[0][0], description: '', amount: 0 },
              ])
            }
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
          >
            <Plus size={14} /> Ítem
          </button>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {props.lines.map((line) => {
          const shown = amounts.get(line.id)?.amount ?? line.amount;
          const formula = line.kind === 'financiero' && line.formulaLocked;
          return (
            <div key={line.id} className="p-3 grid md:grid-cols-[160px_1fr_140px_auto] gap-2 items-end">
              <label className="text-xs text-slate-500">
                Tipo
                <select className={fieldClass} disabled={props.locked} value={line.kind} onChange={(event) => update(line.id, { kind: event.target.value })}>
                  {props.kinds.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Descripción
                <input className={fieldClass} disabled={props.locked} value={line.description} onChange={(event) => update(line.id, { description: event.target.value })} />
              </label>
              <label className="text-xs text-slate-500">
                Monto mensual
                <input className={fieldClass} type="number" step="0.01" disabled={props.locked || formula} value={formula ? Number(shown.toFixed(2)) : line.amount} onChange={(event) => update(line.id, { amount: Number(event.target.value) || 0, formulaLocked: false })} />
              </label>
              <div className="flex items-center gap-2 pb-1">
                {line.kind === 'financiero' && !props.locked && (
                  <button type="button" className="text-xs text-blue-700" onClick={() => update(line.id, { formulaLocked: !line.formulaLocked })}>
                    {formula ? 'Escribir monto' : 'Usar fórmula'}
                  </button>
                )}
                {!props.locked && (
                  <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => props.onChange(props.lines.filter((item) => item.id !== line.id))}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {props.lines.length === 0 && <div className="p-6 text-sm text-slate-500">Sin ítems en este componente.</div>}
      </div>
    </section>
  );
}

function ParametersPanel(props: {
  rates: BillingRates;
  considerations: string;
  locked: boolean;
  canEdit: boolean;
  onRates: (patch: Partial<BillingRates>) => void;
  onConsiderations: (value: string) => void;
  onRemember: () => void;
}) {
  const percent = (key: keyof BillingRates, label: string, hint?: string) => (
    <label className="text-xs text-slate-500">
      {label}
      <input
        className={fieldClass}
        type="number"
        step="0.001"
        disabled={props.locked}
        value={Number(((props.rates[key] as number) * 100).toFixed(4))}
        onChange={(event) => props.onRates({ [key]: (Number(event.target.value) || 0) / 100 } as Partial<BillingRates>)}
      />
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">Parámetros de cargas y utilidad</h2>
        <p className="text-sm text-slate-500 mt-1">
          Salen del método de facturación de abril: vacaciones 1/12, gratificación 16.67% con bonificación 9%, CTS 9.72%, EsSalud 9%, Vida Ley 0.396% y SCTR 1.65% (0.78% + 0.87%). Cámbielos solo si el contrato de la unidad usa otras tasas.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <label className="text-xs text-slate-500">
          Asignación familiar (S/)
          <input className={fieldClass} type="number" step="0.01" disabled={props.locked} value={props.rates.familyAllowanceAmount} onChange={(event) => props.onRates({ familyAllowanceAmount: Number(event.target.value) || 0 })} />
        </label>
        {percent('vacationRate', 'Vacaciones %', '1/12 = 8.3333% de la remuneración para cargas')}
        {percent('gratiRate', 'Gratificación %')}
        <label className="text-xs text-slate-500">
          Factor de bonificación extraordinaria
          <input className={fieldClass} type="number" step="0.01" disabled={props.locked} value={props.rates.gratiBonusFactor} onChange={(event) => props.onRates({ gratiBonusFactor: Number(event.target.value) || 0 })} />
          <span className="block text-[11px] text-slate-400 mt-1">1.09 aplica el 9% adicional sobre la gratificación.</span>
        </label>
        {percent('ctsRate', 'CTS %')}
        {percent('essaludRate', 'EsSalud %', 'Base: sueldo contractual + asignación familiar + gratificación + feriados')}
        {percent('vidaLeyRate', 'Vida Ley %', 'Base: remuneración para cargas + vacaciones')}
        {percent('sctrRate', 'SCTR %', 'Base: sueldo contractual + gratificación')}
        {percent('igvRate', 'IGV %', 'Se muestra aparte. El total principal no lo incluye.')}
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-slate-700">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" disabled={props.locked} checked={props.rates.applySctr} onChange={(event) => props.onRates({ applySctr: event.target.checked })} /> Incluir SCTR
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" disabled={props.locked} checked={props.rates.applyVidaLey} onChange={(event) => props.onRates({ applyVidaLey: event.target.checked })} /> Incluir Vida Ley
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" disabled={props.locked} checked={props.rates.applyFeria} onChange={(event) => props.onRates({ applyFeria: event.target.checked })} /> Incluir feriados
        </label>
      </div>
      <label className="text-xs text-slate-500 block">
        Consideraciones que salen en el Excel
        <textarea className={`${fieldClass} min-h-28`} disabled={props.locked} value={props.considerations} onChange={(event) => props.onConsiderations(event.target.value)} />
      </label>
      {props.canEdit && (
        <button type="button" onClick={props.onRemember} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm">
          <FileSpreadsheet size={16} /> Guardar estas condiciones para la unidad
        </button>
      )}
    </section>
  );
}

function TracePanel(props: {
  editor: EditorState;
  pendingChanges: { label: string; before: string; after: string }[];
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-100">
      <div className="p-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <History size={16} /> Qué se hizo en esta facturación
        </h2>
        <p className="text-sm text-slate-500 mt-1">Al guardar se registra quién cambió cada sueldo, día, costo o tasa, con el valor anterior y el nuevo.</p>
      </div>
      {props.pendingChanges.length > 0 && (
        <div className="p-4 bg-amber-50">
          <p className="text-sm font-medium text-amber-900 mb-2">Todavía no guardados</p>
          <ChangeList changes={props.pendingChanges} />
        </div>
      )}
      {props.editor.audit.length === 0 && props.pendingChanges.length === 0 && (
        <div className="p-6 text-sm text-slate-500">Guarde la liquidación para empezar el historial.</div>
      )}
      {props.editor.audit.map((entry) => (
        <article key={entry.id} className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">
              {ACTION_LABEL[entry.action] || entry.action} · {entry.actorName || 'Usuario'}
            </p>
            <time className="text-xs text-slate-400">{new Date(entry.createdAt).toLocaleString('es-PE')}</time>
          </div>
          <p className="text-sm text-slate-600 mt-1">{entry.summary}</p>
          {entry.changes.length > 0 && (
            <div className="mt-2">
              <ChangeList changes={entry.changes} />
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

function ChangeList({ changes }: { changes: { label: string; before: string; after: string }[] }) {
  return (
    <ul className="space-y-1 text-xs text-slate-600 max-h-64 overflow-y-auto">
      {changes.slice(0, 80).map((change, index) => (
        <li key={`${change.label}-${index}`}>
          <span className="text-slate-800">{change.label}:</span> {change.before} → {change.after}
        </li>
      ))}
      {changes.length > 80 && <li>y {changes.length - 80} cambios más</li>}
    </ul>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="bg-white border border-slate-200 rounded-xl p-4">
      <h2 className="font-semibold text-slate-900 text-sm">{title}</h2>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{text}</p>
    </article>
  );
}

function SummaryRow({ label, value, share }: { label: string; value: number; share: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-900">{pen(value)}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: BillingStatus }) {
  const styles = {
    draft: 'bg-slate-100 text-slate-700',
    issued: 'bg-emerald-100 text-emerald-800',
    void: 'bg-red-100 text-red-700',
  }[status];
  const label = { draft: 'Borrador', issued: 'Emitida', void: 'Anulada' }[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles}`}>{label}</span>;
}

function Banner({ tone, text }: { tone: 'info' | 'danger'; text: string }) {
  const cls = tone === 'danger' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-blue-50 border-blue-200 text-blue-900';
  return (
    <div className={`border rounded-lg px-3 py-2 text-sm flex gap-2 ${cls}`}>
      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

function Field(props: { label: string; hint?: string; adjusted: boolean; children: React.ReactNode }) {
  return (
    <label className={`text-xs block ${props.adjusted ? 'text-amber-800' : 'text-slate-500'}`}>
      {props.label}
      {props.adjusted ? ' · ajustado' : ''}
      {props.children}
      {props.hint && <span className="block text-[11px] text-slate-400 mt-1">{props.hint}</span>}
    </label>
  );
}

const fieldClass = 'mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-50';

function isAdjusted(worker: BillingWorkerInput, field: keyof NonNullable<BillingWorkerInput['suggested']>): boolean {
  if (!worker.suggested) return false;
  return !same(worker[field], worker.suggested[field]);
}

function hint(worker: BillingWorkerInput, field: keyof NonNullable<BillingWorkerInput['suggested']>): string | undefined {
  if (!worker.suggested || !isAdjusted(worker, field)) return worker.origin === 'unit' ? undefined : undefined;
  return `En la ficha: ${worker.suggested[field]}`;
}

function same(a: number, b: number): boolean {
  return Math.abs((a || 0) - (b || 0)) < 0.0001;
}

function share(part: number, total: number): number {
  if (!total) return 0;
  return (part / total) * 100;
}

function describeCreation(model: ClientBillingModel) {
  const included = model.workers.filter((worker) => worker.included).length;
  return [
    {
      label: 'Personal incluido',
      before: '—',
      after: `${included} trabajador(es)`,
    },
    {
      label: 'Corte de asistencia y novedades',
      before: '—',
      after: formatAttendanceRange(model.attendanceFrom, model.attendanceTo),
    },
  ];
}

async function exportExcel(editor: EditorState, computed: BillingComputation) {
  try {
    const { downloadClientBillingExcel } = await import('../utils/clientBillingExcel');
    await downloadClientBillingExcel({
      clientName: editor.clientName,
      unitName: editor.unitName,
      periodMonth: editor.periodMonth,
      model: editor.model,
      computed,
    });
  } catch (error) {
    console.error(error);
    alert('No se pudo generar el Excel de la facturación.');
  }
}
