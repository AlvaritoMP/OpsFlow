import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Inbox,
  Loader2,
  Package,
  RefreshCw,
  RotateCcw,
  User,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { inboundWorkerHandoffService } from '../services/inboundWorkerHandoffService';
import { RegisterHandoffWorkerModal } from './RegisterHandoffWorkerModal';
import {
  InboundHandoffItem,
  InboundHandoffItemStatus,
  InboundHandoffPackage,
  InboundHandoffPackageStatus,
  InboundHandoffPackageWithItems,
  Unit,
  WorkerSnapshot,
} from '../types';

interface InboundWorkerHandoffProps {
  canEdit: boolean;
  units: Unit[];
  onRegistered?: () => void;
}

/** Estados activos del flujo nuevo. Los legacy se mantienen solo para datos históricos. */
const PACKAGE_STATUS_LABELS: Record<InboundHandoffPackageStatus, string> = {
  received: 'Recibido',
  processing: 'En proceso',
  completed: 'Completado',
  rejected: 'Rechazado (legacy)',
  partially_completed: 'Parcial (legacy)',
};

const PACKAGE_STATUS_STYLES: Record<InboundHandoffPackageStatus, string> = {
  received: 'bg-blue-100 text-blue-800',
  processing: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  partially_completed: 'bg-purple-100 text-purple-800',
};

const CLOSED_PACKAGE_STATUSES: InboundHandoffPackageStatus[] = [
  'completed',
  'rejected',
  'partially_completed',
];

function isPackageClosed(status: InboundHandoffPackageStatus): boolean {
  return CLOSED_PACKAGE_STATUSES.includes(status);
}

function isItemUnresolved(status: InboundHandoffItemStatus): boolean {
  return status === 'pending' || status === 'accepted';
}

