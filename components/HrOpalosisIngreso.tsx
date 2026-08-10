import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react';
import { hrOutboundIngresoService } from '../services/hrOutboundIngresoService';
import { listHrFieldBlockers, listHrFieldWarnings } from '../utils/hrOpalosisMapper';
import { toOpsflowDate } from '../utils/hrIntegration';
import { HrOpalosisEditQueueItemModal } from './HrOpalosisEditQueueItemModal';
import type {
  HrOutboundIngresoPackage,
  HrOutboundIngresoPackageWithItems,
  HrOutboundIngresoQueueItem,
  Unit,
} from '../types';

interface HrOpalosisIngresoProps {
  canEdit: boolean;
  units: Unit[];
  currentUserName?: string;
}

type ViewTab = 'cola' | 'historial';

const PACKAGE_STATUS_LABELS: Record<HrOutboundIngresoPackage['status'], string> = {
  pendiente: 'Pendiente',
  enviado: 'Enviado',
  simulado: 'Simulado',
  error: 'Error',
  procesado: 'Procesado',
  observado: 'Observado',
  rechazado: 'Rechazado',
  parcialmente_procesado: 'Parcial',
};

const PACKAGE_STATUS_STYLES: Record<HrOutboundIngresoPackage['status'], string> = {
  pendiente: 'bg-slate-100 text-slate-700',
  enviado: 'bg-blue-100 text-blue-800',
  simulado: 'bg-purple-100 text-purple-800',
  error: 'bg-red-100 text-red-900',
  procesado: 'bg-green-100 text-green-800',
  observado: 'bg-orange-100 text-orange-800',
  rechazado: 'bg-red-100 text-red-800',
  parcialmente_procesado: 'bg-amber-100 text-amber-800',
};

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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

function formatReportDate(iso: string): string {
  return toOpsflowDate(iso);
}

