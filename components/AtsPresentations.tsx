import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Archive,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  RefreshCw,
  Save,
  User,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { inboundWorkerHandoffService } from '../services/inboundWorkerHandoffService';
import { RegisterHandoffWorkerModal } from './RegisterHandoffWorkerModal';
import { ComplementaryFichaForm } from './ComplementaryFichaForm';
import { resolveHandoffDisplayName } from '../utils/handoffNameParts';
import {
  deriveComplementaryStatusFromData,
  hydrateComplementaryFromSnapshot,
} from '../utils/complementaryHydrate';
import {
  ComplementaryStatus,
  InboundHandoffItem,
  InboundHandoffItemStatus,
  Unit,
  WorkerSnapshotComplementary,
} from '../types';

interface AtsPresentationsProps {
  canEdit: boolean;
  units: Unit[];
  currentUserName?: string;
  onRegistered?: () => void;
}

type PresentationFilter = 'pending' | 'approved' | 'rejected' | 'archived' | 'all';

const FILTERS: { id: PresentationFilter; label: string }[] = [
  { id: 'pending', label: 'Pendientes' },
  { id: 'approved', label: 'Aprobados' },
  { id: 'rejected', label: 'Rechazados' },
  { id: 'archived', label: 'Archivados' },
  { id: 'all', label: 'Todos' },
];

const STATUS_LABELS: Partial<Record<InboundHandoffItemStatus, string>> = {
  pending_interview: 'Pendiente',
  in_review: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  assigned: 'Registrado',
  archived_no_hire: 'Archivado (sin ingreso)',
};

const STATUS_STYLES: Partial<Record<InboundHandoffItemStatus, string>> = {
  pending_interview: 'bg-slate-100 text-slate-700',
  in_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  assigned: 'bg-indigo-100 text-indigo-800',
  archived_no_hire: 'bg-slate-200 text-slate-700',
};

const FICHA_BADGE: Record<ComplementaryStatus, { label: string; className: string }> = {
  complete: { label: 'Ficha completa', className: 'bg-emerald-100 text-emerald-800' },
  incomplete: { label: 'Ficha incompleta', className: 'bg-amber-100 text-amber-800' },
  missing: { label: 'Sin ficha', className: 'bg-slate-200 text-slate-700' },
};

function formatDateTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}

function fichaBadge(status?: ComplementaryStatus | null) {
  return FICHA_BADGE[status ?? 'missing'];
}

function resolveItemComplementary(item: InboundHandoffItem): WorkerSnapshotComplementary {
  return hydrateComplementaryFromSnapshot(item.workerSnapshot, item.complementary);
}

