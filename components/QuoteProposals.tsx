import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, FileText, HelpCircle, History, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { Unit, User } from '../types';
import { loadPublishedBillingFormulas } from '../services/clientBillingService';
import {
  deleteQuote,
  listQuoteVersions,
  listQuotes,
  QuoteRecord,
  QuoteStatus,
  QuoteVersion,
  recordQuoteVersion,
  saveQuote,
  setQuoteStatus,
} from '../services/quoteProposalService';
import { describeFormula, sameBillingFormulas, BillingFormulaSet } from '../utils/billingFormulas';
import {
  BillingCostLine,
  BillingRates,
  newBillingId,
  pen,
} from '../utils/clientBillingCalc';
import { buildQuoteDocument } from '../utils/quoteDocument';
import { downloadQuotePdf } from '../utils/quotePdf';
import {
  buildQuoteView,
  createEmptyQuote,
  defaultCommercialTerms,
  emptyQuotePosition,
  formatRatePercent,
  nextQuoteCode,
  QuoteClause,
  QuoteCommercialTerms,
  quoteMoney,
  quotePositions,
  QuotePosition,
  QuoteProposalPayload,
} from '../utils/quoteProposal';

interface QuoteProposalsProps {
  units: Unit[];
  currentUser: User;
  canEdit: boolean;
  onOpenHelp?: () => void;
}

interface EditorState {
  id?: string;
  code: string;
  clientName: string;
  status: QuoteStatus;
  payload: QuoteProposalPayload;
  updatedByName?: string;
  issuedAt?: string;
  issuedByName?: string;
  versions?: QuoteVersion[];
}

type TabId = 'positions' | 'ops' | 'admin' | 'params' | 'terms' | 'preview';

const OPS_KINDS: Array<[string, string]> = [
  ['materiales', 'Materiales'],
  ['equipos', 'Equipos'],
  ['maquinaria', 'Maquinaria'],
  ['supervision', 'Supervisión'],
  ['capacitacion', 'Capacitación'],
  ['epps_uniformes', 'Epps y Uniformes'],
  ['otros', 'Otros'],
];

const ADMIN_KINDS: Array<[string, string]> = [
  ['financiero', 'Costo financiero'],
  ['gestion_rrhh', 'Gestión de RRHH'],
  ['estructura', 'Estructura'],
];

const fieldClass = 'mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-50';
const gridInput = 'w-full min-w-[5.5rem] rounded border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums disabled:bg-slate-50';
const gridText = 'w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-50';

