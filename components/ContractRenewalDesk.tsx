import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Search, X } from 'lucide-react';
import { Resource, Unit } from '../types';
import { DateInput } from './DateInput';
import { formatDateDisplay } from '../utils/dateFormat';
import {
  emptyRenewalDraft,
  EndMode,
  formatRenewalMoney,
  MoneyMode,
  PlannedRenewal,
  planRenewal,
  RenewalDraft,
  RenewalSort,
  RenewalWorker,
  StartMode,
  UrgencyFilter,
  collectRenewalWorkers,
  matchesUrgency,
} from '../utils/contractRenewal';
import { applyPlannedRenewal } from '../services/contractRenewalService';

interface ContractRenewalDeskProps {
  units: Unit[];
  canEdit: boolean;
  onPersonnelReplaced?: (resources: Resource[]) => void;
}

interface ApplyResult {
  renewed: number;
  updated: number;
  failures: string[];
}

const fieldClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white';

const urgencyOptions: { id: UrgencyFilter; label: string }[] = [
  { id: 'overdue', label: 'Vencidos' },
  { id: '15', label: 'Hasta 15 días' },
  { id: '30', label: 'Hasta 30 días' },
  { id: '60', label: 'Hasta 60 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'missing', label: 'Sin fecha de fin' },
  { id: 'all', label: 'Todos los activos' },
];

function deadlineLabel(worker: RenewalWorker): { text: string; className: string } {
  if (worker.daysLeft === null) {
    return { text: 'Sin fin', className: 'bg-slate-100 text-slate-600' };
  }
  if (worker.daysLeft < 0) {
    const days = Math.abs(worker.daysLeft);
    return {
      text: days === 1 ? 'Vencido hace 1 día' : `Vencido hace ${days} días`,
      className: 'bg-red-100 text-red-800',
    };
  }
  if (worker.daysLeft === 0) {
    return { text: 'Vence hoy', className: 'bg-amber-100 text-amber-800' };
  }
  if (worker.daysLeft <= 15) {
    return { text: `${worker.daysLeft} días`, className: 'bg-amber-100 text-amber-800' };
  }
  return { text: `${worker.daysLeft} días`, className: 'bg-slate-100 text-slate-700' };
}

type ApplyOutcome =
  | { ok: true; resource: Resource; id: string; action: 'renew' | 'update' }
  | { ok: false; id: string; action: 'renew' | 'update'; message: string };

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, onDone: (done: number) => void): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
      done += 1;
      onDone(done);
    }
  });
  await Promise.all(workers);
  return results;
}