function resolveItemFichaStatus(item: InboundHandoffItem): ComplementaryStatus {
  const complementary = resolveItemComplementary(item);
  return deriveComplementaryStatusFromData(
    complementary,
    item.complementaryStatus,
    item.complementaryMissingFields,
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
  badge,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-[48px] items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {badge && <p className="mt-0.5 truncate text-xs text-slate-500">{badge}</p>}
        </div>
        {open ? (
          <ChevronUp size={18} className="shrink-0 text-slate-400" />
        ) : (
          <ChevronDown size={18} className="shrink-0 text-slate-400" />
        )}
      </button>
      {open && <div className="border-t border-slate-100 px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}

function ReadonlyGrid({ entries }: { entries: { label: string; value: unknown }[] }) {
  const visible = entries.filter(
    (e) => e.value !== null && e.value !== undefined && e.value !== '',
  );
  if (visible.length === 0) {
    return <p className="text-sm text-slate-500">Sin datos.</p>;
  }
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {visible.map((entry) => (
        <div key={entry.label} className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">{entry.label}</dt>
          <dd className="break-words text-sm text-slate-900">{formatValue(entry.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function PresentationDetail({
  item,
  canEdit,
  units,
  currentUserName,
  onBack,
  onChanged,
  onRegister,
}: {
  item: InboundHandoffItem;
  canEdit: boolean;
  units: Unit[];
  currentUserName?: string;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onRegister: (item: InboundHandoffItem) => void;
}) {
  const [draft, setDraft] = useState<WorkerSnapshotComplementary>(() =>
    resolveItemComplementary(item),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const loadedItemIdRef = useRef(item.id);

  useEffect(() => {
    if (loadedItemIdRef.current !== item.id) {
      loadedItemIdRef.current = item.id;
      setDraft(resolveItemComplementary(item));
      setDirty(false);
      setSavedMsg(null);
      setError(null);
      setRejectOpen(false);
      setRejectReason('');
      setArchiveOpen(false);
      setArchiveReason('');
      return;
    }
    // Tras guardar/decidir, sincroniza solo si no hay ediciones locales pendientes
    if (!dirty) {
      setDraft(resolveItemComplementary(item));
    }
  }, [item, dirty]);

  const displayName = resolveHandoffDisplayName({
    snapshot: item.workerSnapshot,
    workerName: item.workerName,
  });
  const canDecide =
    canEdit &&
    (item.itemStatus === 'pending_interview' || item.itemStatus === 'in_review');
  const canEditFicha = canDecide;
  const canRegister = canEdit && item.itemStatus === 'approved' && !item.createdResourceId;
  const canArchiveNoHire = canRegister;
  const canShowAssigned = item.itemStatus === 'assigned';
  const badge = fichaBadge(
    dirty
      ? deriveComplementaryStatusFromData(draft, item.complementaryStatus, item.complementaryMissingFields)
      : resolveItemFichaStatus(item),
  );
  const identity = item.workerSnapshot.identity ?? {};
  const fields = item.workerSnapshot.fields ?? {};
  const fieldLabels = item.workerSnapshot.meta?.fieldLabels ?? {};

  useEffect(() => {
    if (item.itemStatus === 'pending_interview' && canEdit) {
      void inboundWorkerHandoffService.markPresentationInReview(item.id);
    }
  }, [item.id, item.itemStatus, canEdit]);

  const handleDraftChange = (next: WorkerSnapshotComplementary) => {
    setDirty(true);
    setSavedMsg(null);
    setDraft(next);
  };

  const handleSave = async () => {
    if (!canEditFicha) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const result = await inboundWorkerHandoffService.savePresentationComplementary(item.id, draft);
      if (!result) throw new Error('No se pudo guardar la ficha');
      setDirty(false);
      setSavedMsg('Cambios guardados');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!canDecide) return;
    setDeciding(true);
    setError(null);
    try {
      const saved = await inboundWorkerHandoffService.savePresentationComplementary(item.id, draft);
      if (!saved) throw new Error('No se pudo guardar la ficha antes de aprobar');
      setDirty(false);
      const result = await inboundWorkerHandoffService.approvePresentation(
        item.id,
        currentUserName,
      );
      if (!result) throw new Error('No se pudo aprobar');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aprobar');
    } finally {
      setDeciding(false);
    }
  };

  const handleReject = async () => {
    if (!canDecide) return;
    if (!rejectReason.trim()) {
      setError('Indica el motivo del rechazo');
      return;
    }
    setDeciding(true);
    setError(null);
    try {
      if (dirty) {
        await inboundWorkerHandoffService.savePresentationComplementary(item.id, draft);
        setDirty(false);
      }
      const result = await inboundWorkerHandoffService.rejectPresentation(
        item.id,
        rejectReason,
        currentUserName,
      );
      if (!result) throw new Error('No se pudo rechazar');
      setRejectOpen(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al rechazar');
    } finally {
      setDeciding(false);
    }
  };

  const handleArchiveNoHire = async () => {
    if (!canArchiveNoHire) return;
    if (!archiveReason.trim()) {
      setError('Indica el motivo del archivo');
      return;
    }
    setDeciding(true);
    setError(null);
    try {
      const result = await inboundWorkerHandoffService.archivePresentationWithoutHire(
        item.id,
        archiveReason,
        currentUserName,
      );
      if (!result) throw new Error('No se pudo archivar');
      setArchiveOpen(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al archivar');
    } finally {
      setDeciding(false);
    }
  };

  const fieldEntries = useMemo(() => {
    const keys =
      item.workerSnapshot.meta?.includedFieldKeys ??
      Object.keys(fields).filter(
        (k) => fields[k] !== null && fields[k] !== undefined && fields[k] !== '',
      );
    return keys.map((key) => ({
      label: fieldLabels[key] ?? key,
      value: fields[key],
    }));
  }, [fields, fieldLabels, item.workerSnapshot.meta?.includedFieldKeys]);

  const bottomPad = canDecide ? 'pb-[calc(7.5rem+env(safe-area-inset-bottom))]' : 'pb-8';

  return (
    <div className={`mx-auto w-full max-w-3xl space-y-3 px-3 pt-3 sm:space-y-4 sm:px-4 sm:pt-4 md:px-6 md:pt-6 ${bottomPad}`}>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-[44px] items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft size={16} />
        Volver
      </button>

      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-slate-500">
              <User size={16} className="shrink-0" />
              <span className="text-[11px] uppercase tracking-wide">Presentación ATS</span>
            </div>
            <h1 className="break-words text-lg font-bold leading-snug text-slate-900 sm:text-xl">
              {displayName}
            </h1>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Recibido {formatDateTime(item.packageReceivedAt ?? item.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[item.itemStatus] ?? 'bg-slate-100 text-slate-700'}`}
            >
              {STATUS_LABELS[item.itemStatus] ?? item.itemStatus}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
          </div>
        </div>

        {canEditFicha && (
          <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-800 sm:text-sm">
            Puedes editar la ficha complementaria y guardar antes de aprobar o rechazar.
            {dirty ? ' Hay cambios sin guardar.' : ''}
          </p>
        )}

        {(item.complementaryMissingFields?.length ?? 0) > 0 && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Faltantes: {item.complementaryMissingFields!.join(', ')}
          </p>
        )}

        {item.itemStatus === 'rejected' && item.decisionReason && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Motivo: {item.decisionReason}
          </p>
        )}
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {savedMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {savedMsg}
        </div>
      )}

      <CollapsibleSection title="Identidad ATS" defaultOpen={false}>
        <ReadonlyGrid
          entries={[
            { label: 'Nombres', value: identity.nombres },
            { label: 'Apellido paterno', value: identity.apellidoPaterno },
            { label: 'Apellido materno', value: identity.apellidoMaterno },
            { label: 'Nombre completo', value: identity.fullName },
            { label: 'DNI', value: identity.dni },
            { label: 'Correo', value: identity.email },
            { label: 'Teléfono', value: identity.phone },
            { label: 'Teléfono 2', value: identity.phone2 },
          ]}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Datos del proceso"
        defaultOpen={false}
        badge={`${fieldEntries.length} campos`}
      >
        <ReadonlyGrid entries={fieldEntries} />
      </CollapsibleSection>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Ficha complementaria</h2>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              {canEditFicha
                ? 'Editable hasta aprobar o rechazar'
                : 'Solo lectura (ya decidida)'}
            </p>
          </div>
          {canEditFicha && (
            <button
              type="button"
              disabled={saving || !dirty}
              onClick={() => void handleSave()}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 sm:w-auto"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Guardar avances
            </button>
          )}
        </div>

        <ComplementaryFichaForm
          value={draft}
          disabled={!canEditFicha}
          onChange={handleDraftChange}
        />
      </section>

      {canDecide && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 pt-3 backdrop-blur supports-[backdrop-filter]:bg-white/90 md:static md:mt-2 md:rounded-2xl md:border md:bg-white md:p-4 md:shadow-sm"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {!rejectOpen ? (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:flex-row">
              {dirty && (
                <button
                  type="button"
                  disabled={saving || deciding}
                  onClick={() => void handleSave()}
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:flex-none"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Guardar
                </button>
              )}
              <button
                type="button"
                disabled={deciding || saving}
                onClick={() => void handleApprove()}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {deciding ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                Aprobar
              </button>
              <button
                type="button"
                disabled={deciding || saving}
                onClick={() => setRejectOpen(true)}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle size={16} />
                Rechazar
              </button>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-2">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-slate-700">Motivo del rechazo</span>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base"
                  placeholder="Describe el motivo..."
                />
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={deciding}
                  onClick={() => void handleReject()}
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deciding ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                  Confirmar rechazo
                </button>
                <button
                  type="button"
                  disabled={deciding}
                  onClick={() => setRejectOpen(false)}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {canRegister && item.itemStatus === 'approved' && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
          <p className="text-sm leading-relaxed text-indigo-900">
            Aprobado no implica ingreso. La fecha de ingreso es al <strong>registrar en unidad</strong>.
            Si no iniciará labores, archívalo (sin contrato / sin haber trabajado).
          </p>
          {!archiveOpen ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => onRegister(item)}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <UserPlus size={16} />
                Registrar en unidad
              </button>
              <button
                type="button"
                onClick={() => setArchiveOpen(true)}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Archive size={16} />
                Archivar sin ingreso
              </button>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-slate-700">
                  Motivo del archivo (no inició labores)
                </span>
                <textarea
                  value={archiveReason}
                  onChange={(e) => setArchiveReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base"
                  placeholder="Ej. no aceptó condiciones, no se presentó, cliente canceló, etc."
                />
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={deciding}
                  onClick={() => void handleArchiveNoHire()}
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                >
                  {deciding ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
                  Confirmar archivo
                </button>
                <button
                  type="button"
                  disabled={deciding}
                  onClick={() => setArchiveOpen(false)}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {canShowAssigned && (
        <p className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          Ya registrado en unidad
          {item.assignedWorkUnitId
            ? `: ${units.find((u) => u.id === item.assignedWorkUnitId)?.name ?? item.assignedWorkUnitId}`
            : ''}
          . Opalosis se gestiona desde Envío Opalosis.
        </p>
      )}

      {item.itemStatus === 'archived_no_hire' && (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Archivado sin ingreso
          {item.decisionReason ? `: ${item.decisionReason}` : ''}. No generó contrato ni recurso
          operativo.
        </p>
      )}
    </div>
  );
}

export const AtsPresentations: React.FC<AtsPresentationsProps> = ({
  canEdit,
  units,
  currentUserName,
  onRegistered,
}) => {
  const [filter, setFilter] = useState<PresentationFilter>('pending');
  const [items, setItems] = useState<InboundHandoffItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<InboundHandoffItem | null>(null);
  const [registerItem, setRegisterItem] = useState<InboundHandoffItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await inboundWorkerHandoffService.listPresentationItems({ filter });
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar presentaciones');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadDetail = useCallback(async (itemId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const data = await inboundWorkerHandoffService.getItemById(itemId);
      setSelected(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el detalle');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setSelected(null);
  }, [selectedId, loadDetail]);

  if (selectedId) {
    return (
      <>
        {detailLoading || !selected ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="mr-2 animate-spin" size={20} />
            Cargando presentación...
          </div>
        ) : (
          <PresentationDetail
            item={selected}
            canEdit={canEdit}
            units={units}
            currentUserName={currentUserName}
            onBack={() => {
              setSelectedId(null);
              void loadItems();
            }}
            onChanged={async () => {
              await loadDetail(selectedId);
              await loadItems();
            }}
            onRegister={(item) => setRegisterItem(item)}
          />
        )}

        {registerItem && (
          <RegisterHandoffWorkerModal
            item={registerItem}
            units={units}
            sourcePackageId={registerItem.sourcePackageId}
            sourceApp={registerItem.sourceApp}
            onClose={() => setRegisterItem(null)}
            onSuccess={() => {
              setRegisterItem(null);
              void loadDetail(selectedId);
              void loadItems();
              onRegistered?.();
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 md:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-slate-500">
            <ClipboardList size={18} className="shrink-0" />
            <span className="text-[11px] uppercase tracking-wide">ATS → OpsFlow</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Presentaciones ATS</h1>
          <p className="mt-1 text-sm text-slate-500">
            Revisa y edita la ficha, luego aprueba o rechaza. Opalosis solo tras registro.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadItems()}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      <div className="-mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setFilter(entry.id)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
              filter === entry.id
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="mr-2 animate-spin" size={20} />
          Cargando...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center text-slate-500">
          No hay presentaciones en este filtro.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const badge = fichaBadge(resolveItemFichaStatus(item));
            const name = resolveHandoffDisplayName({
              snapshot: item.workerSnapshot,
              workerName: item.workerName,
            });
            const complementary = resolveItemComplementary(item);
            const puesto =
              complementary.puestoContrato ||
              item.workerSnapshot.fields?.puestoContrato ||
              item.workerSnapshot.fields?.processTitle;

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className="flex w-full min-h-[72px] items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm hover:border-slate-300 hover:bg-slate-50 sm:p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{name}</p>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {formatValue(puesto)}
                      {item.workerSnapshot.identity?.dni
                        ? ` · DNI ${item.workerSnapshot.identity.dni}`
                        : ''}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(item.packageReceivedAt ?? item.createdAt)}
                    </p>
                  </div>
                  <div className="flex max-w-[40%] shrink-0 flex-col items-end gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[item.itemStatus] ?? 'bg-slate-100 text-slate-700'}`}
                    >
                      {STATUS_LABELS[item.itemStatus] ?? item.itemStatus}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-center text-[11px] font-medium leading-tight ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
