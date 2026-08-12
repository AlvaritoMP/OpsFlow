import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardList, Loader2, Save } from 'lucide-react';
import type { Resource, ResourceInboundSourceData, WorkerSnapshotComplementary } from '../types';
import { resourcesService } from '../services/resourcesService';
import { hydrateComplementaryFromSnapshot } from '../utils/complementaryHydrate';
import { ComplementaryFichaForm } from './ComplementaryFichaForm';

interface WorkerComplementaryPanelProps {
  worker: Resource;
  canEdit: boolean;
  onSaved?: (updated: Resource) => void;
}

function resolveComplementary(worker: Resource): WorkerSnapshotComplementary {
  const inbound = worker.inboundSourceData;
  const snapshot = inbound?.workerSnapshot;
  const stored = snapshot?.complementary ?? null;
  return hydrateComplementaryFromSnapshot(snapshot, stored);
}

function buildUpdatedInbound(
  current: ResourceInboundSourceData | undefined,
  complementary: WorkerSnapshotComplementary,
): ResourceInboundSourceData {
  const base: ResourceInboundSourceData = current ?? {
    sourceApp: 'Opalo ATS',
    workerSnapshot: { complementary },
  };
  return {
    ...base,
    workerSnapshot: {
      ...base.workerSnapshot,
      complementary,
      meta: {
        ...base.workerSnapshot?.meta,
        complementaryStatus: 'complete',
        complementaryFilledAt: new Date().toISOString(),
      },
    },
  };
}

export const WorkerComplementaryPanel: React.FC<WorkerComplementaryPanelProps> = ({
  worker,
  canEdit,
  onSaved,
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WorkerSnapshotComplementary>(() => resolveComplementary(worker));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraft(resolveComplementary(worker));
    setDirty(false);
    setSavedMsg(null);
    setError(null);
  }, [worker.id, worker.inboundSourceData]);

  const hasAtsSource = Boolean(worker.inboundSourceData?.workerSnapshot);
  const fieldCount = useMemo(
    () => Object.values(draft).filter((v) => v !== null && v !== undefined && v !== '').length,
    [draft],
  );

  const handleChange = (next: WorkerSnapshotComplementary) => {
    setDraft(next);
    setDirty(true);
    setSavedMsg(null);
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const inboundSourceData = buildUpdatedInbound(worker.inboundSourceData, draft);
      const updated = await resourcesService.update(worker.id, {
        inboundSourceData,
      });
      try {
        const { hrOutboundIngresoService } = await import('../services/hrOutboundIngresoService');
        await hrOutboundIngresoService.refreshPendingQueueFromResource(worker.id);
      } catch (enqueueErr) {
        console.warn('Ficha guardada, pero no se actualizó la cola Opalosis:', enqueueErr);
      }
      setDirty(false);
      setSavedMsg('Ficha guardada. Si está pendiente de Envío Opalosis, la cola se actualizó.');
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la ficha');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-[48px] items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex min-w-0 items-center gap-2">
          <ClipboardList size={16} className="shrink-0 text-slate-500" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">Ficha complementaria</p>
            <p className="text-xs text-slate-500">
              {hasAtsSource
                ? `Datos del trabajador (${fieldCount} campos)`
                : fieldCount > 0
                  ? `Ficha OpsFlow (${fieldCount} campos)`
                  : 'Sin ficha aún — puedes completarla aquí'}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp size={18} className="shrink-0 text-slate-400" />
        ) : (
          <ChevronDown size={18} className="shrink-0 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 px-4 py-4">
          <p className="text-xs leading-relaxed text-slate-500">
            Datos del trabajador (referidos y altas directas suelen completarlos en el landing
            /ficha). Si el colaborador está pendiente de Envío Opalosis, guardar aquí actualiza esa
            cola.
          </p>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {savedMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {savedMsg}
            </div>
          )}

          <ComplementaryFichaForm
            value={draft}
            disabled={!canEdit}
            onChange={handleChange}
            compact
          />

          {canEdit && (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!dirty || saving}
                onClick={() => void handleSave()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Guardar ficha
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