function CopyableId({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback para entornos sin clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copiar ${label}`}
      className={`inline-flex max-w-full items-center gap-1.5 rounded border border-transparent px-1.5 py-0.5 text-left font-mono text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50 ${className}`}
    >
      <span className="min-w-0 break-all">{value}</span>
      <Copy size={12} className="shrink-0 text-slate-400" />
      {copied && <span className="shrink-0 text-[10px] font-sans text-green-600">Copiado</span>}
    </button>
  );
}

const ITEM_STATUS_LABELS: Record<InboundHandoffItemStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  assigned: 'Asignado',
};

const ITEM_STATUS_STYLES: Record<InboundHandoffItemStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  accepted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  assigned: 'bg-indigo-100 text-indigo-800',
};

const IDENTITY_LABELS: Record<string, string> = {
  fullName: 'Nombre completo',
  dni: 'DNI',
  email: 'Correo',
  phone: 'Teléfono',
  phone2: 'Teléfono 2',
};

const FIELD_LABELS: Record<string, string> = {
  address: 'Dirección',
  province: 'Provincia',
  district: 'Distrito',
  age: 'Edad',
  linkedinUrl: 'LinkedIn',
  source: 'Fuente',
  agreedSalary: 'Sueldo acordado',
  agreedSalaryInWords: 'Sueldo en letras',
  hireDate: 'Fecha de ingreso',
  salaryExpectation: 'Expectativa salarial',
  offerAcceptedDate: 'Fecha aceptación oferta',
  applicationStartedDate: 'Inicio postulación',
  applicationCompletedDate: 'Fin postulación',
  processTitle: 'Proceso',
  serviceOrderCode: 'Código OS',
  clientName: 'Cliente',
  processDescription: 'Descripción del proceso',
  stageName: 'Etapa',
  psycholaboralSuitability: 'Idoneidad psicolaboral',
  scoreIa: 'Score IA',
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

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}

function SnapshotDetails({ snapshot }: { snapshot: WorkerSnapshot }) {
  const identityEntries = Object.entries(snapshot.identity ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== '',
  );
  const fieldKeys =
    snapshot.meta?.includedFieldKeys ??
    Object.keys(snapshot.fields ?? {}).filter(
      (key) =>
        snapshot.fields?.[key] !== null &&
        snapshot.fields?.[key] !== undefined &&
        snapshot.fields?.[key] !== '',
    );
  const fieldEntries = fieldKeys
    .map((key) => [key, snapshot.fields?.[key]] as const)
    .filter(([, value]) => value !== null && value !== undefined && value !== '');

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
      {identityEntries.length > 0 && (
        <div>
          <h4 className="mb-2 font-semibold text-slate-700">Identidad</h4>
          <dl className="grid gap-2 sm:grid-cols-2">
            {identityEntries.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  {IDENTITY_LABELS[key] ?? key}
                </dt>
                <dd className="text-slate-800">{formatFieldValue(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {fieldEntries.length > 0 && (
        <div>
          <h4 className="mb-2 font-semibold text-slate-700">Datos del ATS</h4>
          <dl className="grid gap-2 sm:grid-cols-2">
            {fieldEntries.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  {FIELD_LABELS[key] ?? key}
                </dt>
                <dd className="text-slate-800">{formatFieldValue(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {identityEntries.length === 0 && fieldEntries.length === 0 && (
        <p className="text-slate-500">Sin datos adicionales en el snapshot.</p>
      )}
    </div>
  );
}

function ItemRow({
  item,
  canEdit,
  units,
  onStatusChange,
  onRegister,
}: {
  item: InboundHandoffItem;
  canEdit: boolean;
  units: Unit[];
  onStatusChange: (itemId: string, status: InboundHandoffItemStatus) => Promise<void>;
  onRegister: (item: InboundHandoffItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const assignedUnit = units.find((u) => u.id === item.assignedWorkUnitId);

  const handleStatus = async (status: InboundHandoffItemStatus) => {
    setUpdating(true);
    try {
      await onStatusChange(item.id, status);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex min-w-0 items-center gap-3">
          {expanded ? (
            <ChevronDown size={18} className="shrink-0 text-slate-400" />
          ) : (
            <ChevronRight size={18} className="shrink-0 text-slate-400" />
          )}
          <User size={18} className="shrink-0 text-slate-500" />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{item.workerName}</p>
            {item.itemStatus === 'assigned' && assignedUnit && (
              <p className="truncate text-xs text-indigo-600">
                Registrado en: {assignedUnit.name}
              </p>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${ITEM_STATUS_STYLES[item.itemStatus]}`}
        >
          {ITEM_STATUS_LABELS[item.itemStatus]}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-4 pb-4">
          {item.sourceCandidateId && (
            <div className="mt-3 flex flex-wrap items-center gap-1 text-sm text-slate-500">
              <span>Candidato ATS:</span>
              <CopyableId label="Candidato ATS" value={item.sourceCandidateId} />
            </div>
          )}
          <SnapshotDetails snapshot={item.workerSnapshot} />

          {canEdit && item.itemStatus === 'accepted' && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => onRegister(item)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <UserPlus size={16} />
                Registrar en unidad
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Se abrirá un formulario con los datos del ATS pre-completados. Solo completa lo que falte.
              </p>
            </div>
          )}

          {canEdit && item.itemStatus !== 'assigned' && item.itemStatus !== 'accepted' && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={updating || item.itemStatus === 'accepted'}
                onClick={() => handleStatus('accepted')}
                className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle size={14} />
                Aceptar
              </button>
              <button
                type="button"
                disabled={updating || item.itemStatus === 'rejected'}
                onClick={() => handleStatus('rejected')}
                className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle size={14} />
                Rechazar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const InboundWorkerHandoff: React.FC<InboundWorkerHandoffProps> = ({
  canEdit,
  units,
  onRegistered,
}) => {
  const [packages, setPackages] = useState<InboundHandoffPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<InboundHandoffPackageWithItems | null>(
    null,
  );
  const [registerItem, setRegisterItem] = useState<InboundHandoffItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<InboundHandoffPackageStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [receiverNote, setReceiverNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadPackages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await inboundWorkerHandoffService.listPackages(
        statusFilter === 'all' ? undefined : { status: statusFilter },
      );
      setPackages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar paquetes');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadPackageDetail = useCallback(async (packageId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const data = await inboundWorkerHandoffService.getPackageWithItems(packageId);
      setSelectedPackage(data);
      setReceiverNote(data?.receiverNote ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el paquete');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  const openPackage = async (pkg: InboundHandoffPackage) => {
    await loadPackageDetail(pkg.id);
  };

  const handleOpenForProcessing = async () => {
    if (!selectedPackage || !canEdit) return;
    setActionLoading(true);
    setError(null);
    try {
      await inboundWorkerHandoffService.markProcessing(selectedPackage.id);
      await loadPackageDetail(selectedPackage.id);
      await loadPackages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al abrir el paquete');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenPackage = async () => {
    if (!selectedPackage || !canEdit) return;
    setActionLoading(true);
    setError(null);
    try {
      await inboundWorkerHandoffService.markReopened(selectedPackage.id);
      await loadPackageDetail(selectedPackage.id);
      await loadPackages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reabrir el paquete');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClosePackage = async () => {
    if (!selectedPackage || !canEdit) return;

    const unresolved = selectedPackage.items.filter((item) => isItemUnresolved(item.itemStatus));
    if (unresolved.length > 0) {
      setError(
        `No se puede completar: quedan ${unresolved.length} candidato(s) pendiente(s) o aceptado(s) sin registrar. Resuélvelos (aceptar+registrar o rechazar) antes de cerrar.`,
      );
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      await inboundWorkerHandoffService.markCompleted(selectedPackage.id, receiverNote);
      await loadPackageDetail(selectedPackage.id);
      await loadPackages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cerrar el paquete');
    } finally {
      setActionLoading(false);
    }
  };

  const handleItemStatusChange = async (itemId: string, status: InboundHandoffItemStatus) => {
    if (!selectedPackage || !canEdit) return;
    await inboundWorkerHandoffService.updateItemStatus(itemId, status);
    await loadPackageDetail(selectedPackage.id);
  };

  if (selectedPackage) {
    const canProcessItems = canEdit && selectedPackage.status === 'processing';
    const canClose = canProcessItems;
    const canReopen = canEdit && isPackageClosed(selectedPackage.status);
    const unresolvedCount = selectedPackage.items.filter((item) =>
      isItemUnresolved(item.itemStatus),
    ).length;

    return (
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <button
          type="button"
          onClick={() => setSelectedPackage(null)}
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Volver a la bandeja
        </button>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {detailLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="mr-2 animate-spin" size={20} />
            Cargando paquete...
          </div>
        ) : (
          <>
            <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Package size={20} className="text-blue-600" />
                    <h1 className="text-xl font-bold text-slate-900">Detalle del envío ATS</h1>
                  </div>
                  <div className="space-y-1 text-sm text-slate-500">
                    <div className="flex flex-wrap items-center gap-1">
                      <span>Ref. ATS:</span>
                      <CopyableId label="Ref. ATS" value={selectedPackage.sourcePackageId} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span>ID OpsFlow:</span>
                      <CopyableId label="ID OpsFlow" value={selectedPackage.id} />
                    </div>
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${PACKAGE_STATUS_STYLES[selectedPackage.status]}`}
                >
                  {PACKAGE_STATUS_LABELS[selectedPackage.status]}
                </span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Recibido en OpsFlow</p>
                  <p className="text-sm text-slate-800">{formatDateTime(selectedPackage.receivedAt)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Enviado desde ATS</p>
                  <p className="text-sm text-slate-800">{formatDateTime(selectedPackage.sourceSentAt)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Enviado por</p>
                  <p className="text-sm text-slate-800">
                    {selectedPackage.sourceCreatedByName || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Trabajadores</p>
                  <p className="text-sm text-slate-800">{selectedPackage.workerCount}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Nota del ATS</p>
                  <p className="text-sm text-slate-800">{selectedPackage.senderNote || '—'}</p>
                </div>
              </div>

              {canEdit && selectedPackage.status === 'received' && (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleOpenForProcessing}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Inbox size={16} />}
                    Abrir para procesar
                  </button>
                  <p className="w-full text-xs text-slate-500">
                    Abrir el paquete no acepta candidatos. Cada trabajador se acepta o rechaza por separado.
                  </p>
                </div>
              )}

              {canReopen && (
                <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                  {unresolvedCount > 0 && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Hay {unresolvedCount} candidato(s) pendiente(s) o aceptado(s) sin registrar.
                      Reabre el paquete para continuar.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleReopenPackage}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {actionLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <RotateCcw size={16} />
                    )}
                    Reabrir paquete
                  </button>
                </div>
              )}

              {canClose && (
                <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                  <label className="block text-sm font-medium text-slate-700">
                    Nota del receptor (opcional)
                  </label>
                  <textarea
                    value={receiverNote}
                    onChange={(e) => setReceiverNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Observaciones internas de OpsFlow..."
                  />
                  {unresolvedCount > 0 && (
                    <p className="text-xs text-amber-700">
                      Quedan {unresolvedCount} candidato(s) sin resolver. Debes aceptarlos y
                      registrarlos, o rechazarlos, antes de marcar el paquete como completado.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={actionLoading || unresolvedCount > 0}
                    onClick={handleClosePackage}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Marcar como completado
                  </button>
                </div>
              )}

              {selectedPackage.receiverNote && !canClose && (
                <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <span className="font-medium">Nota del receptor:</span> {selectedPackage.receiverNote}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                Trabajadores ({selectedPackage.items.length})
              </h2>
              {selectedPackage.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  units={units}
                  canEdit={canProcessItems}
                  onStatusChange={handleItemStatusChange}
                  onRegister={setRegisterItem}
                />
              ))}
            </div>

            {registerItem && selectedPackage && (
              <RegisterHandoffWorkerModal
                item={registerItem}
                units={units}
                sourcePackageId={selectedPackage.sourcePackageId}
                sourceApp={selectedPackage.sourceApp}
                onClose={() => setRegisterItem(null)}
                onSuccess={async () => {
                  if (selectedPackage) {
                    await loadPackageDetail(selectedPackage.id);
                  }
                  onRegistered?.();
                }}
              />
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Inbox size={22} className="text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">Recepción ATS</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Paquetes de trabajadores enviados manualmente desde Opalo ATS
          </p>
        </div>
        <button
          type="button"
          onClick={loadPackages}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['all', 'received', 'processing', 'completed', 'partially_completed', 'rejected'] as const).map(
          (status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {status === 'all' ? 'Todos' : PACKAGE_STATUS_LABELS[status]}
            </button>
          ),
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="mr-2 animate-spin" size={20} />
          Cargando bandeja...
        </div>
      ) : packages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <Inbox size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-600">No hay paquetes en esta bandeja.</p>
          <p className="mt-1 text-sm text-slate-400">
            Los envíos desde Opalo ATS aparecerán aquí tras la ingesta por API.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Recibido</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Enviado ATS</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Trabajadores</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Enviado por</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Nota ATS</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Estado</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Ref. ATS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {packages.map((pkg) => (
                  <tr
                    key={pkg.id}
                    onClick={() => openPackage(pkg)}
                    className="cursor-pointer hover:bg-blue-50/50"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} className="text-slate-400" />
                        {formatDateTime(pkg.receivedAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {formatDateTime(pkg.sourceSentAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{pkg.workerCount}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {pkg.sourceCreatedByName || '—'}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-600">
                      {pkg.senderNote || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${PACKAGE_STATUS_STYLES[pkg.status]}`}
                      >
                        {PACKAGE_STATUS_LABELS[pkg.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <CopyableId label="Ref. ATS" value={pkg.sourcePackageId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
