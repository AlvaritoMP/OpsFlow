import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Loader2, Search, X } from 'lucide-react';
import { Resource } from '../types';
import {
  TransferWorkerResult,
  UnitTransferTarget,
  workerTransferService,
} from '../services/workerTransferService';

interface TransferWorkerModalProps {
  worker: Resource;
  fromUnit: { id: string; name: string; clientName?: string };
  onClose: () => void;
  onTransferred: (result: TransferWorkerResult) => void;
}

export const TransferWorkerModal: React.FC<TransferWorkerModalProps> = ({
  worker,
  fromUnit,
  onClose,
  onTransferred,
}) => {
  const [mode, setMode] = useState<'transfer' | 'swap'>('transfer');
  const [units, setUnits] = useState<UnitTransferTarget[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [unitQuery, setUnitQuery] = useState('');
  const [toUnitId, setToUnitId] = useState('');
  const [swapCandidates, setSwapCandidates] = useState<Resource[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [swappedResourceId, setSwappedResourceId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingUnits(true);
    workerTransferService
      .listDestinationUnits(fromUnit.id)
      .then((list) => {
        if (!cancelled) setUnits(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'No se pudieron cargar las unidades.');
      })
      .finally(() => {
        if (!cancelled) setLoadingUnits(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromUnit.id]);

  useEffect(() => {
    setSwappedResourceId('');
    setSwapCandidates([]);
    if (mode !== 'swap' || !toUnitId) return;

    let cancelled = false;
    setLoadingCandidates(true);
    workerTransferService
      .listActivePersonnel(toUnitId)
      .then((list) => {
        if (!cancelled) setSwapCandidates(list.filter((r) => r.id !== worker.id));
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'No se pudo cargar el personal de la unidad destino.');
      })
      .finally(() => {
        if (!cancelled) setLoadingCandidates(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, toUnitId, worker.id]);

  const filteredUnits = useMemo(() => {
    const q = unitQuery.trim().toLowerCase();
    if (!q) return units;
    return units.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.clientName.toLowerCase().includes(q)
    );
  }, [units, unitQuery]);

  const selectedUnit = units.find((u) => u.id === toUnitId);
  const selectedSwap = swapCandidates.find((r) => r.id === swappedResourceId);

  const canSubmit =
    !!toUnitId &&
    !submitting &&
    (mode === 'transfer' || !!swappedResourceId);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await workerTransferService.transferWorker({
        resourceId: worker.id,
        fromUnitId: fromUnit.id,
        toUnitId,
        notes,
        swappedResourceId: mode === 'swap' ? swappedResourceId : undefined,
      });
      onTransferred(result);
    } catch (err: any) {
      setError(err?.message || 'No se pudo completar el traslado.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="text-blue-600" size={20} />
            <h3 className="text-lg font-semibold text-slate-800">Trasladar trabajador</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            disabled={submitting}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-medium text-slate-800">{worker.name}</p>
            <p className="text-sm text-slate-600">
              {worker.dni ? `DNI ${worker.dni}` : 'Sin DNI'}
              {worker.puesto ? ` · ${worker.puesto}` : ''}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Unidad actual: {fromUnit.name}
              {fromUnit.clientName ? ` · ${fromUnit.clientName}` : ''}
            </p>
          </div>

          <p className="text-sm text-slate-600">
            El trabajador se mueve con su historial de contratos, incrementos, capacitaciones, dotaciones, ficha y turnos.
            Las zonas de la unidad anterior se limpian. Vacaciones, tareo y constancias históricas quedan en la unidad donde ocurrieron.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('transfer')}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                mode === 'transfer'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Trasladar
            </button>
            <button
              type="button"
              onClick={() => setMode('swap')}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                mode === 'swap'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Intercambiar
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Unidad destino</label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={unitQuery}
                onChange={(e) => setUnitQuery(e.target.value)}
                placeholder="Buscar unidad o cliente..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {loadingUnits ? (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Cargando unidades...
              </p>
            ) : (
              <select
                value={toUnitId}
                onChange={(e) => setToUnitId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seleccione una unidad...</option>
                {filteredUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}{unit.clientName ? ` — ${unit.clientName}` : ''}
                  </option>
                ))}
              </select>
            )}
            {selectedUnit && (
              <p className="text-xs text-slate-500 mt-1">
                Destino: {selectedUnit.name}
                {selectedUnit.clientName ? ` · ${selectedUnit.clientName}` : ''}
              </p>
            )}
          </div>

          {mode === 'swap' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Intercambiar con
              </label>
              {!toUnitId ? (
                <p className="text-sm text-slate-500">Primero elija la unidad destino.</p>
              ) : loadingCandidates ? (
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Cargando personal...
                </p>
              ) : swapCandidates.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  Esa unidad no tiene personal activo para intercambiar. Use Trasladar.
                </p>
              ) : (
                <select
                  value={swappedResourceId}
                  onChange={(e) => setSwappedResourceId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccione un trabajador...</option>
                  {swapCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                      {candidate.dni ? ` · ${candidate.dni}` : ''}
                      {candidate.puesto ? ` · ${candidate.puesto}` : ''}
                    </option>
                  ))}
                </select>
              )}
              {selectedSwap && (
                <p className="text-xs text-slate-500 mt-1">
                  {selectedSwap.name} pasará a {fromUnit.name}.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Motivo / nota (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej. cobertura, pedido del cliente, rotación..."
            />
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
              {error}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-200 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {mode === 'swap' ? 'Confirmar intercambio' : 'Confirmar traslado'}
          </button>
        </div>
      </div>
    </div>
  );
};