export const ContractRenewalDesk: React.FC<ContractRenewalDeskProps> = ({ units, canEdit, onPersonnelReplaced }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [urgency, setUrgency] = useState<UrgencyFilter>('30');
  const [sortBy, setSortBy] = useState<RenewalSort>('end-asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<RenewalDraft>(emptyRenewalDraft);
  const [preview, setPreview] = useState<PlannedRenewal[] | null>(null);
  const [applying, setApplying] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const workers = useMemo(() => collectRenewalWorkers(units), [units]);

  const counts = useMemo(() => ({
    overdue: workers.filter((worker) => worker.daysLeft !== null && worker.daysLeft < 0).length,
    d15: workers.filter((worker) => matchesUrgency(worker, '15')).length,
    d30: workers.filter((worker) => matchesUrgency(worker, '30')).length,
    d60: workers.filter((worker) => matchesUrgency(worker, '60')).length,
    month: workers.filter((worker) => matchesUrgency(worker, 'month')).length,
    missing: workers.filter((worker) => !worker.end).length,
    all: workers.length,
  }), [workers]);

  const countFor = (filter: UrgencyFilter): number => {
    if (filter === 'overdue') return counts.overdue;
    if (filter === '15') return counts.d15;
    if (filter === '30') return counts.d30;
    if (filter === '60') return counts.d60;
    if (filter === 'month') return counts.month;
    if (filter === 'missing') return counts.missing;
    return counts.all;
  };

  const unitOptions = useMemo(() => {
    const map = new Map<string, string>();
    workers.forEach((worker) => map.set(worker.unitId, worker.unitName));
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [workers]);

  const clientOptions = useMemo(() => {
    const names: string[] = [];
    workers.forEach((worker) => {
      if (!names.includes(worker.clientName)) names.push(worker.clientName);
    });
    return names.sort((a, b) => a.localeCompare(b, 'es'));
  }, [workers]);

  const filteredWorkers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = workers.filter((worker) => {
      if (!matchesUrgency(worker, urgency)) return false;
      if (unitFilter !== 'all' && worker.unitId !== unitFilter) return false;
      if (clientFilter !== 'all' && worker.clientName !== clientFilter) return false;
      if (!query) return true;
      return [
        worker.resource.name,
        worker.resource.dni,
        worker.resource.puesto,
        worker.unitName,
        worker.clientName,
      ].some((value) => value?.toLowerCase().includes(query));
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'name') return a.resource.name.localeCompare(b.resource.name, 'es');
      if (sortBy === 'unit') {
        return a.unitName.localeCompare(b.unitName, 'es') || a.resource.name.localeCompare(b.resource.name, 'es');
      }
      if (!a.end && !b.end) return a.resource.name.localeCompare(b.resource.name, 'es');
      if (!a.end) return 1;
      if (!b.end) return -1;
      const cmp = a.end.localeCompare(b.end);
      if (cmp !== 0) return sortBy === 'end-desc' ? -cmp : cmp;
      return a.resource.name.localeCompare(b.resource.name, 'es');
    });
  }, [workers, urgency, unitFilter, clientFilter, searchQuery, sortBy]);

  const selectedWorkers = useMemo(
    () => workers.filter((worker) => selectedIds.has(worker.resource.id)),
    [workers, selectedIds],
  );
  const visibleIds = filteredWorkers.map((worker) => worker.resource.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const sample = selectedWorkers[0] ? planRenewal(selectedWorkers[0], draft) : null;

  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !applying) setPreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, applying]);

  const toggleId = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const setAction = (action: RenewalDraft['action']) => {
    setDraft((current) => ({
      ...current,
      action,
      endMode: action === 'update'
        ? (current.endMode === 'same-span' ? 'keep' : current.endMode)
        : (current.endMode === 'keep' ? 'months' : current.endMode),
    }));
  };

  const openPreview = () => {
    if (!canEdit || selectedWorkers.length === 0) return;
    setResult(null);
    setPreview(selectedWorkers.map((worker) => planRenewal(worker, draft)));
  };

  const confirmApply = async () => {
    if (!preview || applying) return;
    const ready: PlannedRenewal[] = preview.filter((plan) => !plan.error);
    if (ready.length === 0) return;

    setApplying({ done: 0, total: ready.length });
    const outcomes = await mapPool<PlannedRenewal, ApplyOutcome>(ready, 3, async (plan) => {
      try {
        const resource = await applyPlannedRenewal(plan);
        return { ok: true as const, resource, id: plan.worker.resource.id, action: plan.action };
      } catch (error) {
        return {
          ok: false as const,
          id: plan.worker.resource.id,
          action: plan.action,
          message: error instanceof Error ? error.message : 'No se pudo aplicar el cambio.',
        };
      }
    }, (done) => setApplying({ done, total: ready.length }));

    const replaced = outcomes.flatMap((outcome) => (outcome.ok ? [outcome.resource] : []));
    if (replaced.length > 0) onPersonnelReplaced?.(replaced);

    const skippedIds = preview.filter((plan) => plan.error).map((plan) => plan.worker.resource.id);
    const failedIds = new Set([
      ...outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.id),
      ...skippedIds,
    ]);
    const failures: string[] = [];
    for (const outcome of outcomes) {
      if (outcome.ok === false) failures.push(outcome.message);
    }
    setSelectedIds(failedIds);
    setResult({
      renewed: outcomes.filter((outcome) => outcome.ok && outcome.action === 'renew').length,
      updated: outcomes.filter((outcome) => outcome.ok && outcome.action === 'update').length,
      failures,
    });
    setApplying(null);
    setPreview(null);
  };

  const validPreviewCount = preview?.filter((plan) => !plan.error).length ?? 0;
  const previewUnits = new Set(preview?.filter((plan) => !plan.error).map((plan) => plan.worker.unitId)).size;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {urgencyOptions.filter((option) => option.id !== 'all').map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setUrgency(option.id)}
            className={`text-left rounded-lg border p-3 transition-colors ${
              urgency === option.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="text-xs text-slate-500">{option.label}</div>
            <div className={`text-2xl font-bold ${option.id === 'overdue' ? 'text-red-600' : 'text-slate-900'}`}>
              {countFor(option.id)}
            </div>
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-500">
        Los plazos de 15, 30 y 60 días incluyen los contratos ya vencidos. Hay {counts.all} trabajadores activos.
      </p>

      <div className="bg-white p-4 rounded-lg shadow border border-slate-200 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar por nombre, DNI, puesto, unidad o cliente..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Cliente</span>
            <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} className={`${fieldClass} mt-1`}>
              <option value="all">Todos los clientes</option>
              {clientOptions.map((client) => <option key={client} value={client}>{client}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Unidad</span>
            <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} className={`${fieldClass} mt-1`}>
              <option value="all">Todas las unidades</option>
              {unitOptions.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Vencimiento</span>
            <select value={urgency} onChange={(event) => setUrgency(event.target.value as UrgencyFilter)} className={`${fieldClass} mt-1`}>
              {urgencyOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label} ({countFor(option.id)})</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Orden</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as RenewalSort)} className={`${fieldClass} mt-1`}>
              <option value="end-asc">Fin más próximo</option>
              <option value="end-desc">Fin más lejano</option>
              <option value="unit">Unidad</option>
              <option value="name">Nombre</option>
            </select>
          </label>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow border border-slate-200 space-y-4">
        <div className="flex items-start gap-3">
          <CalendarClock className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Aplicar al lote seleccionado</h2>
            <p className="text-sm text-slate-600 mt-1">
              {draft.action === 'renew'
                ? 'Crea el siguiente contrato, marca el anterior como renovado y actualiza el fin, el sueldo y la condición en la ficha. El inicio de la relación laboral se conserva.'
                : 'Ajusta el fin, el sueldo o la condición del contrato vigente y de la ficha.'}
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setAction('renew')}
            className={`px-3 py-1.5 text-sm rounded-md ${draft.action === 'renew' ? 'bg-white text-slate-900 shadow-sm font-medium' : 'text-slate-600'}`}
          >
            Renovar contrato
          </button>
          <button
            type="button"
            onClick={() => setAction('update')}
            className={`px-3 py-1.5 text-sm rounded-md ${draft.action === 'update' ? 'bg-white text-slate-900 shadow-sm font-medium' : 'text-slate-600'}`}
          >
            Cambiar condiciones vigentes
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {draft.action === 'renew' && (
            <fieldset className="border border-slate-200 rounded-lg p-3 space-y-3">
              <legend className="px-1 text-sm font-medium text-slate-700">Inicio del nuevo contrato</legend>
              <select
                value={draft.startMode}
                onChange={(event) => setDraft({ ...draft, startMode: event.target.value as StartMode })}
                className={fieldClass}
              >
                <option value="day-after-end">Al día siguiente del fin actual</option>
                <option value="fixed">La misma fecha para todos</option>
              </select>
              {draft.startMode === 'fixed' && (
                <DateInput value={draft.startDate} onChange={(startDate) => setDraft({ ...draft, startDate })} className={fieldClass} />
              )}
            </fieldset>
          )}

          <fieldset className="border border-slate-200 rounded-lg p-3 space-y-3">
            <legend className="px-1 text-sm font-medium text-slate-700">
              {draft.action === 'renew' ? 'Fin del nuevo contrato' : 'Fecha de fin'}
            </legend>
            <select
              value={draft.endMode}
              onChange={(event) => setDraft({ ...draft, endMode: event.target.value as EndMode })}
              className={fieldClass}
            >
              {draft.action === 'update' && <option value="keep">Mantener el fin actual</option>}
              <option value="fixed">{draft.action === 'renew' ? 'La misma fecha para todos' : 'Nueva fecha para todos'}</option>
              <option value="months">{draft.action === 'renew' ? 'Duración en meses desde el nuevo inicio' : 'Extender el fin actual en meses'}</option>
              {draft.action === 'renew' && <option value="same-span">Misma cantidad de días que el contrato actual</option>}
            </select>
            {draft.endMode === 'fixed' && (
              <DateInput value={draft.endDate} onChange={(endDate) => setDraft({ ...draft, endDate })} min={draft.action === 'renew' ? draft.startDate || undefined : undefined} className={fieldClass} />
            )}
            {draft.endMode === 'months' && (
              <label className="block text-sm text-slate-600">
                Meses
                <input
                  type="number"
                  min={1}
                  max={36}
                  value={draft.months}
                  onChange={(event) => setDraft({ ...draft, months: Number(event.target.value) })}
                  className={`${fieldClass} mt-1`}
                />
              </label>
            )}
          </fieldset>

          <fieldset className="border border-slate-200 rounded-lg p-3 space-y-3">
            <legend className="px-1 text-sm font-medium text-slate-700">Sueldo bruto mensual</legend>
            <select
              value={draft.salaryMode}
              onChange={(event) => setDraft({ ...draft, salaryMode: event.target.value as MoneyMode })}
              className={fieldClass}
            >
              <option value="keep">Mantener el sueldo de cada trabajador</option>
              <option value="fixed">Fijar el mismo monto</option>
              <option value="add">Aumentar un monto</option>
              <option value="percent">Aumentar un porcentaje</option>
            </select>
            {draft.salaryMode !== 'keep' && (
              <label className="block text-sm text-slate-600">
                {draft.salaryMode === 'percent' ? 'Porcentaje' : 'Monto (S/)'}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.salaryValue}
                  onChange={(event) => setDraft({ ...draft, salaryValue: event.target.value })}
                  className={`${fieldClass} mt-1`}
                  placeholder={draft.salaryMode === 'percent' ? 'Ej. 10' : 'Ej. 1500.00'}
                />
              </label>
            )}
          </fieldset>

          <fieldset className="border border-slate-200 rounded-lg p-3 space-y-3">
            <legend className="px-1 text-sm font-medium text-slate-700">Condición de trabajo</legend>
            <select
              value={draft.conditionMode}
              onChange={(event) => setDraft({ ...draft, conditionMode: event.target.value as RenewalDraft['conditionMode'] })}
              className={fieldClass}
            >
              <option value="keep">Mantener la condición de cada trabajador</option>
              <option value="fixed">Fijar el mismo monto</option>
              <option value="add">Aumentar un monto</option>
            </select>
            {draft.conditionMode !== 'keep' && (
              <label className="block text-sm text-slate-600">
                Monto (S/)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.conditionValue}
                  onChange={(event) => setDraft({ ...draft, conditionValue: event.target.value })}
                  className={`${fieldClass} mt-1`}
                  placeholder="Ej. 200.00"
                />
              </label>
            )}
          </fieldset>
        </div>

        {draft.action === 'renew' && (
          <label className="block text-sm text-slate-700">
            Nota para el nuevo contrato (opcional)
            <textarea
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              rows={2}
              className={`${fieldClass} mt-1`}
              placeholder="Ej. Renovación trimestral de noviembre"
            />
          </label>
        )}

        {sample && (
          <div className={`text-sm rounded-lg px-3 py-2 ${sample.error ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700'}`}>
            <span className="font-medium">Ejemplo con {sample.worker.resource.name}: </span>
            {sample.error ? sample.error : (
              <>
                {sample.action === 'renew' && sample.nextStart && sample.nextEnd
                  ? `${formatDateDisplay(sample.currentEnd) || 'sin fin'} → ${formatDateDisplay(sample.nextStart)} al ${formatDateDisplay(sample.nextEnd)}`
                  : sample.endChanged && sample.nextEnd
                    ? `fin ${formatDateDisplay(sample.currentEnd) || '—'} → ${formatDateDisplay(sample.nextEnd)}`
                    : 'el fin se mantiene'}
                {`. Sueldo ${formatRenewalMoney(sample.currentSalary)} → ${formatRenewalMoney(sample.nextSalary)}. Condición ${formatRenewalMoney(sample.currentCondition)} → ${formatRenewalMoney(sample.nextCondition)}.`}
              </>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-slate-600">
            {selectedWorkers.length} seleccionado{selectedWorkers.length === 1 ? '' : 's'}
            {selectedWorkers.length > 0 && ` en ${new Set(selectedWorkers.map((worker) => worker.unitId)).size} unidad${new Set(selectedWorkers.map((worker) => worker.unitId)).size === 1 ? '' : 'es'}`}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={selectedWorkers.length === 0}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Limpiar selección
            </button>
            <button
              type="button"
              onClick={openPreview}
              disabled={!canEdit || selectedWorkers.length === 0}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Revisar y aplicar
            </button>
          </div>
        </div>
        {!canEdit && (
          <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
            Puede consultar los vencimientos. Renovar o cambiar condiciones requiere permiso de edición de personal.
          </p>
        )}
      </div>

      {result && (
        <div className={`rounded-lg border p-4 ${result.failures.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
          <div className="flex items-start gap-2">
            {result.failures.length > 0
              ? <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
              : <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0" />}
            <div className="text-sm text-slate-800 space-y-2">
              <p>
                {result.renewed > 0 && `${result.renewed} contrato${result.renewed === 1 ? '' : 's'} renovado${result.renewed === 1 ? '' : 's'}. `}
                {result.updated > 0 && `${result.updated} ficha${result.updated === 1 ? '' : 's'} actualizada${result.updated === 1 ? '' : 's'}. `}
                {result.renewed === 0 && result.updated === 0 && 'No se aplicó ningún cambio. '}
                {result.failures.length > 0 && `${result.failures.length} no se pudieron aplicar.`}
              </p>
              {result.failures.length > 0 && (
                <ul className="list-disc pl-5 space-y-1">
                  {result.failures.slice(0, 8).map((failure, index) => <li key={`${index}-${failure}`}>{failure}</li>)}
                  {result.failures.length > 8 && <li>Y {result.failures.length - 8} más.</li>}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-700">
            {filteredWorkers.length} trabajador{filteredWorkers.length === 1 ? '' : 'es'} en esta vista
          </span>
          {canEdit && filteredWorkers.length > 0 && (
            <button type="button" onClick={toggleVisible} className="text-sm font-medium text-blue-700 hover:text-blue-900">
              {allVisibleSelected ? 'Quitar los de esta vista' : 'Seleccionar los de esta vista'}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleVisible}
                    disabled={!canEdit || filteredWorkers.length === 0}
                    aria-label="Seleccionar los trabajadores de esta vista"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Trabajador</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Unidad</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Fin actual</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Plazo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Sueldo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Condición</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredWorkers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No hay trabajadores activos con este filtro.
                  </td>
                </tr>
              ) : filteredWorkers.map((worker) => {
                const deadline = deadlineLabel(worker);
                const checked = selectedIds.has(worker.resource.id);
                return (
                  <tr key={worker.resource.id} className={checked ? 'bg-blue-50/60' : 'hover:bg-slate-50'}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canEdit}
                        onChange={() => toggleId(worker.resource.id)}
                        aria-label={`Seleccionar a ${worker.resource.name}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-900">{worker.resource.name}</div>
                      <div className="text-xs text-slate-500">
                        {worker.resource.dni || 'Sin documento'}
                        {worker.resource.puesto ? ` · ${worker.resource.puesto}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-800">{worker.unitName}</div>
                      <div className="text-xs text-slate-500">{worker.clientName}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                      {formatDateDisplay(worker.end) || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${deadline.className}`}>
                        {deadline.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{formatRenewalMoney(worker.resource.monthlySalary)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{formatRenewalMoney(worker.resource.workConditionAmount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { if (!applying) setPreview(null); }}>
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(event) => event.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {draft.action === 'renew' ? 'Confirmar renovación' : 'Confirmar cambio de condiciones'}
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  {validPreviewCount} trabajador{validPreviewCount === 1 ? '' : 'es'} en {previewUnits} unidad{previewUnits === 1 ? '' : 'es'}.
                  {preview.some((plan) => plan.error) && ' Quienes tienen una observación se omiten.'}
                </p>
              </div>
              <button type="button" onClick={() => { if (!applying) setPreview(null); }} className="text-slate-400 hover:text-slate-600" disabled={!!applying}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-2">
              {preview.map((plan) => (
                <div key={plan.worker.resource.id} className={`rounded-lg border px-3 py-2 text-sm ${plan.error ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}`}>
                  <div className="font-medium text-slate-900">{plan.worker.resource.name}</div>
                  <div className="text-xs text-slate-500">{plan.worker.unitName} · {plan.worker.clientName}</div>
                  {plan.error ? (
                    <p className="text-amber-900 mt-1">{plan.error}</p>
                  ) : (
                    <p className="text-slate-700 mt-1">
                      {plan.action === 'renew'
                        ? `${formatDateDisplay(plan.nextStart)} al ${formatDateDisplay(plan.nextEnd)}`
                        : plan.endChanged
                          ? `Fin ${formatDateDisplay(plan.nextEnd)}`
                          : 'Fin sin cambio'}
                      {` · Sueldo ${formatRenewalMoney(plan.nextSalary)} · Condición ${formatRenewalMoney(plan.nextCondition)}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-slate-200 flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => setPreview(null)}
                disabled={!!applying}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => { void confirmApply(); }}
                disabled={!!applying || validPreviewCount === 0}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {applying && <Loader2 className="w-4 h-4 animate-spin" />}
                {applying
                  ? `Aplicando ${applying.done} de ${applying.total}`
                  : draft.action === 'renew'
                    ? `Renovar ${validPreviewCount}`
                    : `Actualizar ${validPreviewCount}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