function formatIssuedAt(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

export function newQuoteBaseline(editor: EditorState): string {
  return JSON.stringify({ code: editor.code, clientName: editor.clientName, payload: editor.payload });
}

export const QuoteProposals: React.FC<QuoteProposalsProps> = ({ units, currentUser, canEdit, onOpenHelp }) => {
  const actor = { id: currentUser.id, name: currentUser.name || currentUser.email };
  const [records, setRecords] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | QuoteStatus>('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [baseline, setBaseline] = useState('');
  const [tab, setTab] = useState<TabId>('positions');
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [reopenAsk, setReopenAsk] = useState(false);
  const [publishedFormulas, setPublishedFormulas] = useState<BillingFormulaSet | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [createForm, setCreateForm] = useState({
    unitId: '',
    clientName: '',
    address: '',
    attention: '',
    serviceName: '',
    months: 1,
    issueDate: new Date().toISOString().slice(0, 10),
  });

  const loadList = async () => {
    setLoading(true);
    try {
      setRecords(await listQuotes());
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'No se pudieron cargar las propuestas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
    void loadPublishedBillingFormulas()
      .then((formulas) => setPublishedFormulas(formulas))
      .catch(() => setPublishedFormulas(null));
    const src = new URL('../assets/logo-opalo.jpg', import.meta.url).href;
    let cancelled = false;
    void fetch(src)
      .then((response) => response.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          })
      )
      .then((url) => {
        if (!cancelled) setLogoUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const view = useMemo(() => (editor ? buildQuoteView(editor.payload) : null), [editor]);
  const html = useMemo(
    () => (editor && view ? buildQuoteDocument({ code: editor.code, clientName: editor.clientName, payload: editor.payload, view, logoUrl }) : ''),
    [editor, view, logoUrl]
  );
  const dirty = editor ? newQuoteBaseline(editor) !== baseline : false;
  const locked = !canEdit || editor?.status !== 'draft';

  const visible = records.filter((record) => {
    if (filterStatus && record.status !== filterStatus) return false;
    const haystack = `${record.code} ${record.clientName} ${record.serviceName} ${record.issuedByName || ''}`.toLocaleLowerCase('es');
    return haystack.includes(query.trim().toLocaleLowerCase('es'));
  });

  const openRecord = async (record: QuoteRecord) => {
    const versions = record.id ? await listQuoteVersions(record.id) : [];
    const next: EditorState = {
      id: record.id,
      code: record.code,
      clientName: record.clientName,
      status: record.status,
      payload: record.payload,
      updatedByName: record.updatedByName,
      issuedAt: record.issuedAt,
      issuedByName: record.issuedByName,
      versions,
    };
    setEditor(next);
    setBaseline(newQuoteBaseline(next));
    setTab('positions');
    setBanner(null);
  };

  const patchPayload = (patch: Partial<QuoteProposalPayload>) => {
    setEditor((current) => (current ? { ...current, payload: { ...current.payload, ...patch } } : current));
  };

  const patchModel = (patch: Partial<QuoteProposalPayload['model']>) => {
    setEditor((current) =>
      current ? { ...current, payload: { ...current.payload, model: { ...current.payload.model, ...patch } } } : current
    );
  };

  const patchRates = (patch: Partial<BillingRates>) => {
    setEditor((current) =>
      current
        ? {
            ...current,
            payload: { ...current.payload, model: { ...current.payload.model, rates: { ...current.payload.model.rates, ...patch } } },
          }
        : current
    );
  };

  const patchPosition = (id: string, patch: Partial<QuotePosition>) => {
    setEditor((current) => {
      if (!current) return current;
      const workers = quotePositions(current.payload.model).map((worker) => {
        if (worker.id !== id) return worker;
        const next = { ...worker, ...patch };
        if (patch.name !== undefined) next.position = patch.name;
        if (patch.factor !== undefined) next.factor = Math.max(1, Math.round(patch.factor || 1));
        return next;
      });
      return { ...current, payload: { ...current.payload, model: { ...current.payload.model, workers } } };
    });
  };

  const startCreate = () => {
    const payload = createEmptyQuote({
      serviceName: createForm.serviceName,
      address: createForm.address,
      attention: createForm.attention,
      months: createForm.months,
      issueDate: createForm.issueDate,
      formulas: publishedFormulas,
    });
    const next: EditorState = {
      code: nextQuoteCode(records.map((record) => record.code)),
      clientName: createForm.clientName.trim(),
      status: 'draft',
      payload,
    };
    setEditor(next);
    setBaseline('');
    setShowCreate(false);
    setTab('positions');
    setBanner('La propuesta usa el método de liquidación. Guárdela cuando los puestos estén listos.');
  };

  const save = async () => {
    if (!editor || locked) return;
    setBusy('save');
    try {
      const saved = await saveQuote({
        id: editor.id,
        code: editor.code,
        clientName: editor.clientName,
        payload: editor.payload,
        actor,
      });
      const next: EditorState = { ...editor, id: saved.id, payload: saved.payload, updatedByName: saved.updatedByName };
      setEditor(next);
      setBaseline(newQuoteBaseline(next));
      setBanner('Propuesta guardada.');
      await loadList();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      setBusy(null);
    }
  };

  const issue = async () => {
    if (!editor || locked) return;
    if (!editor.clientName.trim()) {
      setBanner('Indique el cliente antes de emitir.');
      return;
    }
    if (!quotePositions(editor.payload.model).some((position) => position.included)) {
      setBanner('Incluya al menos un puesto.');
      return;
    }
    setBusy('issue');
    try {
      const saved = await saveQuote({
        id: editor.id,
        code: editor.code,
        clientName: editor.clientName,
        payload: editor.payload,
        actor,
      });
      const issued = await setQuoteStatus(saved.id, 'issued', actor);
      let historyNote = '';
      try {
        await recordQuoteVersion({
          quoteId: issued.id,
          action: 'issued',
          actor,
          summary: `Emitió la propuesta. Costo laboral ${pen(issued.laborTotal)}. Total con IGV ${pen(issued.totalWithIgv)}.`,
          laborTotal: issued.laborTotal,
          grandTotal: issued.grandTotal,
          totalWithIgv: issued.totalWithIgv,
          payload: issued.payload,
        });
      } catch (error) {
        historyNote = error instanceof Error ? ` ${error.message}` : ' No se pudo guardar la versión.';
      }
      const versions = await listQuoteVersions(issued.id);
      const next: EditorState = {
        ...editor,
        id: issued.id,
        status: 'issued',
        payload: issued.payload,
        issuedAt: issued.issuedAt,
        issuedByName: issued.issuedByName,
        updatedByName: issued.updatedByName,
        versions,
      };
      setEditor(next);
      setBaseline(newQuoteBaseline(next));
      const versionLabel = versions[0] ? ` Quedó la versión ${versions[0].versionNo} a nombre de ${actor.name}.` : '';
      setBanner(`Propuesta emitida.${versionLabel}${historyNote} Para corregir un monto hay que reabrirla.`);
      await loadList();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo emitir.');
    } finally {
      setBusy(null);
    }
  };

  const rememberVersion = async (quoteId: string, input: Parameters<typeof recordQuoteVersion>[0]) => {
    try {
      await recordQuoteVersion(input);
      return '';
    } catch (error) {
      return error instanceof Error ? ` ${error.message}` : ' No se pudo guardar la versión.';
    } finally {
      try {
        const versions = await listQuoteVersions(quoteId);
        setEditor((current) => (current && current.id === quoteId ? { ...current, versions } : current));
      } catch {
        /* El estado ya cambió. El listado se vuelve a leer al abrir la propuesta. */
      }
    }
  };

  const reopen = async (updateFormulas: boolean) => {
    if (!editor?.id) return;
    setReopenAsk(false);
    setBusy('draft');
    try {
      let updated = await setQuoteStatus(editor.id, 'draft', actor);
      let summary = 'Reabrió la propuesta y dejó el cálculo como estaba.';
      if (updateFormulas) {
        const formulas = await loadPublishedBillingFormulas();
        setPublishedFormulas(formulas);
        if (!formulas) {
          summary = 'Reabrió la propuesta. No había un método publicado, así que el cálculo quedó como estaba.';
        } else {
          updated = await saveQuote({
            id: updated.id,
            code: updated.code,
            clientName: updated.clientName,
            payload: { ...updated.payload, model: { ...updated.payload.model, formulas } },
            actor,
          });
          summary = 'Reabrió la propuesta y actualizó el cálculo con las fórmulas publicadas.';
        }
      }
      const historyNote = await rememberVersion(updated.id, {
        quoteId: updated.id,
        action: 'reopened',
        actor,
        summary,
        laborTotal: updated.laborTotal,
        grandTotal: updated.grandTotal,
        totalWithIgv: updated.totalWithIgv,
      });
      const versions = await listQuoteVersions(updated.id);
      const next: EditorState = {
        ...editor,
        id: updated.id,
        status: updated.status,
        payload: updated.payload,
        updatedByName: updated.updatedByName,
        issuedAt: updated.issuedAt,
        issuedByName: updated.issuedByName,
        versions,
      };
      setEditor(next);
      setBaseline(newQuoteBaseline(next));
      setBanner(`${summary}${historyNote}`);
      await loadList();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo reabrir.');
    } finally {
      setBusy(null);
    }
  };

  const askReopen = async () => {
    if (!editor) return;
    setBusy('formulas');
    try {
      const formulas = await loadPublishedBillingFormulas();
      setPublishedFormulas(formulas);
      if (formulas && !sameBillingFormulas(editor.payload.model.formulas, formulas)) {
        setReopenAsk(true);
        return;
      }
      await reopen(false);
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo leer el método publicado.');
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = async (status: QuoteStatus) => {
    if (!editor?.id || status === 'draft') return;
    setBusy(status);
    try {
      const updated = await setQuoteStatus(editor.id, status, actor);
      const historyNote = await rememberVersion(updated.id, {
        quoteId: updated.id,
        action: 'void',
        actor,
        summary: 'Anuló la propuesta.',
        laborTotal: updated.laborTotal,
        grandTotal: updated.grandTotal,
        totalWithIgv: updated.totalWithIgv,
      });
      const versions = await listQuoteVersions(updated.id);
      const next: EditorState = {
        ...editor,
        id: updated.id,
        status: updated.status,
        payload: updated.payload,
        updatedByName: updated.updatedByName,
        issuedAt: updated.issuedAt,
        issuedByName: updated.issuedByName,
        versions,
      };
      setEditor(next);
      setBaseline(newQuoteBaseline(next));
      setBanner(`Propuesta anulada.${historyNote}`);
      await loadList();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo cambiar el estado.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (record: QuoteRecord) => {
    if (!window.confirm(`Eliminar la propuesta ${record.code}?`)) return;
    setBusy(record.id);
    try {
      await deleteQuote(record.id);
      if (editor?.id === record.id) setEditor(null);
      await loadList();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo eliminar.');
    } finally {
      setBusy(null);
    }
  };

  const downloadPdf = async () => {
    if (!editor || !view) return;
    setBusy('pdf');
    setBanner(null);
    try {
      await downloadQuotePdf(
        { code: editor.code, clientName: editor.clientName, payload: editor.payload, view, logoUrl },
        editor.code || 'propuesta'
      );
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo descargar el PDF.');
    } finally {
      setBusy(null);
    }
  };

  const refreshFormulas = async () => {
    if (!editor || locked) return;
    setBusy('formulas');
    try {
      const formulas = await loadPublishedBillingFormulas();
      setPublishedFormulas(formulas);
      patchModel({ formulas: formulas || editor.payload.model.formulas });
      setBanner(formulas ? 'Esta propuesta tomó el método publicado de facturación.' : 'No hay un método publicado. Se mantiene el que ya tenía la propuesta.');
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'No se pudo leer el método publicado.');
    } finally {
      setBusy(null);
    }
  };

  if (!editor || !view) {
    return (
      <div className="h-full overflow-y-auto bg-slate-50">
        <div className="max-w-[1500px] mx-auto p-4 md:p-6 space-y-4">
          <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-blue-700">
                <FileText size={22} />
                <h1 className="text-2xl font-bold text-slate-900">Cotizador</h1>
              </div>
              <p className="text-sm text-slate-600 mt-1 max-w-3xl">
                Arma una propuesta con los mismos puestos, cargas, costos y utilidad de una liquidación. El documento conserva el resumen comercial y deja editar las condiciones del servicio y las notas del anexo.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {onOpenHelp && (
                <button type="button" onClick={onOpenHelp} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 px-2">
                  <HelpCircle size={14} /> Ayuda
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-lg hover:bg-slate-800"
                >
                  <Plus size={18} /> Nueva propuesta
                </button>
              )}
            </div>
          </header>
          {storageError && <Banner text={storageError} />}
          {banner && <Banner text={banner} />}
          <div className="flex flex-col md:flex-row gap-2">
            <input
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="Buscar por código, cliente o servicio"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as '' | QuoteStatus)}>
              <option value="">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="issued">Emitida</option>
              <option value="void">Anulada</option>
            </select>
          </div>
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Cargando propuestas…</div>
            ) : visible.length === 0 ? (
              <div className="p-8 text-sm text-slate-500">No hay propuestas para este filtro.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Servicio</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2 text-right">Laboral</th>
                      <th className="px-3 py-2 text-right">Operativo</th>
                      <th className="px-3 py-2 text-right">Administrativo</th>
                      <th className="px-3 py-2 text-right">Utilidad</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2">Fecha de emisión</th>
                      <th className="px-3 py-2">Emitida por</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((record) => (
                      <tr key={record.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-900">{record.code}</td>
                        <td className="px-3 py-2">{record.clientName}</td>
                        <td className="px-3 py-2 text-slate-600">{record.serviceName}</td>
                        <td className="px-3 py-2"><StatusChip status={record.status} /></td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-slate-700">{pen(record.laborTotal)}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-slate-700">{pen(record.operationalTotal)}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-slate-700">{pen(record.adminTotal)}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-slate-700">{pen(record.profitTotal)}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold text-slate-900" title="Suma sin IGV">{pen(record.grandTotal)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatIssuedAt(record.issuedAt)}</td>
                        <td className="px-3 py-2 text-slate-700">{record.issuedByName || '—'}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button type="button" className="text-blue-700 text-sm" onClick={() => openRecord(record)}>Abrir</button>
                          {canEdit && record.status !== 'issued' && (
                            <button type="button" className="ml-3 text-red-600 text-sm" disabled={busy === record.id} onClick={() => void remove(record)}>Eliminar</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {showCreate && (
            <CreateDialog
              units={units}
              form={createForm}
              onChange={setCreateForm}
              onClose={() => setShowCreate(false)}
              onCreate={startCreate}
            />
          )}
        </div>
      </div>
    );
  }

  const rates = editor.payload.model.rates;
  const positions = quotePositions(editor.payload.model);

  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-50">
      <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 md:p-4">
        <div className="shrink-0 flex flex-col xl:flex-row xl:items-start justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => {
                if (dirty && !window.confirm('Hay cambios sin guardar. Si sale ahora, se pierden.')) return;
                setEditor(null);
              }}
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
            >
              <ArrowLeft size={16} /> Propuestas
            </button>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <h1 className="text-xl font-bold text-slate-900">{editor.code || 'Nueva propuesta'}</h1>
              <StatusChip status={editor.status} />
              {dirty && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Cambios sin guardar</span>}
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {editor.clientName || 'Sin cliente'}
              {editor.updatedByName ? ` · Último guardado por ${editor.updatedByName}` : ''}
              {editor.issuedByName || editor.issuedAt ? ` · Emitida${editor.issuedAt ? ` el ${formatIssuedAt(editor.issuedAt)}` : ''}${editor.issuedByName ? ` por ${editor.issuedByName}` : ''}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onOpenHelp && (
              <button type="button" onClick={onOpenHelp} title="Ayuda del cotizador" className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600">
                <HelpCircle size={16} />
              </button>
            )}
            <button type="button" onClick={() => void downloadPdf()} disabled={!!busy || !html} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm disabled:opacity-60">
              {busy === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {busy === 'pdf' ? 'Preparando PDF…' : 'Descargar PDF'}
            </button>
            {editor.status === 'issued' && canEdit && (
              <button type="button" onClick={() => void askReopen()} disabled={!!busy} className="px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm disabled:opacity-60">Reabrir</button>
            )}
            {editor.status === 'void' && canEdit && (
              <button type="button" onClick={() => void askReopen()} disabled={!!busy} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm disabled:opacity-60">Restaurar a borrador</button>
            )}
            {editor.status === 'draft' && canEdit && (
              <>
                <button type="button" onClick={() => void save()} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-60">
                  <Save size={16} /> Guardar
                </button>
                <button type="button" onClick={() => void issue()} disabled={!!busy} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60">Emitir</button>
              </>
            )}
            {editor.id && editor.status === 'issued' && canEdit && (
              <button type="button" onClick={() => void changeStatus('void')} className="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50">Anular</button>
            )}
          </div>
        </div>
        {banner && <Banner text={banner} />}
        {editor.status === 'issued' && <Banner text="Emitida y cerrada. Reábrala para cambiar un sueldo, un costo, una condición o una nota. Si las fórmulas publicadas cambiaron, puede actualizar el cálculo o dejarlo como estaba." />}
        {editor.id && <QuoteVersions versions={editor.versions || []} />}
        {reopenAsk && (
          <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-start justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-4 mt-16">
              <h2 className="text-lg font-semibold text-slate-900">Reabrir propuesta</h2>
              <p className="text-sm text-slate-600">
                Las fórmulas de cálculo publicadas son distintas de las que usó esta propuesta. Puede actualizar el cálculo o dejarlo como estaba al emitirse.
              </p>
              <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
                <button type="button" onClick={() => setReopenAsk(false)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">Cancelar</button>
                <button type="button" onClick={() => void reopen(false)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">Dejar el cálculo como estaba</button>
                <button type="button" onClick={() => void reopen(true)} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm">Actualizar con las fórmulas nuevas</button>
              </div>
            </div>
          </div>
        )}

        <section className="shrink-0 bg-white border border-slate-200 rounded-xl p-4 grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          <label className="text-xs text-slate-500">Código
            <input className={fieldClass} disabled={locked} value={editor.code} onChange={(event) => setEditor({ ...editor, code: event.target.value })} />
          </label>
          <label className="text-xs text-slate-500">Cliente
            <input className={fieldClass} disabled={locked} value={editor.clientName} onChange={(event) => setEditor({ ...editor, clientName: event.target.value })} />
          </label>
          <label className="text-xs text-slate-500">Dirección
            <input className={fieldClass} disabled={locked} value={editor.payload.address} onChange={(event) => patchPayload({ address: event.target.value })} />
          </label>
          <label className="text-xs text-slate-500">Atención
            <input className={fieldClass} disabled={locked} value={editor.payload.attention} onChange={(event) => patchPayload({ attention: event.target.value })} />
          </label>
          <label className="text-xs text-slate-500 md:col-span-2">Servicio
            <input className={fieldClass} disabled={locked} value={editor.payload.model.serviceLabel} onChange={(event) => patchModel({ serviceLabel: event.target.value })} />
          </label>
          <label className="text-xs text-slate-500">Fecha de emisión
            <input className={fieldClass} type="date" disabled={locked} value={editor.payload.issueDate} onChange={(event) => patchPayload({ issueDate: event.target.value })} />
          </label>
          <label className="text-xs text-slate-500">Meses del periodo
            <input className={fieldClass} type="number" min={1} step={1} disabled={locked} value={editor.payload.months} onChange={(event) => patchPayload({ months: Math.max(1, Math.round(Number(event.target.value) || 1)) })} />
          </label>
        </section>

        <div className="shrink-0 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
          <Stat label="Costo laboral" value={pen(view.computed.laborTotal)} />
          <Stat label="Operativo" value={pen(view.computed.operationalTotal)} />
          <Stat label="Administrativo" value={pen(view.computed.adminTotal)} />
          <Stat label="Utilidad" value={pen(view.computed.profitAmount)} />
          <Stat label="Subtotal neto" value={pen(view.computed.grandTotal)} />
          <Stat label={`IGV ${formatRatePercent(rates.igvRate)}%`} value={pen(view.computed.igvAmount)} />
          <Stat label="Monto facturado" value={pen(view.computed.totalWithIgv)} />
          <Stat label={`${editor.payload.months} meses`} value={pen(view.periodWithIgv)} />
        </div>

        <div className="shrink-0 flex gap-1 overflow-x-auto">
          {(
            [
              ['positions', `Puestos (${positions.filter((position) => position.included).length})`],
              ['ops', 'Operativo'],
              ['admin', 'Administrativo'],
              ['params', 'Parámetros'],
              ['terms', 'Condiciones y notas'],
              ['preview', 'Propuesta'],
            ] as Array<[TabId, string]>
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap ${tab === id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
        {tab === 'positions' && (
          <PositionSheet
            positions={positions}
            view={view}
            locked={locked}
            formulas={editor.payload.model.formulas}
            familyAmount={rates.familyAllowanceAmount}
            commercialDays={rates.commercialMonthDays}
            onPatch={patchPosition}
            onAdd={() => patchModel({ workers: [...positions, emptyQuotePosition(`Puesto ${positions.length + 1}`, rates)] })}
            onRemove={(id) => patchModel({ workers: positions.filter((position) => position.id !== id) })}
            onFamily={() =>
              patchModel({
                workers: positions.map((position) => (position.included ? { ...position, familyAllowance: rates.familyAllowanceAmount } : position)),
              })
            }
            onDays={() =>
              patchModel({
                workers: positions.map((position) => (position.included ? { ...position, daysWorked: rates.commercialMonthDays || 30, daysManual: true } : position)),
              })
            }
          />
        )}
        {tab === 'ops' && (
          <CostEditor
            title="Costos operativos"
            hint="Materiales, equipos, supervisión, capacitación, EPP y otros. Entran al total de la propuesta, igual que en una liquidación, y no se prorratean dentro del puesto."
            lines={editor.payload.model.operational}
            kinds={OPS_KINDS}
            locked={locked}
            amounts={view.computed.operational}
            onChange={(operational) => patchModel({ operational })}
          />
        )}
        {tab === 'admin' && (
          <CostEditor
            title="Gastos administrativos"
            hint="El costo financiero sale de la tasa y los días de los parámetros. Gestión de RRHH y estructura se escriben como monto."
            lines={editor.payload.model.administrative}
            kinds={ADMIN_KINDS}
            locked={locked}
            amounts={view.computed.administrative}
            onChange={(administrative) => patchModel({ administrative })}
          />
        )}
        {tab === 'params' && (
          <ParamsPanel
            rates={rates}
            formulas={editor.payload.model.formulas}
            locked={locked}
            busy={busy === 'formulas'}
            onRates={patchRates}
            onRefresh={() => void refreshFormulas()}
          />
        )}
        {tab === 'terms' && (
          <TermsPanel
            title={editor.payload.model.title}
            scope={editor.payload.serviceScope || ''}
            terms={editor.payload.commercialTerms || defaultCommercialTerms()}
            months={editor.payload.months}
            clauses={editor.payload.clauses}
            notes={editor.payload.notes}
            locked={locked}
            onTitle={(title) => patchModel({ title })}
            onScope={(serviceScope) => patchPayload({ serviceScope })}
            onTerms={(commercialTerms) => patchPayload({ commercialTerms })}
            onClauses={(clauses) => patchPayload({ clauses })}
            onNotes={(notes) => patchPayload({ notes })}
          />
        )}
        {tab === 'preview' && (
          <div className="h-full min-h-0 overflow-auto">
            <QuotePreview html={html} />
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

function PositionSheet(props: {
  positions: QuotePosition[];
  view: NonNullable<ReturnType<typeof buildQuoteView>>;
  locked: boolean;
  formulas?: BillingFormulaSet;
  familyAmount: number;
  commercialDays: number;
  onPatch: (id: string, patch: Partial<QuotePosition>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onFamily: () => void;
  onDays: () => void;
}) {
  const lines = new Map(props.view.computed.workers.map((line) => [line.id, line]));
  const head = 'sticky top-0 z-20 bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right px-2 py-2.5 whitespace-nowrap border-b border-slate-200';
  const headLeft = `${head} text-left`;
  const say = (id: string) => describeFormula(id, props.formulas);
  return (
    <section className="h-full min-h-0 flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="shrink-0 p-3 flex flex-col lg:flex-row gap-2 lg:items-center justify-between border-b border-slate-100">
        <p className="text-sm text-slate-600">
          Cada fila calcula el costo de 1 puesto. Escriba las horas extra y las horas de bono nocturno: el importe lo calcula el mismo método de una liquidación. La cantidad multiplica solo el costo laboral total.
        </p>
        {!props.locked && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={props.onDays} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">Días de mes ({props.commercialDays || 30})</button>
            <button type="button" onClick={props.onFamily} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">Asignación familiar S/ {quoteMoney(props.familyAmount)}</button>
            <button type="button" onClick={props.onAdd} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs"><Plus size={14} /> Puesto</button>
          </div>
        )}
      </div>
      {props.positions.length === 0 ? (
        <div className="flex-1 p-6 text-sm text-slate-500">Agregue un puesto para empezar la propuesta.</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={headLeft} />
                <th className={`${headLeft} sticky left-0 z-30 bg-slate-100 min-w-[16rem]`}>Puesto</th>
                <th className={headLeft}>Sede</th>
                <th className={head}>Cantidad</th>
                <th className={head}>Sueldo</th>
                <th className={head}>Días</th>
                <th className={head} title={say('sueldoVacaciones')}>Días de vacaciones</th>
                <th className={head}>Asignación familiar</th>
                <th className={head}>Condición de trabajo</th>
                <th className={head}>Bonos</th>
                <th className={head}>HE día 25 h</th>
                <th className={head} title={say('he25')}>HE día 25 S/</th>
                <th className={head}>HE día 35 h</th>
                <th className={head} title={say('he35')}>HE día 35 S/</th>
                <th className={head} title={say('heNoche25')}>HE noche 25 h</th>
                <th className={head} title={say('heNoche25')}>HE noche 25 S/</th>
                <th className={head} title={say('heNoche35')}>HE noche 35 h</th>
                <th className={head} title={say('heNoche35')}>HE noche 35 S/</th>
                <th className={head} title={say('bonoNocturno')}>Bono h</th>
                <th className={head} title={say('bonoNocturno')}>Bono S/</th>
                <th className={head} title={say('basico')}>Remuneración básica</th>
                <th className={head} title={say('vacaciones')}>Vacaciones</th>
                <th className={head} title={say('gratificacion')}>Gratificación</th>
                <th className={head} title={say('cts')}>CTS</th>
                <th className={head} title={say('feriado')}>Feriados</th>
                <th className={head} title={say('essalud')}>EsSalud</th>
                <th className={head} title={say('vidaLey')}>Vida Ley</th>
                <th className={head} title={say('sctr')}>SCTR</th>
                <th className={head} title="Costo laboral calculado para 1 puesto">Costo de 1 puesto</th>
                <th className={head} title={say('costoTotal')}>Costo total</th>
                <th className={headLeft} />
              </tr>
            </thead>
            <tbody>
              {props.positions.map((position) => {
                const line = lines.get(position.id);
                return (
                  <tr key={position.id} className={`border-t border-slate-100 ${position.included ? '' : 'opacity-50'}`}>
                    <td className="px-1.5 py-1"><input type="checkbox" checked={position.included} disabled={props.locked} onChange={(event) => props.onPatch(position.id, { included: event.target.checked })} /></td>
                    <td className="sticky left-0 z-10 bg-white px-1.5 py-1.5 min-w-[16rem]"><input className={gridText} disabled={props.locked} value={position.name} onChange={(event) => props.onPatch(position.id, { name: event.target.value })} /></td>
                    <td className="px-1.5 py-1.5"><input className={`${gridText} min-w-[9rem]`} disabled={props.locked} value={position.site || ''} onChange={(event) => props.onPatch(position.id, { site: event.target.value })} /></td>
                    <td className="px-1 py-1"><Num disabled={props.locked} step="1" value={position.factor} onChange={(factor) => props.onPatch(position.id, { factor })} /></td>
                    <td className="px-1 py-1"><Num disabled={props.locked} value={position.contractualSalary} onChange={(contractualSalary) => props.onPatch(position.id, { contractualSalary })} /></td>
                    <td className="px-1 py-1"><Num disabled={props.locked} step="1" value={position.daysWorked} onChange={(daysWorked) => props.onPatch(position.id, { daysWorked, daysManual: true })} /></td>
                    <td className="px-1 py-1"><Num disabled={props.locked} step="1" value={position.vacationDays || 0} onChange={(vacationDays) => props.onPatch(position.id, { vacationDays })} /></td>
                    <td className="px-1 py-1"><Num disabled={props.locked} value={position.familyAllowance} onChange={(familyAllowance) => props.onPatch(position.id, { familyAllowance })} /></td>
                    <td className="px-1 py-1"><Num disabled={props.locked} value={position.workCondition} onChange={(workCondition) => props.onPatch(position.id, { workCondition })} /></td>
                    <td className="px-1 py-1"><Num disabled={props.locked} value={position.bonus} onChange={(bonus) => props.onPatch(position.id, { bonus })} /></td>
                    <HourAmount
                      hours={position.he25Hours}
                      amount={line?.he25 || 0}
                      manual={isHandAmount(position.he25Manual)}
                      locked={props.locked}
                      formula={say('he25')}
                      onHours={(he25Hours) => props.onPatch(position.id, { he25Hours, he25Manual: null })}
                    />
                    <HourAmount
                      hours={position.he35Hours}
                      amount={line?.he35 || 0}
                      manual={isHandAmount(position.he35Manual)}
                      locked={props.locked}
                      formula={say('he35')}
                      onHours={(he35Hours) => props.onPatch(position.id, { he35Hours, he35Manual: null })}
                    />
                    <HourAmount
                      hours={position.heNight25Hours || 0}
                      amount={line?.heNight25 || 0}
                      manual={isHandAmount(position.heNight25Manual)}
                      locked={props.locked}
                      formula={say('heNoche25')}
                      onHours={(heNight25Hours) => props.onPatch(position.id, { heNight25Hours, heNight25Manual: null })}
                    />
                    <HourAmount
                      hours={position.heNight35Hours || 0}
                      amount={line?.heNight35 || 0}
                      manual={isHandAmount(position.heNight35Manual)}
                      locked={props.locked}
                      formula={say('heNoche35')}
                      onHours={(heNight35Hours) => props.onPatch(position.id, { heNight35Hours, heNight35Manual: null })}
                    />
                    <HourAmount
                      hours={position.nightHours}
                      amount={line?.night || 0}
                      manual={isHandAmount(position.nightManual)}
                      locked={props.locked}
                      formula={say('bonoNocturno')}
                      onHours={(nightHours) => props.onPatch(position.id, { nightHours, nightManual: null })}
                    />
                    <Money value={line?.basic} />
                    <Money value={line?.vacation} />
                    <Money value={line?.gratification} />
                    <Money value={line?.cts} />
                    <Money value={line?.feria} />
                    <Money value={line?.essalud} />
                    <Money value={line?.vidaLey} />
                    <Money value={line?.sctr} />
                    <td className="px-2 py-1.5 text-right tabular-nums text-sm text-slate-900">{pen(line?.monthlyCost || 0)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-sm font-semibold text-slate-900">{pen(line?.totalCost || 0)}</td>
                    <td className="px-1 py-1">
                      {!props.locked && (
                        <button type="button" className="text-red-500" title="Quitar puesto" onClick={() => props.onRemove(position.id)}><Trash2 size={14} /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CostEditor(props: {
  title: string;
  hint: string;
  lines: BillingCostLine[];
  kinds: Array<[string, string]>;
  locked: boolean;
  amounts: Array<{ id: string; amount: number }>;
  onChange: (lines: BillingCostLine[]) => void;
}) {
  const amounts = new Map(props.amounts.map((line) => [line.id, line.amount]));
  const add = (kind: string) => {
    const label = props.kinds.find((item) => item[0] === kind)?.[1] || 'Concepto';
    const formulaLocked = kind === 'financiero' && !props.lines.some((line) => line.kind === 'financiero' && line.formulaLocked);
    props.onChange([...props.lines, { id: newBillingId(), kind, description: label, amount: 0, formulaLocked }]);
  };
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{props.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{props.hint}</p>
        </div>
        {!props.locked && (
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value="" onChange={(event) => event.target.value && add(event.target.value)}>
            <option value="">Agregar concepto</option>
            {props.kinds.map(([kind, label]) => (
              <option key={kind} value={kind}>{label}</option>
            ))}
          </select>
        )}
      </div>
      {props.lines.length === 0 ? (
        <p className="text-sm text-slate-500">Sin conceptos. El total de este bloque queda en cero.</p>
      ) : (
        <div className="space-y-2">
          {props.lines.map((line) => (
            <div key={line.id} className="grid md:grid-cols-[180px_minmax(0,1fr)_140px_auto] gap-2 items-center">
              <div className="text-xs text-slate-500">{props.kinds.find((item) => item[0] === line.kind)?.[1] || line.kind}</div>
              <input className={fieldClass} disabled={props.locked} value={line.description} onChange={(event) => props.onChange(props.lines.map((item) => (item.id === line.id ? { ...item, description: event.target.value } : item)))} />
              <input
                className={fieldClass}
                type="number"
                step="0.01"
                disabled={props.locked || line.formulaLocked}
                value={line.formulaLocked ? amounts.get(line.id) || 0 : line.amount}
                onChange={(event) => props.onChange(props.lines.map((item) => (item.id === line.id ? { ...item, amount: Number(event.target.value) || 0 } : item)))}
              />
              {!props.locked && (
                <button type="button" className="text-red-500" onClick={() => props.onChange(props.lines.filter((item) => item.id !== line.id))}><Trash2 size={16} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ParamsPanel(props: {
  rates: BillingRates;
  formulas?: BillingFormulaSet;
  locked: boolean;
  busy: boolean;
  onRates: (patch: Partial<BillingRates>) => void;
  onRefresh: () => void;
}) {
  const percent = (key: keyof BillingRates, label: string, formulaId?: string) => (
    <label className="text-xs text-slate-500">
      {label} %
      <input
        className={fieldClass}
        type="number"
        step="0.001"
        disabled={props.locked}
        value={Number((((props.rates[key] as number) || 0) * 100).toFixed(4))}
        onChange={(event) => props.onRates({ [key]: (Number(event.target.value) || 0) / 100 } as Partial<BillingRates>)}
      />
      {formulaId && <span className="block text-[11px] text-slate-400 mt-1">{describeFormula(formulaId, props.formulas)}</span>}
    </label>
  );
  const flag = (key: keyof BillingRates, label: string) => (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" disabled={props.locked} checked={Boolean(props.rates[key])} onChange={(event) => props.onRates({ [key]: event.target.checked } as Partial<BillingRates>)} />
      {label}
    </label>
  );
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Parámetros del cálculo</h2>
          <p className="text-sm text-slate-500 mt-1">Son los mismos de la liquidación. Al reabrir, puede actualizar el cálculo con las fórmulas publicadas o dejarlo como estaba.</p>
        </div>
        {!props.locked && (
          <button type="button" onClick={props.onRefresh} disabled={props.busy} className="px-3 py-2 rounded-lg border border-slate-200 text-sm disabled:opacity-60">
            {props.busy ? 'Leyendo…' : 'Traer método publicado'}
          </button>
        )}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="text-xs text-slate-500">Días del mes comercial<input className={fieldClass} type="number" disabled={props.locked} value={props.rates.commercialMonthDays} onChange={(event) => props.onRates({ commercialMonthDays: Number(event.target.value) || 0 })} /></label>
        <label className="text-xs text-slate-500">Horas por día<input className={fieldClass} type="number" disabled={props.locked} value={props.rates.hoursPerDay} onChange={(event) => props.onRates({ hoursPerDay: Number(event.target.value) || 0 })} /></label>
        <label className="text-xs text-slate-500">Asignación familiar de referencia (S/)<input className={fieldClass} type="number" step="0.01" disabled={props.locked} value={props.rates.familyAllowanceAmount} onChange={(event) => props.onRates({ familyAllowanceAmount: Number(event.target.value) || 0 })} /></label>
        <label className="text-xs text-slate-500">Remuneración mínima vital
          <input className={fieldClass} type="number" step="0.01" disabled={props.locked} value={props.rates.minimumWage} onChange={(event) => props.onRates({ minimumWage: Number(event.target.value) || 0 })} />
          <span className="block text-[11px] text-slate-400 mt-1">Piso de EsSalud. Sin asignación, con 9% no baja de S/ 110.70. Con asignación, el piso suma ese monto.</span>
        </label>
        {percent('vacationRate', 'Vacaciones', 'vacaciones')}
        {percent('gratiRate', 'Gratificación', 'gratificacion')}
        <label className="text-xs text-slate-500">Factor de bonificación extraordinaria<input className={fieldClass} type="number" step="0.01" disabled={props.locked} value={props.rates.gratiBonusFactor} onChange={(event) => props.onRates({ gratiBonusFactor: Number(event.target.value) || 0 })} /></label>
        {percent('ctsRate', 'CTS', 'cts')}
        {percent('feriaRate', 'Feriados', 'feriado')}
        {percent('essaludRate', 'EsSalud', 'essalud')}
        {percent('vidaLeyRate', 'Vida Ley', 'vidaLey')}
        {percent('sctrRate', 'SCTR', 'sctr')}
        <label className="text-xs text-slate-500">Factor hora extra 25%<input className={fieldClass} type="number" step="0.01" disabled={props.locked} value={props.rates.he25Factor} onChange={(event) => props.onRates({ he25Factor: Number(event.target.value) || 0 })} /></label>
        <label className="text-xs text-slate-500">Factor hora extra 35%<input className={fieldClass} type="number" step="0.01" disabled={props.locked} value={props.rates.he35Factor} onChange={(event) => props.onRates({ he35Factor: Number(event.target.value) || 0 })} /></label>
        {percent('nightPremiumRate', 'Recargo nocturno')}
        {percent('financialAnnualRate', 'Tasa financiera anual', 'financiero')}
        <label className="text-xs text-slate-500">Días financiados<input className={fieldClass} type="number" disabled={props.locked} value={props.rates.financialDays} onChange={(event) => props.onRates({ financialDays: Number(event.target.value) || 0 })} /></label>
        {percent('profitRate', 'Utilidad', 'utilidad')}
        {percent('igvRate', 'IGV', 'igv')}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs text-slate-500">EsSalud
          <select className={fieldClass} disabled={props.locked} value={props.rates.essaludMode} onChange={(event) => props.onRates({ essaludMode: event.target.value === 'fixed' ? 'fixed' : 'percent' })}>
            <option value="percent">Porcentaje de la base</option>
            <option value="fixed">Monto fijo por puesto</option>
          </select>
        </label>
        {props.rates.essaludMode === 'fixed' && (
          <label className="text-xs text-slate-500">Monto fijo de EsSalud<input className={fieldClass} type="number" step="0.01" disabled={props.locked} value={props.rates.essaludFixedAmount} onChange={(event) => props.onRates({ essaludFixedAmount: Number(event.target.value) || 0 })} /></label>
        )}
        <label className="text-xs text-slate-500">Utilidad
          <select className={fieldClass} disabled={props.locked} value={props.rates.profitMode} onChange={(event) => props.onRates({ profitMode: event.target.value === 'markup_on_cost' ? 'markup_on_cost' : 'margin_on_price' })}>
            <option value="margin_on_price">Margen sobre el precio de venta</option>
            <option value="markup_on_cost">Recargo sobre el costo</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">Base de la utilidad
          <select className={fieldClass} disabled={props.locked} value={props.rates.profitBase} onChange={(event) => props.onRates({ profitBase: event.target.value === 'labor' ? 'labor' : 'all' })}>
            <option value="all">Costo laboral, operativo y administrativo</option>
            <option value="labor">Solo costo laboral</option>
          </select>
        </label>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {flag('applyFeria', 'Incluir feriados')}
        {flag('applyVidaLey', 'Incluir Vida Ley')}
        {flag('applySctr', 'Incluir SCTR')}
        {flag('heDayIncludeFamily', 'La hora extra diurna suma la asignación familiar')}
        {flag('heNightIncludeFamily', 'La hora extra nocturna suma la asignación familiar')}
        {flag('heNightApplyPremium', 'La hora extra nocturna suma el recargo nocturno')}
        {flag('nightBonusIncludeFamily', 'El bono nocturno incluye la asignación familiar')}
      </div>
    </section>
  );
}

function TermsPanel(props: {
  title: string;
  scope: string;
  terms: QuoteCommercialTerms;
  months: number;
  clauses: QuoteClause[];
  notes: string[];
  locked: boolean;
  onTitle: (title: string) => void;
  onScope: (scope: string) => void;
  onTerms: (terms: QuoteCommercialTerms) => void;
  onClauses: (clauses: QuoteClause[]) => void;
  onNotes: (notes: string[]) => void;
}) {
  const move = <T,>(items: T[], index: number, direction: -1 | 1): T[] => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return items;
    const next = items.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    return next;
  };
  const patchTerms = (patch: Partial<QuoteCommercialTerms>) => props.onTerms({ ...props.terms, ...patch });
  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">Alcance del servicio</h2>
          <p className="text-sm text-slate-500 mt-1">Sale en la propuesta, antes del resumen. Describa en qué consiste el servicio.</p>
        </div>
        <textarea className={`${fieldClass} min-h-[120px]`} disabled={props.locked} value={props.scope} placeholder="Qué incluye el servicio, cómo se presta y qué queda a cargo del cliente." onChange={(event) => props.onScope(event.target.value)} />
      </section>
      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">Datos de la oferta</h2>
          <p className="text-sm text-slate-500 mt-1">Estos datos arman los bloques de modalidad, facturación y vigencia. La duración del contrato es la de los meses de la propuesta ({props.months}).</p>
        </div>
        <label className="text-xs text-slate-500 block max-w-xl">Título del documento
          <input className={fieldClass} disabled={props.locked} value={props.title} onChange={(event) => props.onTitle(event.target.value)} />
        </label>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-xs text-slate-500">Días estimados de implementación
            <input className={fieldClass} type="number" min={0} disabled={props.locked} value={props.terms.implementationDays} onChange={(event) => patchTerms({ implementationDays: Math.max(0, Math.round(Number(event.target.value) || 0)) })} />
          </label>
          <label className="text-xs text-slate-500">Moneda
            <input className={fieldClass} disabled={props.locked} value={props.terms.currencyName} onChange={(event) => patchTerms({ currencyName: event.target.value })} />
          </label>
          <label className="text-xs text-slate-500">Símbolo
            <input className={fieldClass} disabled={props.locked} value={props.terms.currencySymbol} onChange={(event) => patchTerms({ currencySymbol: event.target.value })} />
          </label>
          <label className="text-xs text-slate-500">Crédito (días)
            <input className={fieldClass} type="number" min={1} disabled={props.locked} value={props.terms.creditDays} onChange={(event) => patchTerms({ creditDays: Math.max(1, Math.round(Number(event.target.value) || 0)) })} />
          </label>
          <label className="text-xs text-slate-500">Vigencia de la oferta (días calendario)
            <input className={fieldClass} type="number" min={1} disabled={props.locked} value={props.terms.offerValidityDays} onChange={(event) => patchTerms({ offerValidityDays: Math.max(1, Math.round(Number(event.target.value) || 0)) })} />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">Fecha de corte
            <input className={fieldClass} disabled={props.locked} value={props.terms.billingCutoff} onChange={(event) => patchTerms({ billingCutoff: event.target.value })} />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">Emisión de factura
            <input className={fieldClass} disabled={props.locked} value={props.terms.invoiceIssue} onChange={(event) => patchTerms({ invoiceIssue: event.target.value })} />
          </label>
        </div>
      </section>
      <div className="grid xl:grid-cols-2 gap-4">
      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">Condiciones específicas</h2>
          <p className="text-sm text-slate-500 mt-1">Se imprimen como un bloque aparte, debajo de modalidad, facturación y vigencia. Use {'{meses}'} donde deba salir el periodo de esta propuesta.</p>
        </div>
        {props.clauses.map((clause, index) => (
          <div key={clause.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input className={fieldClass} disabled={props.locked} value={clause.title} placeholder="Título" onChange={(event) => props.onClauses(props.clauses.map((item) => (item.id === clause.id ? { ...item, title: event.target.value } : item)))} />
              {!props.locked && (
                <div className="flex gap-1">
                  <button type="button" className="px-2 text-slate-500" onClick={() => props.onClauses(move(props.clauses, index, -1))}>↑</button>
                  <button type="button" className="px-2 text-slate-500" onClick={() => props.onClauses(move(props.clauses, index, 1))}>↓</button>
                  <button type="button" className="text-red-500" onClick={() => props.onClauses(props.clauses.filter((item) => item.id !== clause.id))}><Trash2 size={16} /></button>
                </div>
              )}
            </div>
            <textarea className={`${fieldClass} min-h-[72px]`} disabled={props.locked} value={clause.text} onChange={(event) => props.onClauses(props.clauses.map((item) => (item.id === clause.id ? { ...item, text: event.target.value } : item)))} />
          </div>
        ))}
        {!props.locked && (
          <button type="button" onClick={() => props.onClauses([...props.clauses, { id: newBillingId(), title: '', text: '' }])} className="inline-flex items-center gap-1 text-sm text-blue-700">
            <Plus size={14} /> Condición
          </button>
        )}
      </section>
      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">Notas de cálculo y consideraciones laborales</h2>
          <p className="text-sm text-slate-500 mt-1">Salen al pie del anexo. Use {'{igv}'} para el porcentaje de IGV y {'{meses}'} para el periodo.</p>
        </div>
        {props.notes.map((note, index) => (
          <div key={index} className="flex gap-2">
            <textarea className={`${fieldClass} min-h-[64px]`} disabled={props.locked} value={note} onChange={(event) => props.onNotes(props.notes.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))} />
            {!props.locked && (
              <div className="flex flex-col gap-1">
                <button type="button" className="px-2 text-slate-500" onClick={() => props.onNotes(move(props.notes, index, -1))}>↑</button>
                <button type="button" className="px-2 text-slate-500" onClick={() => props.onNotes(move(props.notes, index, 1))}>↓</button>
                <button type="button" className="text-red-500" onClick={() => props.onNotes(props.notes.filter((_item, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button>
              </div>
            )}
          </div>
        ))}
        {!props.locked && (
          <button type="button" onClick={() => props.onNotes([...props.notes, ''])} className="inline-flex items-center gap-1 text-sm text-blue-700">
            <Plus size={14} /> Nota
          </button>
        )}
      </section>
      </div>
    </div>
  );
}

function QuotePreview({ html }: { html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  return (
    <div className="overflow-auto rounded-xl bg-slate-200 p-4">
      <iframe
        ref={frame}
        title="Vista previa de la propuesta"
        srcDoc={html}
        className="mx-auto block w-[297mm] max-w-none border-0 bg-transparent"
        style={{ height: 1400 }}
        onLoad={() => {
          const height = frame.current?.contentDocument?.body?.scrollHeight;
          if (frame.current && height) frame.current.style.height = `${height + 24}px`;
        }}
      />
    </div>
  );
}

function CreateDialog(props: {
  units: Unit[];
  form: { unitId: string; clientName: string; address: string; attention: string; serviceName: string; months: number; issueDate: string };
  onChange: (form: { unitId: string; clientName: string; address: string; attention: string; serviceName: string; months: number; issueDate: string }) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const chooseUnit = (unitId: string) => {
    const unit = props.units.find((item) => item.id === unitId);
    props.onChange({
      ...props.form,
      unitId,
      clientName: unit?.clientName || props.form.clientName,
      serviceName: props.form.serviceName || unit?.name || '',
    });
  };
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-5 space-y-4 my-8">
        <h2 className="text-lg font-semibold text-slate-900">Nueva propuesta</h2>
        <p className="text-sm text-slate-500">Puede partir de una unidad ya registrada o escribir un cliente que todavía no está en el sistema.</p>
        <label className="text-xs text-slate-500 block">Unidad de referencia
          <select className={fieldClass} value={props.form.unitId} onChange={(event) => chooseUnit(event.target.value)}>
            <option value="">Sin unidad</option>
            {props.units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.clientName} · {unit.name}</option>
            ))}
          </select>
        </label>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">Cliente<input className={fieldClass} value={props.form.clientName} onChange={(event) => props.onChange({ ...props.form, clientName: event.target.value })} /></label>
          <label className="text-xs text-slate-500">Servicio<input className={fieldClass} value={props.form.serviceName} onChange={(event) => props.onChange({ ...props.form, serviceName: event.target.value })} /></label>
          <label className="text-xs text-slate-500">Dirección<input className={fieldClass} value={props.form.address} onChange={(event) => props.onChange({ ...props.form, address: event.target.value })} /></label>
          <label className="text-xs text-slate-500">Atención<input className={fieldClass} value={props.form.attention} onChange={(event) => props.onChange({ ...props.form, attention: event.target.value })} /></label>
          <label className="text-xs text-slate-500">Meses<input className={fieldClass} type="number" min={1} value={props.form.months} onChange={(event) => props.onChange({ ...props.form, months: Math.max(1, Number(event.target.value) || 1) })} /></label>
          <label className="text-xs text-slate-500">Fecha<input className={fieldClass} type="date" value={props.form.issueDate} onChange={(event) => props.onChange({ ...props.form, issueDate: event.target.value })} /></label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={props.onClose} className="px-3 py-2 rounded-lg border border-slate-200 text-sm">Cancelar</button>
          <button type="button" onClick={props.onCreate} disabled={!props.form.clientName.trim()} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50">Armar propuesta</button>
        </div>
      </div>
    </div>
  );
}

function QuoteVersions({ versions }: { versions: QuoteVersion[] }) {
  const label = (action: QuoteVersion['action']) => (action === 'issued' ? 'Emitida' : action === 'reopened' ? 'Reabierta' : 'Anulada');
  return (
    <section className="shrink-0 bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-2 text-slate-800">
        <History size={16} />
        <h2 className="font-semibold">Versiones</h2>
      </div>
      <p className="text-sm text-slate-500 mt-1">Cada emisión queda con quién la emitió. Al reabrir se anota si el cálculo se actualizó o se dejó como estaba.</p>
      {versions.length === 0 ? (
        <p className="text-sm text-slate-500 mt-2">Todavía no hay versiones. La primera queda al emitir.</p>
      ) : (
        <ol className="mt-2 max-h-36 overflow-auto divide-y divide-slate-100">
          {versions.map((version) => (
            <li key={version.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-medium text-slate-900">Versión {version.versionNo}</span>
                <span className="text-slate-500">{label(version.action)}</span>
                <span className="text-slate-500">{version.actorName || 'Sin usuario'}</span>
                <span className="text-slate-400">{formatIssuedAt(version.createdAt)}</span>
                {version.action === 'issued' && version.totalWithIgv != null && (
                  <span className="tabular-nums text-slate-700">{pen(version.totalWithIgv)} con IGV</span>
                )}
              </div>
              <p className="text-slate-600 mt-0.5">{version.summary}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function isHandAmount(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function HourAmount(props: {
  hours: number;
  amount: number;
  manual: boolean;
  locked: boolean;
  formula: string;
  onHours: (hours: number) => void;
}) {
  const title = props.manual
    ? 'Este importe se escribió a mano. Vuelva a escribir las horas para que el sistema lo calcule.'
    : props.formula;
  return (
    <>
      <td className="px-1 py-1" title="Horas de una vacante">
        <Num disabled={props.locked} step="0.5" value={props.hours} onChange={props.onHours} />
      </td>
      <td
        className={`px-2 py-1.5 text-right tabular-nums text-sm ${props.manual ? 'bg-amber-50 text-amber-900' : 'text-slate-700'}`}
        title={title}
      >
        {pen(props.amount)}
      </td>
    </>
  );
}

function Num(props: { value: number; disabled?: boolean; step?: string; onChange: (value: number) => void }) {
  return (
    <input
      className={gridInput}
      type="number"
      step={props.step || '0.01'}
      disabled={props.disabled}
      value={Number.isFinite(props.value) ? props.value : 0}
      onChange={(event) => props.onChange(Number(event.target.value) || 0)}
    />
  );
}

function Money({ value }: { value?: number }) {
  return <td className="px-2 py-1.5 text-right tabular-nums text-sm text-slate-700">{pen(value || 0)}</td>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

function StatusChip({ status }: { status: QuoteStatus }) {
  const label = status === 'issued' ? 'Emitida' : status === 'void' ? 'Anulada' : 'Borrador';
  const tone = status === 'issued' ? 'bg-emerald-100 text-emerald-800' : status === 'void' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800';
  return <span className={`text-xs px-2 py-0.5 rounded-full ${tone}`}>{label}</span>;
}

function Banner({ text }: { text: string }) {
  return <div className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{text}</div>;
}
