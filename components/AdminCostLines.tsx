import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { BillingCostLine, newBillingId, pen } from '../utils/clientBillingCalc';

const fieldClass = 'mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-50';

interface AdminCostLinesProps {
  title: string;
  hint: string;
  lines: BillingCostLine[];
  kinds: Array<[string, string]>;
  locked: boolean;
  amounts: Array<{ id: string; amount: number }>;
  total: number;
  onChange: (lines: BillingCostLine[]) => void;
  showDetail?: boolean;
  onShowDetail?: (showDetail: boolean) => void;
  allowFormulaToggle?: boolean;
}

function groupsOf(lines: BillingCostLine[], kinds: Array<[string, string]>): Array<[string, string]> {
  const known = new Set(kinds.map(([kind]) => kind));
  const extra: Array<[string, string]> = [];
  lines.forEach((line) => {
    if (!known.has(line.kind) && !extra.some(([kind]) => kind === line.kind)) extra.push([line.kind, line.kind]);
  });
  return [...kinds, ...extra];
}

export const AdminCostLines: React.FC<AdminCostLinesProps> = ({
  title,
  hint,
  lines,
  kinds,
  locked,
  amounts,
  total,
  onChange,
  showDetail,
  onShowDetail,
  allowFormulaToggle,
}) => {
  const shown = new Map<string, number>(amounts.map((line) => [line.id, Number(line.amount) || 0]));
  const amountOf = (line: BillingCostLine) => (line.formulaLocked ? shown.get(line.id) || 0 : Number(line.amount) || 0);
  const update = (id: string, patch: Partial<BillingCostLine>) => {
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };
  const add = (kind: string) => {
    const formulaLocked = kind === 'financiero' && !lines.some((line) => line.kind === 'financiero' && line.formulaLocked);
    onChange([...lines, { id: newBillingId(), kind, description: '', amount: 0, formulaLocked }]);
  };
  const useFormula = (id: string) => {
    onChange(
      lines.map((line) => {
        if (line.id === id) return { ...line, formulaLocked: true };
        if (line.kind === 'financiero' && line.formulaLocked) return { ...line, formulaLocked: false };
        return line;
      })
    );
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-1">{hint}</p>
      </div>
      {onShowDetail && (
        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-medium text-slate-600">En la propuesta</legend>
          <div className="flex flex-col sm:flex-row gap-3 text-sm text-slate-700">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="admin-presentation" disabled={locked} checked={showDetail !== false} onChange={() => onShowDetail(true)} />
              Mostrar el detalle de cada línea
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="admin-presentation" disabled={locked} checked={showDetail === false} onChange={() => onShowDetail(false)} />
              Mostrar solo la suma total
            </label>
          </div>
        </fieldset>
      )}
      {groupsOf(lines, kinds).map(([kind, label]) => {
        const rows = lines.filter((line) => line.kind === kind);
        const categoryTotal = rows.reduce((sum, line) => sum + amountOf(line), 0);
        return (
          <div key={kind} className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
              {!locked && (
                <button type="button" onClick={() => add(kind)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700">
                  <Plus size={14} /> Agregar línea
                </button>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-500">Sin líneas. El total de esta categoría queda en cero.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {rows.map((line) => {
                  const formula = Boolean(line.formulaLocked);
                  return (
                    <div key={line.id} className="p-3 grid md:grid-cols-[minmax(0,1fr)_160px_auto] gap-2 items-end">
                      <label className="text-xs text-slate-500">
                        Descripción
                        <input
                          className={fieldClass}
                          disabled={locked}
                          placeholder="Qué incluye esta línea"
                          value={line.description}
                          onChange={(event) => update(line.id, { description: event.target.value })}
                        />
                      </label>
                      <label className="text-xs text-slate-500">
                        Monto
                        <input
                          className={fieldClass}
                          type="number"
                          step="0.01"
                          disabled={locked || formula}
                          value={formula ? Number((shown.get(line.id) || 0).toFixed(2)) : line.amount}
                          onChange={(event) => update(line.id, { amount: Number(event.target.value) || 0, formulaLocked: false })}
                        />
                      </label>
                      <div className="flex items-center gap-2 pb-1">
                        {allowFormulaToggle && kind === 'financiero' && !locked && (
                          <button
                            type="button"
                            className="text-xs text-blue-700 whitespace-nowrap"
                            onClick={() => (formula ? update(line.id, { formulaLocked: false }) : useFormula(line.id))}
                          >
                            {formula ? 'Escribir monto' : 'Usar fórmula'}
                          </button>
                        )}
                        {!locked && (
                          <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => onChange(lines.filter((item) => item.id !== line.id))} aria-label="Quitar línea">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-slate-200 bg-slate-50 text-sm">
              <span className="font-medium text-slate-700">Total {label}</span>
              <span className="font-semibold tabular-nums text-slate-900">{pen(categoryTotal)}</span>
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-900 text-white px-3 py-2.5">
        <span className="text-sm font-medium">Total gastos administrativos</span>
        <span className="font-semibold tabular-nums">{pen(total)}</span>
      </div>
    </section>
  );
};
