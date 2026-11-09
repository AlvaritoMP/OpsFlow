import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { hrOutboundCeseService } from '../services/hrOutboundCeseService';
import type { HrOutboundCese, HrOutboundCeseSyncStatus } from '../types';

const STATUS_LABEL: Record<HrOutboundCeseSyncStatus, string> = {
  pendiente: 'Pendiente de envío',
  error_tecnico: 'Error de conexión',
  rechazo_negocio: 'Rechazado por Opalosis',
  enviado: 'En bandeja de RRHH',
  rechazado_rrhh: 'Rechazado por RRHH',
  procesado: 'Cesado en Opalosis',
};

const STATUS_CLASS: Record<HrOutboundCeseSyncStatus, string> = {
  pendiente: 'bg-amber-50 text-amber-800 border-amber-200',
  error_tecnico: 'bg-amber-50 text-amber-800 border-amber-200',
  rechazo_negocio: 'bg-red-50 text-red-800 border-red-200',
  enviado: 'bg-blue-50 text-blue-800 border-blue-200',
  rechazado_rrhh: 'bg-red-50 text-red-800 border-red-200',
  procesado: 'bg-green-50 text-green-800 border-green-200',
};

function canRetry(status: HrOutboundCeseSyncStatus): boolean {
  return status === 'pendiente' || status === 'error_tecnico' || status === 'rechazo_negocio' || status === 'rechazado_rrhh';
}

function canRefresh(status: HrOutboundCeseSyncStatus): boolean {
  return status === 'enviado' || status === 'rechazado_rrhh' || status === 'procesado';
}

export const HrOpalosisCeseStatus: React.FC<{ resourceId: string }> = ({ resourceId }) => {
  const [row, setRow] = useState<HrOutboundCese | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    try {
      const latest = await hrOutboundCeseService.latestForResource(resourceId);
      setRow(latest);
    } catch (error) {
      console.error('No se pudo leer el cese de Opalosis:', error);
      setRow(null);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    setLoaded(false);
    void load();
  }, [resourceId]);

  if (!loaded || !row) return null;

  const run = async (action: 'retry' | 'refresh') => {
    setBusy(true);
    setNote(null);
    try {
      const result =
        action === 'retry'
          ? await hrOutboundCeseService.retry(row.id)
          : await hrOutboundCeseService.refreshStatus(row.id);
      if (result.cese) setRow(result.cese);
      setNote(result.userMessage);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo actualizar el envío a Opalosis.');
    } finally {
      setBusy(false);
    }
  };

  const stage = [row.opalosisEstado, row.opalosisEtapa].filter(Boolean).join(' · ');

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${STATUS_CLASS[row.syncStatus]}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            Opalosis: {STATUS_LABEL[row.syncStatus]}
            {row.ceseCod ? ` · ${row.ceseCod}` : ''}
          </p>
          {stage && <p className="mt-0.5 opacity-80">{stage}</p>}
          {row.mensaje && row.syncStatus !== 'enviado' && row.syncStatus !== 'procesado' && (
            <p className="mt-0.5 opacity-90">{row.mensaje}</p>
          )}
          {note && <p className="mt-1 font-medium">{note}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          {canRefresh(row.syncStatus) && (
            <button
              type="button"
              onClick={() => void run('refresh')}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-current/20 bg-white/70 px-2 py-1 font-medium hover:bg-white disabled:opacity-50"
            >
              <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
              Actualizar estado
            </button>
          )}
          {canRetry(row.syncStatus) && (
            <button
              type="button"
              onClick={() => void run('retry')}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-current/20 bg-white/70 px-2 py-1 font-medium hover:bg-white disabled:opacity-50"
            >
              Reintentar envío
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