export const HrOpalosisIngreso: React.FC<HrOpalosisIngresoProps> = ({
  canEdit,
  units,
  currentUserName,
}) => {
  const [tab, setTab] = useState<ViewTab>('cola');
  const [reportDate, setReportDate] = useState(todayIsoDate());
  const [queueItems, setQueueItems] = useState<HrOutboundIngresoQueueItem[]>([]);
  const [packages, setPackages] = useState<HrOutboundIngresoPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<HrOutboundIngresoPackageWithItems | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [senderNote, setSenderNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [simulatedNotice, setSimulatedNotice] = useState(false);
  const [editingItem, setEditingItem] = useState<HrOutboundIngresoQueueItem | null>(null);
  const [syncing, setSyncing] = useState(false);

  const unitNameById = useMemo(() => {
    const map = new Map<string, string>();
    units.forEach((u) => map.set(u.id, u.name));
    return map;
  }, [units]);

  const loadQueue = useCallback(async () => {
    const items = await hrOutboundIngresoService.listQueueItems({ reportDate });
    setQueueItems(items);
    setSelectedIds(new Set(items.map((i) => i.id)));
  }, [reportDate]);

  const loadPackages = useCallback(async () => {
    const list = await hrOutboundIngresoService.listPackages();
    setPackages(list);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Recuperar presentaciones ya en unidad que no llegaron a la cola (fallos silenciosos previos)
      if (canEdit && units.length > 0) {
        try {
          const sync = await hrOutboundIngresoService.syncMissingFromAssignedPresentations(units);
          if (sync.enqueued > 0) {
            setSuccessMessage(
              `Se encolaron ${sync.enqueued} trabajador(es) pendiente(s) de envío a Opalosis.`,
            );
          }
          if (sync.errors.length > 0) {
            setError(sync.errors.slice(0, 3).join(' | '));
          }
        } catch (syncErr) {
          console.error('syncMissingFromAssignedPresentations:', syncErr);
        }
      }
      await Promise.all([loadQueue(), loadPackages()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [loadQueue, loadPackages, canEdit, units]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === queueItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(queueItems.map((i) => i.id)));
    }
  };

  const handleSendPackage = async () => {
    if (!canEdit || selectedIds.size === 0) return;

    const selected = queueItems.filter((i) => selectedIds.has(i.id));
    const incomplete = selected.filter(
      (i) => !i.hrFields || listHrFieldBlockers(i.hrFields).length > 0,
    );
    if (incomplete.length > 0) {
      setError(
        `${incomplete.length} trabajador(es) tienen datos incompletos. Complete el formulario (cargo, lugar, sueldo, movilidad, URL SharePoint, etc.) antes de enviar.`,
      );
      return;
    }

    setSending(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await hrOutboundIngresoService.sendPackage({
        queueItemIds: Array.from(selectedIds),
        reportDate,
        senderNote: senderNote.trim() || undefined,
        sentByName: currentUserName,
      });

      setSimulatedNotice(result.simulated);
      setSuccessMessage(
        result.simulated
          ? `Paquete simulado (${result.package.workerCount} trabajador(es)). Configure secrets Opalosis para envío real.`
          : result.partial
            ? `Envío parcial: algunos trabajadores fueron rechazados por Opalosis. Revise el detalle.`
            : `Solicitudes registradas en Opalosis (${result.package.workerCount} trabajador(es)).`,
      );
      setSenderNote('');
      await loadData();
      setTab('historial');
      const detail = await hrOutboundIngresoService.getPackageWithItems(result.package.id);
      if (detail) setSelectedPackage(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar paquete');
    } finally {
      setSending(false);
    }
  };

  const handleSyncMissing = async () => {
    if (!canEdit) return;
    setSyncing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await hrOutboundIngresoService.syncMissingFromAssignedPresentations(units);
      const parts = [
        result.enqueued > 0 ? `${result.enqueued} encolado(s)` : null,
        result.skipped > 0 ? `${result.skipped} ya estaban / omitidos` : null,
      ].filter(Boolean);
      setSuccessMessage(
        parts.length
          ? `Sincronización cola Opalosis: ${parts.join(', ')}.`
          : 'Sincronización cola Opalosis: nada pendiente.',
      );
      if (result.errors.length > 0) {
        setError(result.errors.slice(0, 5).join(' | '));
      }
      await loadQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al sincronizar cola');
    } finally {
      setSyncing(false);
    }
  };

  const handleExclude = async (itemId: string) => {
    if (!canEdit) return;
    const note = window.prompt('Motivo de exclusión (opcional):');
    try {
      await hrOutboundIngresoService.excludeQueueItem(itemId, note ?? undefined);
      await loadQueue();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo excluir');
    }
  };

  const openPackageDetail = async (packageId: string) => {
    const detail = await hrOutboundIngresoService.getPackageWithItems(packageId);
    if (detail) setSelectedPackage(detail);
  };

  const handleCheckPackageStatus = async () => {
    if (!selectedPackage) return;
    setCheckingStatus(true);
    setError(null);
    try {
      const result = await hrOutboundIngresoService.checkPackageStatus(selectedPackage.id);
      if (result.simulated) setSimulatedNotice(true);
      await loadPackages();
      const refreshed = await hrOutboundIngresoService.getPackageWithItems(selectedPackage.id);
      if (refreshed) setSelectedPackage(refreshed);
      setSuccessMessage('Estado del paquete actualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al consultar estado');
    } finally {
      setCheckingStatus(false);
    }
  };

  if (selectedPackage) {
    return (
      <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSelectedPackage(null)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-slate-800">Paquete enviado a Opalosis</h2>
            <p className="truncate font-mono text-sm text-slate-500">
              {selectedPackage.sourcePackageId}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${PACKAGE_STATUS_STYLES[selectedPackage.status]}`}
          >
            {PACKAGE_STATUS_LABELS[selectedPackage.status]}
          </span>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-semibold text-slate-800">Resumen</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase text-slate-500">Fecha reporte</dt>
                <dd>{formatReportDate(selectedPackage.reportDate)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Trabajadores</dt>
                <dd>{selectedPackage.workerCount}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Enviado</dt>
                <dd>{formatDateTime(selectedPackage.sentAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Por</dt>
                <dd>{selectedPackage.sentByName ?? '—'}</dd>
              </div>
              {selectedPackage.senderNote && (
                <div>
                  <dt className="text-xs uppercase text-slate-500">Nota</dt>
                  <dd>{selectedPackage.senderNote}</dd>
                </div>
              )}
            </dl>

            {canEdit && ['enviado', 'simulado', 'observado', 'parcialmente_procesado', 'recibido'].includes(
              selectedPackage.status,
            ) && (
              <button
                type="button"
                onClick={handleCheckPackageStatus}
                disabled={checkingStatus}
                className="mt-4 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {checkingStatus ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                Actualizar Estado / Etapa
              </button>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 font-semibold text-slate-800">
              Trabajadores ({selectedPackage.items.length})
            </h3>
            <ul className="max-h-96 space-y-3 overflow-y-auto text-sm">
              {selectedPackage.items.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-slate-800">{item.workerName}</div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        item.itemStatus === 'procesado' || item.itemStatus === 'recibido'
                          ? 'bg-green-100 text-green-800'
                          : item.itemStatus === 'observado'
                            ? 'bg-orange-100 text-orange-800'
                            : item.itemStatus === 'rechazado'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.opalosisEstado ?? item.itemStatus}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-500">{item.refOperaciones}</div>
                  {item.ingresoCod && (
                    <div className="mt-1 text-xs text-emerald-700">
                      {item.ingresoCod}
                      {item.empleadoIdRrhh ? ` (#${item.empleadoIdRrhh})` : ''}
                      {item.opalosisEtapa ? ` · Etapa: ${item.opalosisEtapa}` : ''}
                    </div>
                  )}
                  {item.mensaje && item.itemStatus === 'rechazado' && (
                    <div className="mt-1 text-xs text-red-700">{item.mensaje}</div>
                  )}
                  <div className="mt-1 text-xs text-slate-600">
                    {unitNameById.get(item.workerSnapshot.opsflow.unitId) ??
                      item.workerSnapshot.opsflow.unitName}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-slate-500">
            <Send size={18} className="shrink-0" />
            <span className="text-[11px] uppercase tracking-wide">OpsFlow → Opalosis RRHH</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Envío Opalosis</h1>
          <p className="mt-1 text-sm text-slate-500">
            Trabajadores registrados en unidad hoy (u otra fecha) pendientes de envío a RRHH.
            Completa datos y envía; no se mandan solos al registrar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={handleSyncMissing}
              disabled={syncing || loading}
              className="flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              title="Encola presentaciones ya registradas en unidad que faltan en esta cola"
            >
              {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Sincronizar cola
            </button>
          )}
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {simulatedNotice && (
        <div className="flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 p-4 text-sm text-purple-900">
          <Clock size={18} className="mt-0.5 shrink-0" />
          <div>
            <strong>Modo simulación.</strong> Configure en Supabase{' '}
            <code className="text-xs">OPALOSIS_API_BASE_URL</code>
            {' = '}
            <code className="text-xs">
              https://onyx.opaloperu.com/apiempleadoregistro/api/opsflow
            </code>{' '}
            y <code className="text-xs">OPALOSIS_API_KEY</code>.
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <XCircle size={18} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          {successMessage}
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('cola')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'cola'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Cola pendiente ({queueItems.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('historial')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'historial'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Paquetes enviados ({packages.length})
        </button>
      </div>

      {tab === 'cola' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <label className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700">
                <Calendar size={14} />
                Fecha del reporte
              </label>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="rounded-lg border border-slate-300 p-2 text-sm"
              />
            </div>
            {canEdit && queueItems.length > 0 && (
              <>
                <div className="min-w-[200px] flex-1">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Nota para Opalosis (opcional)
                  </label>
                  <input
                    value={senderNote}
                    onChange={(e) => setSenderNote(e.target.value)}
                    placeholder="Ej. Ingresos del día — Lima Norte"
                    className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSendPackage}
                  disabled={sending || selectedIds.size === 0}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {sending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Enviar {selectedIds.size} a Opalosis
                </button>
              </>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : queueItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center px-4">
              <Package className="mx-auto mb-3 text-slate-400" size={40} />
              <p className="font-medium text-slate-700">Sin ingresos pendientes para esta fecha</p>
              <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                Aquí se listan los registrados en unidad aún no enviados a Opalosis. Si ya
                registró a alguien hoy y no aparece, pulse «Sincronizar cola».
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={handleSyncMissing}
                  disabled={syncing}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Sincronizar cola
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {canEdit && (
                      <th className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === queueItems.length && queueItems.length > 0}
                          onChange={toggleSelectAll}
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Colaborador</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Unidad</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Referencia</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Asignado</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Alertas</th>
                    {canEdit && (
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {queueItems.map((item) => {
                    const warnings = item.hrFields ? listHrFieldWarnings(item.hrFields) : ['Sin datos'];
                    const blockers = item.hrFields ? listHrFieldBlockers(item.hrFields) : ['Sin datos'];
                    return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        {canEdit && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleSelect(item.id)}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{item.workerName}</div>
                          <div className="text-xs text-slate-500">
                            Doc:{' '}
                            {item.hrFields?.documento ||
                              item.workerSnapshot?.opsflow?.dni ||
                              '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {unitNameById.get(item.opsflowUnitId) ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                          {item.refOperaciones}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {formatDateTime(item.assignedAt)}
                        </td>
                        <td className="px-4 py-3">
                          {blockers.length === 0 ? (
                            <span className="text-xs text-green-600">Listo</span>
                          ) : (
                            <span
                              className="text-xs text-amber-600"
                              title={[...blockers, ...warnings].join(', ')}
                            >
                              {blockers.length} faltante(s)
                            </span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3">
                            <div className="flex flex-col items-start gap-1">
                              <button
                                type="button"
                                onClick={() => setEditingItem(item)}
                                className="text-xs font-medium text-blue-600 hover:text-blue-800"
                              >
                                Completar / editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExclude(item.id)}
                                className="text-xs text-red-600 hover:text-red-800"
                              >
                                Excluir
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editingItem && (
        <HrOpalosisEditQueueItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={async () => {
            setEditingItem(null);
            await loadQueue();
            setSuccessMessage('Datos del trabajador actualizados.');
          }}
        />
      )}

      {tab === 'historial' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : packages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center text-slate-500">
              Aún no se han enviado paquetes a Opalosis.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Fecha reporte</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Trabajadores</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Estado</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Enviado</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {packages.map((pkg) => (
                    <tr
                      key={pkg.id}
                      onClick={() => openPackageDetail(pkg.id)}
                      className="cursor-pointer hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">{formatReportDate(pkg.reportDate)}</td>
                      <td className="px-4 py-3">{pkg.workerCount}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PACKAGE_STATUS_STYLES[pkg.status]}`}
                        >
                          {PACKAGE_STATUS_LABELS[pkg.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(pkg.sentAt)}</td>
                      <td className="px-4 py-3 text-slate-500">{pkg.sentByName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
