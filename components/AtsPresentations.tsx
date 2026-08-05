import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle,
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
import { resolveHandoffDisplayName } from '../utils/handoffNameParts';
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

type PresentationFilter = 'pending' | 'approved' | 'rejected' | 'all';

const FILTERS: { id: PresentationFilter; label: string }[] = [
  { id: 'pending', label: 'Pendientes' },
  { id: 'approved', label: 'Aprobados' },
  { id: 'rejected', label: 'Rechazados' },
  { id: 'all', label: 'Todos' },
];

const STATUS_LABELS: Partial<Record<InboundHandoffItemStatus, string>> = {
  pending_interview: 'Pendiente',
  in_review: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  assigned: 'Registrado',
};

const STATUS_STYLES: Partial<Record<InboundHandoffItemStatus, string>> = {
  pending_interview: 'bg-slate-100 text-slate-700',
  in_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  assigned: 'bg-indigo-100 text-indigo-800',
};

const FICHA_BADGE: Record<ComplementaryStatus, { label: string; className: string }> = {
  complete: { label: 'Ficha completa', className: 'bg-emerald-100 text-emerald-800' },
  incomplete: { label: 'Ficha incompleta', className: 'bg-amber-100 text-amber-800' },
  missing: { label: 'Sin ficha', className: 'bg-slate-200 text-slate-700' },
};

const EDITABLE_SCALAR_FIELDS: { key: keyof WorkerSnapshotComplementary; label: string }[] = [
  { key: 'nombres', label: 'Nombres' },
  { key: 'apellidoPaterno', label: 'Apellido paterno' },
  { key: 'apellidoMaterno', label: 'Apellido materno' },
  { key: 'fechaNacimiento', label: 'Fecha de nacimiento' },
  { key: 'tipoDocumento', label: 'Tipo documento' },
  { key: 'nroDocumento', label: 'N° documento' },
  { key: 'nacionalidad', label: 'Nacionalidad' },
  { key: 'edad', label: 'Edad' },
  { key: 'sexo', label: 'Sexo' },
  { key: 'estadoCivil', label: 'Estado civil' },
  { key: 'email', label: 'Correo' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'distrito', label: 'Distrito' },
  { key: 'provincia', label: 'Provincia' },
  { key: 'departamento', label: 'Departamento' },
  { key: 'tallaCamisa', label: 'Talla camisa' },
  { key: 'tallaPantalon', label: 'Talla pantalón' },
  { key: 'tallaCalzado', label: 'Talla calzado' },
  { key: 'emergenciaTelefono', label: 'Tel. emergencia' },
  { key: 'emergenciaParentesco', label: 'Parentesco emergencia' },
  { key: 'unidadDestaque', label: 'Unidad destaque' },
  { key: 'puestoContrato', label: 'Puesto contrato' },
  { key: 'bancoSueldo', label: 'Banco sueldo' },
  { key: 'bancoCts', label: 'Banco CTS' },
  { key: 'sistemaPensionesAnterior', label: 'Pensiones anterior' },
  { key: 'sistemaPensionesDeseado', label: 'Pensiones deseado' },
  { key: 'nombreFamiliarOpalo', label: 'Familiar en Opalo' },
];

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

