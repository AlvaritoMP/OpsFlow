import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  Trash2,
  Users,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Unit, User } from '../types';
import {
  BillingActor,
  BillingStatus,
  ClientBillingAuditEntry,
  ClientBillingRecord,
  findActiveBilling,
  getBillingAudit,
  listClientBillings,
  prepareBillingDraft,
  refreshWorkersFromUnit,
  saveBillingProfile,
  saveClientBilling,
  setBillingStatus,
} from '../services/clientBillingService';
import {
  BillingComputation,
  BillingCostLine,
  BillingRates,
  BillingWorkerInput,
  ClientBillingModel,
  ComputedWorker,
  cloneModel,
  computeBilling,
  diffBillingModels,
  formatPeriodLabel,
  newBillingId,
  pen,
  workerAdjustmentLabels,
} from '../utils/clientBillingCalc';

interface ClientBillingProps {
  units: Unit[];
  currentUser: User;
  canEdit: boolean;
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
};

export const ClientBilling: React.FC<ClientBillingProps> = ({ units, currentUser, canEdit }) => {
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
  const [loadingList, setLoadingList] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | BillingStatus>('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [tab, setTab] = useState<TabId>('labor');
  const [busy, setBusy] = useState<string | null>(null);
  const [workerQuery, setWorkerQuery] = useState('');
  const [openWorkerId, setOpenWorkerId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createUnitId, setCreateUnitId] = useState('');
  const [createPeriod, setCreatePeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [copyPrevious, setCopyPrevious] = useState(true);

  const loadList = async () => {
    setLoadingList(true);
    try {
      const rows = await listClientBillings();
      setRecords(rows);
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'No se pudo cargar la facturación.');
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
      setTab('labor');
      setOpenWorkerId(null);
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
        { copyPreviousCosts: copyPrevious }
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
      setShowCreate(false);
      setTab('labor');
      setBanner('Borrador armado con el personal activo. Revise sueldos, días y costos antes de guardar.');
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

  const save = async () => {
    if (!editor || locked) return;
    setBusy('Guardando');
    setBanner(null);
    try {
      const saved = await saveClientBilling({
        id: editor.id,
        unit: { id: editor.unitId, name: editor.unitName, clientName: editor.clientName },
        periodMonth: editor.periodMonth,
        model: editor.model,
        actor,
        changes: editor.id ? pendingChanges : describeCreation(editor.model),
      });
      const audit = await getBillingAudit(saved.id);
      setEditor({
        ...editor,
        id: saved.id,
        status: saved.status,
        model: cloneModel(saved.model),
        baseline: cloneModel(saved.model),
        audit,
        createdByName: saved.createdByName,
        updatedByName: saved.updatedByName,
      });
      setBanner(pendingChanges.length || !editor.id ? 'Liquidación guardada. Los ajustes quedaron en la trazabilidad.' : 'No había cambios nuevos.');
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
      let billingId = editor.id;
      let issuedEditor = editor;
      if (status === 'issued' && (!billingId || pendingChanges.length)) {
        const savedDraft = await saveClientBilling({
          id: editor.id,
          unit: { id: editor.unitId, name: editor.unitName, clientName: editor.clientName },
          periodMonth: editor.periodMonth,
          model: editor.model,
          actor,
          changes: editor.id ? pendingChanges : describeCreation(editor.model),
        });
        billingId = savedDraft.id;
        issuedEditor = {
          ...editor,
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

  const reloadPersonnel = async () => {
    if (!editor || locked) return;
    setBusy('Actualizando personal');
    try {
      const model = await refreshWorkersFromUnit(editor.unitId, editor.periodMonth, editor.model);
      setEditor({ ...editor, model });
      setBanner('Se actualizó el personal. Los campos que usted ya había ajustado se conservaron.');
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
                  Arma la facturación de intermediación y tercerización con el personal de la unidad, los costos operativos, los gastos administrativos y la utilidad. Cada ajuste queda registrado.
                </p>
              </div>
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
            </header>

            <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <InfoCard title="1. Costo laboral" text="Sueldo del personal de la unidad, días trabajados y cargas: vacaciones, gratificación, CTS, EsSalud, Vida Ley y SCTR." />
              <InfoCard title="2. Costo operativo" text="Materiales, equipos y maquinaria del mes. Se cargan como ítems con monto." />
              <InfoCard title="3. Gastos administrativos" text="Estructura del cliente: costo financiero, gestión de recurso humano y otros ítems." />
              <InfoCard title="4. Utilidad" text="Porcentaje de la unidad. Puede ser un margen sobre el precio o un recargo sobre el costo." />
            </section>

            {storageError && <Banner tone="danger" text={storageError} />}
            {banner && <Banner tone="info" text={banner} />}

            {showCreate && (
              <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <h2 className="font-semibold text-slate-800">Nueva liquidación</h2>
                <div className="grid md:grid-cols-3 gap-3">
                  <label className="text-sm text-slate-600 md:col-span-2">
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
                    Mes
                    <input className={fieldClass} type="month" value={createPeriod} onChange={(event) => setCreatePeriod(event.target.value)} />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={copyPrevious} onChange={(event) => setCopyPrevious(event.target.checked)} />
                  Copiar costos operativos y administrativos del mes anterior
                </label>
                <p className="text-xs text-slate-500">Las unidades BPO no se facturan por este método. El personal, el sueldo, la asignación familiar y los bonos del mes salen de OpsFlow; usted puede ajustarlos.</p>
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
                      {visibleRecords.map((record) => (
                        <tr key={record.id} className="border-t border-slate-100 hover:bg-blue-50/50 cursor-pointer" onClick={() => void openRecord(record)}>
                          <td className="px-4 py-3 font-medium text-slate-800">{formatPeriodLabel(record.periodMonth)}</td>
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
                      ))}
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
            openWorkerId={openWorkerId}
            setOpenWorkerId={setOpenWorkerId}
            onBack={() => {
              setEditor(null);
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
  openWorkerId: string | null;
  setOpenWorkerId: (id: string | null) => void;
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
}) {
  const { editor, computed, locked } = props;
  const workerMap = new Map(computed.workers.map((worker) => [worker.id, worker]));
  const filteredWorkers = editor.model.workers.filter((worker) => {
    const q = props.workerQuery.trim().toLowerCase();
    if (!q) return true;
    return `${worker.name} ${worker.position} ${worker.dni || ''}`.toLowerCase().includes(q);
  });
  const includedCount = editor.model.workers.filter((worker) => worker.included).length;

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
            {editor.unitName} · {formatPeriodLabel(editor.periodMonth)}
            {editor.updatedByName ? ` · Último guardado por ${editor.updatedByName}` : ''}
            {editor.issuedByName ? ` · Emitida por ${editor.issuedByName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={props.onExport} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm hover:bg-slate-50">
            <Download size={16} /> Excel
          </button>
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
              <button type="button" onClick={props.onIssue} disabled={!!props.busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60">
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
        <Banner tone="info" text="Esta facturación está emitida. Para cambiar un sueldo, un costo o la utilidad hay que reabrirla; la reapertura y cada corrección quedan en la trazabilidad." />
      )}
      {props.banner && <Banner tone="info" text={props.banner} />}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
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
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Users size={16} />
                  <span>El costo laboral usa el sueldo pactado, los días del mes y las cargas del método de facturación.</span>
                </div>
                <div className="flex gap-2">
                  <input className={fieldClass} placeholder="Buscar trabajador" value={props.workerQuery} onChange={(event) => props.setWorkerQuery(event.target.value)} />
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
                          props.setOpenWorkerId(id);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm whitespace-nowrap"
                      >
                        <Plus size={14} /> Agregar
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {filteredWorkers.map((worker) => {
                  const line = workerMap.get(worker.id);
                  const open = props.openWorkerId === worker.id;
                  const adjustments = workerAdjustmentLabels(worker);
                  return (
                    <div key={worker.id} className={worker.included ? '' : 'bg-slate-50 opacity-80'}>
                      <button type="button" onClick={() => props.setOpenWorkerId(open ? null : worker.id)} className="w-full text-left px-3 py-3 flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={worker.included}
                          disabled={locked}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => props.onPatchWorker(worker.id, { included: event.target.checked })}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900 truncate">{worker.name || 'Trabajador sin nombre'}</div>
                          <div className="text-xs text-slate-500 truncate">
                            {worker.position || 'Sin puesto'}
                            {worker.origin === 'manual' ? ' · agregado manualmente' : ''}
                            {worker.missingFromUnit ? ' · ya no está en la unidad' : ''}
                            {worker.contractualSalary <= 0 ? ' · sin sueldo en ficha' : ''}
                          </div>
                        </div>
                        {adjustments.length > 0 && (
                          <span className="hidden md:inline text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Ajustado: {adjustments.slice(0, 3).join(', ')}</span>
                        )}
                        <div className="text-right">
                          <div className="font-semibold text-slate-900">{pen(line?.totalCost || 0)}</div>
                          <div className="text-[11px] text-slate-400">{worker.daysWorked} días</div>
                        </div>
                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open && line && (
                        <WorkerDetail worker={worker} line={line} rates={editor.model.rates} locked={locked} onPatch={(patch) => props.onPatchWorker(worker.id, patch)} onRemove={worker.origin === 'manual' ? () => props.onPatchModel({ workers: editor.model.workers.filter((item) => item.id !== worker.id) }) : undefined} />
                      )}
                    </div>
                  );
                })}
                {filteredWorkers.length === 0 && <div className="p-6 text-sm text-slate-500">No hay personal para este filtro. Actualice desde la unidad o agregue una persona.</div>}
              </div>
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

function WorkerDetail(props: {
  worker: BillingWorkerInput;
  line: ComputedWorker;
  rates: BillingRates;
  locked: boolean;
  onPatch: (patch: Partial<BillingWorkerInput>) => void;
  onRemove?: () => void;
}) {
  const { worker, line, locked, onPatch } = props;
  const salaryChanged = (value: number) => onPatch(worker.socialBaseManual ? { contractualSalary: value } : { contractualSalary: value, socialBase: value });
  return (
    <div className="px-3 pb-4 space-y-3">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <Field label="Nombre" adjusted={false}>
          <input className={fieldClass} disabled={locked} value={worker.name} onChange={(event) => onPatch({ name: event.target.value })} />
        </Field>
        <Field label="Puesto" adjusted={false}>
          <input className={fieldClass} disabled={locked} value={worker.position} onChange={(event) => onPatch({ position: event.target.value })} />
        </Field>
        <Field label="Sueldo mensual" hint={hint(worker, 'contractualSalary')} adjusted={isAdjusted(worker, 'contractualSalary')}>
          <input className={fieldClass} type="number" step="0.01" disabled={locked} value={worker.contractualSalary} onChange={(event) => salaryChanged(Number(event.target.value) || 0)} />
        </Field>
        <Field label="Días trabajados" hint={hint(worker, 'daysWorked')} adjusted={isAdjusted(worker, 'daysWorked')}>
          <input className={fieldClass} type="number" step="1" disabled={locked} value={worker.daysWorked} onChange={(event) => onPatch({ daysWorked: Number(event.target.value) || 0 })} />
        </Field>
        <Field label="Asignación familiar" hint={hint(worker, 'familyAllowance')} adjusted={isAdjusted(worker, 'familyAllowance')}>
          <input className={fieldClass} type="number" step="0.01" disabled={locked} value={worker.familyAllowance} onChange={(event) => onPatch({ familyAllowance: Number(event.target.value) || 0 })} />
        </Field>
        <Field label="Condición de trabajo" hint={hint(worker, 'workCondition')} adjusted={isAdjusted(worker, 'workCondition')}>
          <input className={fieldClass} type="number" step="0.01" disabled={locked} value={worker.workCondition} onChange={(event) => onPatch({ workCondition: Number(event.target.value) || 0 })} />
        </Field>
        <Field label="Bonos / premios" hint={worker.bonusConcept || hint(worker, 'bonus')} adjusted={isAdjusted(worker, 'bonus')}>
          <input className={fieldClass} type="number" step="0.01" disabled={locked} value={worker.bonus} onChange={(event) => onPatch({ bonus: Number(event.target.value) || 0 })} />
        </Field>
        <Field label="Factor" hint="1 = una persona. Úselo si esta fila representa varios puestos iguales." adjusted={!same(worker.factor, 1)}>
          <input className={fieldClass} type="number" step="0.01" disabled={locked} value={worker.factor} onChange={(event) => onPatch({ factor: Number(event.target.value) || 0 })} />
        </Field>
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <HourBox
          title="Hora extra 25%"
          formula={`(sueldo / 30 / 8) × ${props.rates.he25Factor} × horas`}
          hours={worker.he25Hours}
          manual={worker.he25Manual}
          amount={line.he25}
          locked={locked}
          onHours={(he25Hours) => onPatch({ he25Hours, he25Manual: null })}
          onManual={(he25Manual) => onPatch({ he25Manual })}
        />
        <HourBox
          title="Hora extra 35%"
          formula={`(sueldo / 30 / 8) × ${props.rates.he35Factor} × horas`}
          hours={worker.he35Hours}
          manual={worker.he35Manual}
          amount={line.he35}
          locked={locked}
          onHours={(he35Hours) => onPatch({ he35Hours, he35Manual: null })}
          onManual={(he35Manual) => onPatch({ he35Manual })}
        />
        <HourBox
          title="Bono nocturno"
          formula={`(sueldo / 30 / 8) × ${Math.round(props.rates.nightPremiumRate * 100)}% × horas`}
          hours={worker.nightHours}
          manual={worker.nightManual}
          amount={line.night}
          locked={locked}
          onHours={(nightHours) => onPatch({ nightHours, nightManual: null })}
          onManual={(nightManual) => onPatch({ nightManual })}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <Field label="Base para EsSalud y SCTR" hint={worker.socialBaseManual ? 'Ajustada a mano. Por defecto es el sueldo completo, no el proporcional a los días.' : 'Sueldo contractual completo, como en la facturación de abril.'} adjusted={worker.socialBaseManual}>
          <input
            className={fieldClass}
            type="number"
            step="0.01"
            disabled={locked}
            value={worker.socialBaseManual ? worker.socialBase : worker.contractualSalary}
            onChange={(event) => onPatch({ socialBaseManual: true, socialBase: Number(event.target.value) || 0 })}
          />
        </Field>
        <Field label="Nota de este trabajador" adjusted={false}>
          <input className={fieldClass} disabled={locked} value={worker.notes || ''} onChange={(event) => onPatch({ notes: event.target.value })} />
        </Field>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Charge label="Rem. básica" value={line.basic} />
        <Charge label="Rem. para cargas" value={line.remLlss} />
        <Charge label="Rem. total" value={line.remTotal} />
        <Charge label="Vacaciones" value={line.vacation} />
        <Charge label="Gratificación" value={line.gratification} />
        <Charge label="CTS" value={line.cts} />
        <Charge label="Feriados" value={line.feria} />
        <Charge label="EsSalud" value={line.essalud} />
        <Charge label="Vida Ley" value={line.vidaLey} />
        <Charge label="SCTR" value={line.sctr} />
        <Charge label="Costo del mes" value={line.monthlyCost} />
        <Charge label="Costo × factor" value={line.totalCost} strong />
      </div>
      {props.onRemove && !locked && (
        <button type="button" onClick={props.onRemove} className="text-xs text-red-600 inline-flex items-center gap-1">
          <Trash2 size={12} /> Quitar persona agregada
        </button>
      )}
    </div>
  );
}

function HourBox(props: {
  title: string;
  formula: string;
  hours: number;
  manual: number | null;
  amount: number;
  locked: boolean;
  onHours: (hours: number) => void;
  onManual: (amount: number | null) => void;
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="text-sm font-medium text-slate-800">{props.title}</div>
      <p className="text-[11px] text-slate-500">{props.formula}</p>
      <label className="text-xs text-slate-500 block">
        Horas
        <input className={fieldClass} type="number" step="0.5" disabled={props.locked} value={props.hours} onChange={(event) => props.onHours(Number(event.target.value) || 0)} />
      </label>
      <label className="text-xs text-slate-500 block">
        Monto {props.manual !== null ? '(manual)' : '(calculado)'}
        <input
          className={fieldClass}
          type="number"
          step="0.01"
          disabled={props.locked}
          value={props.manual !== null ? props.manual : Number(props.amount.toFixed(2))}
          onChange={(event) => props.onManual(Number(event.target.value) || 0)}
        />
      </label>
      {props.manual !== null && !props.locked && (
        <button type="button" onClick={() => props.onManual(null)} className="text-[11px] text-blue-700">
          Volver al cálculo por horas
        </button>
      )}
    </div>
  );
}

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

function Charge({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`rounded-lg px-2 py-1.5 ${strong ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600'}`}>
      <div className={strong ? 'text-slate-300' : ''}>{label}</div>
      <div className={`font-medium ${strong ? 'text-white' : 'text-slate-900'}`}>{pen(value)}</div>
    </div>
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
  ];
}

function exportExcel(editor: EditorState, computed: BillingComputation) {
  const workerById = new Map(editor.model.workers.map((worker) => [worker.id, worker]));
  const rows: (string | number)[][] = [
    [editor.model.title],
    [editor.clientName, editor.unitName, formatPeriodLabel(editor.periodMonth)],
    [editor.model.serviceLabel],
    [],
    ['Trabajador', 'Puesto', 'Incluido', 'Sueldo', 'Días', 'Asig. familiar', 'HE 25%', 'HE 35%', 'Bono nocturno', 'Cond. trabajo', 'Bonos', 'Rem. cargas', 'Vacaciones', 'Gratificación', 'CTS', 'EsSalud', 'Vida Ley', 'SCTR', 'Factor', 'Costo mensual'],
  ];
  computed.workers.forEach((line) => {
    const worker = workerById.get(line.id);
    if (!worker) return;
    rows.push([
      worker.name,
      worker.position,
      worker.included ? 'Sí' : 'No',
      worker.contractualSalary,
      worker.daysWorked,
      worker.familyAllowance,
      line.he25,
      line.he35,
      line.night,
      worker.workCondition,
      worker.bonus,
      line.remLlss,
      line.vacation,
      line.gratification,
      line.cts,
      line.essalud,
      line.vidaLey,
      line.sctr,
      worker.factor,
      worker.included ? line.totalCost : 0,
    ]);
  });
  rows.push([]);
  rows.push(['Costo laboral', computed.laborTotal]);
  editor.model.operational.forEach((line) => {
    const amount = computed.operational.find((item) => item.id === line.id)?.amount || 0;
    rows.push([`Operativo · ${line.description || line.kind}`, amount]);
  });
  rows.push(['Costo operativo', computed.operationalTotal]);
  editor.model.administrative.forEach((line) => {
    const amount = computed.administrative.find((item) => item.id === line.id)?.amount || 0;
    rows.push([`Administrativo · ${line.description || line.kind}`, amount]);
  });
  rows.push(['Gastos administrativos', computed.adminTotal]);
  rows.push(['Utilidad', computed.profitAmount]);
  rows.push(['Total sin IGV', computed.grandTotal]);
  rows.push(['IGV', computed.igvAmount]);
  rows.push(['Total con IGV', computed.totalWithIgv]);
  rows.push([]);
  editor.model.considerations.split('\n').forEach((line) => rows.push([line]));
  if (editor.model.comment) rows.push(['Comentario', editor.model.comment]);

  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = Array.from({ length: 20 }, () => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(book, sheet, 'Facturación');
  const safeName = `${editor.unitName}-${editor.periodMonth}`.replace(/[^\w\-]+/g, '_');
  XLSX.writeFile(book, `Facturacion_${safeName}.xlsx`);
}