function ReadonlySection({
  title,
  entries,
}: {
  title: string;
  entries: { label: string; value: unknown }[];
}) {
  const visible = entries.filter(
    (e) => e.value !== null && e.value !== undefined && e.value !== '',
  );
  if (visible.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
      <dl className="grid gap-3 sm:grid-cols-2">
        {visible.map((entry) => (
          <div key={entry.label}>
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">{entry.label}</dt>
            <dd className="text-sm text-slate-900">{formatValue(entry.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
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
  const [draft, setDraft] = useState<WorkerSnapshotComplementary>(
    () => ({ ...(item.complementary ?? item.workerSnapshot.complementary ?? {}) }),
  );
  const [saving, setSaving] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraft({ ...(item.complementary ?? item.workerSnapshot.complementary ?? {}) });
  }, [item.id, item.updatedAt, item.complementary, item.workerSnapshot.complementary]);

  const displayName = resolveHandoffDisplayName({
    snapshot: item.workerSnapshot,
    workerName: item.workerName,
  });
  const canDecide =
    canEdit &&
    (item.itemStatus === 'pending_interview' || item.itemStatus === 'in_review');
  const canEditFicha = canDecide;
  const canRegister =
    canEdit && (item.itemStatus === 'approved' || item.itemStatus === 'assigned');
  const badge = fichaBadge(item.complementaryStatus);
  const identity = item.workerSnapshot.identity ?? {};
  const fields = item.workerSnapshot.fields ?? {};
  const fieldLabels = item.workerSnapshot.meta?.fieldLabels ?? {};

  useEffect(() => {
    if (item.itemStatus === 'pending_interview' && canEdit) {
      void inboundWorkerHandoffService.markPresentationInReview(item.id);
    }
  }, [item.id, item.itemStatus, canEdit]);

  const setField = (key: keyof WorkerSnapshotComplementary, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!canEditFicha) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const result = await inboundWorkerHandoffService.savePresentationComplementary(item.id, draft);
      if (!result) throw new Error('No se pudo guardar la ficha');
      setSavedMsg('Avances guardados');
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
      // Persistir borrador antes de aprobar
      await inboundWorkerHandoffService.savePresentationComplementary(item.id, draft);
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

  const fieldEntries = useMemo(() => {
    const keys =
      item.workerSnapshot.meta?.includedFieldKeys ??
      Object.keys(fields).filter((k) => fields[k] !== null && fields[k] !== undefined && fields[k] !== '');
    return keys.map((key) => ({
      label: fieldLabels[key] ?? key,
      value: fields[key],
    }));
  }, [fields, fieldLabels, item.workerSnapshot.meta?.includedFieldKeys]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24 md:p-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft size={16} />
        Volver a presentaciones
      </button>

      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-slate-500">
              <User size={18} />
              <span className="text-xs uppercase tracking-wide">Presentación ATS</span>
            </div>
            <h1 className="truncate text-xl font-bold text-slate-900">{displayName}</h1>
            <p className="mt-1 text-sm text-slate-500">
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

        {(item.complementaryMissingFields?.length ?? 0) > 0 && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Faltantes: {item.complementaryMissingFields!.join(', ')}
          </p>
        )}

        {item.itemStatus === 'rejected' && item.decisionReason && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Motivo: {item.decisionReason}
          </p>
        )}
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {savedMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {savedMsg}
        </div>
      )}

      <ReadonlySection
        title="Identidad"
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

      <ReadonlySection title="Datos del proceso" entries={fieldEntries} />

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Ficha complementaria</h3>
          {canEditFicha && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar avances
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {EDITABLE_SCALAR_FIELDS.map(({ key, label }) => (
            <label key={String(key)} className="block text-sm">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
                {label}
              </span>
              <input
                type="text"
                disabled={!canEditFicha}
                value={formatValue(draft[key]) === '—' ? '' : String(draft[key] ?? '')}
                onChange={(e) => setField(key, e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </label>
          ))}
        </div>

        {(draft.familiares?.length ?? 0) > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Familiares
            </h4>
            <ul className="space-y-2 text-sm text-slate-800">
              {draft.familiares!.map((fam, idx) => (
                <li key={idx} className="rounded-lg bg-slate-50 px-3 py-2">
                  {[fam.nombres, fam.apellidoPaterno, fam.apellidoMaterno].filter(Boolean).join(' ')}
                  {fam.parentesco ? ` · ${fam.parentesco}` : ''}
                  {fam.telefono ? ` · ${fam.telefono}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(draft.experienciaLaboral?.length ?? 0) > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Experiencia laboral
            </h4>
            <ul className="space-y-2 text-sm text-slate-800">
              {draft.experienciaLaboral!.map((exp, idx) => (
                <li key={idx} className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-medium">{exp.empresa || '—'}</span>
                  {exp.puesto ? ` · ${exp.puesto}` : ''}
                  {(exp.fechaIngreso || exp.fechaCese) && (
                    <span className="block text-xs text-slate-500">
                      {exp.fechaIngreso || '?'} → {exp.fechaCese || '?'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(draft.educacion?.length ?? 0) > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Educación
            </h4>
            <ul className="space-y-2 text-sm text-slate-800">
              {draft.educacion!.map((edu, idx) => (
                <li key={idx} className="rounded-lg bg-slate-50 px-3 py-2">
                  {[edu.nivel, edu.institucion, edu.grado].filter(Boolean).join(' · ') || '—'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {canDecide && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:static md:rounded-xl md:border md:bg-white md:p-4">
          {!rejectOpen ? (
            <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
              <button
                type="button"
                disabled={deciding}
                onClick={() => void handleApprove()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 sm:flex-none"
              >
                {deciding ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                Aprobar
              </button>
              <button
                type="button"
                disabled={deciding}
                onClick={() => setRejectOpen(true)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 sm:flex-none"
              >
                <XCircle size={16} />
                Rechazar
              </button>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Motivo del rechazo</span>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Describe el motivo..."
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={deciding}
                  onClick={() => void handleReject()}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deciding ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                  Confirmar rechazo
                </button>
                <button
                  type="button"
                  disabled={deciding}
                  onClick={() => setRejectOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {canRegister && item.itemStatus === 'approved' && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <p className="mb-3 text-sm text-indigo-900">
            Aprobado. Al registrar en una unidad se crea el colaborador y se encola el envío a Opalosis.
          </p>
          <button
            type="button"
            onClick={() => onRegister(item)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <UserPlus size={16} />
            Registrar en unidad
          </button>
        </div>
      )}

      {item.itemStatus === 'assigned' && (
        <p className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          Ya registrado en unidad
          {item.assignedWorkUnitId
            ? `: ${units.find((u) => u.id === item.assignedWorkUnitId)?.name ?? item.assignedWorkUnitId}`
            : ''}
          . Opalosis se gestiona desde Envío Opalosis.
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
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-slate-500">
            <ClipboardList size={18} />
            <span className="text-xs uppercase tracking-wide">ATS → OpsFlow</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Presentaciones ATS</h1>
          <p className="mt-1 text-sm text-slate-500">
            Candidatos enviados a entrevista. Aprobar o rechazar aquí; Opalosis solo tras registro.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadItems()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setFilter(entry.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
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
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="mr-2 animate-spin" size={20} />
          Cargando...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center text-slate-500">
          No hay presentaciones en este filtro.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const badge = fichaBadge(item.complementaryStatus);
            const name = resolveHandoffDisplayName({
              snapshot: item.workerSnapshot,
              workerName: item.workerName,
            });
            const puesto =
              item.complementary?.puestoContrato ||
              item.workerSnapshot.fields?.puestoContrato ||
              item.workerSnapshot.fields?.processTitle;

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="min-w-0">
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
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[item.itemStatus] ?? 'bg-slate-100 text-slate-700'}`}
                    >
                      {STATUS_LABELS[item.itemStatus] ?? item.itemStatus}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
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
