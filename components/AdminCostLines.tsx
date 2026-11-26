import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  AdminCostDetailItem,
  BillingCostLine,
  adminDetailAmount,
  adminDetailTotal,
  adminLineHasDetail,
  newBillingId,
  pen,
  round2,
} from '../utils/clientBillingCalc';

const fieldClass = 'mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-50';
const cellInput = 'w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-50';
const cellNumber = `${cellInput} text-right tabular-nums`;

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

function withoutDetail(line: BillingCostLine, patch: Partial<BillingCostLine>): BillingCostLine {
  const next = { ...line, ...patch };
  delete next.detail;
  return next;
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
  const amountOf = (line: BillingCostLine) => {
    if (line.formulaLocked || adminLineHasDetail(line)) return shown.get(line.id) ?? (adminLineHasDetail(line) ? adminDetailTotal(line.detail) : 0);
    return Number(line.amount) || 0;
  };
  const update = (id: string, patch: Partial<BillingCostLine>) => {
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };
  const replace = (id: string, next: BillingCostLine) => {
    onChange(lines.map((line) => (line.id === id ? next : line)));
  };
  const add = (kind: string) => {
    const formulaLocked = kind === 'financiero' && !lines.some((line) => line.kind === 'financiero' && line.formulaLocked);
    onChange([...lines, { id: newBillingId(), kind, description: '', amount: 0, formulaLocked }]);
  };
  const useFormula = (id: string) => {
    onChange(
      lines.map((line) => {
        if (line.id === id) return withoutDetail(line, { formulaLocked: true });
        if (line.kind === 'financiero' && line.formulaLocked) return { ...line, formulaLocked: false };
        return line;
      })
    );
  };
  const enableDetail = (line: BillingCostLine) => {
    const current = line.formulaLocked ? shown.get(line.id) || 0 : Number(line.amount) || 0;
    const detail: AdminCostDetailItem[] = [
      { id: newBillingId(), concept: '', unitCost: round2(current), quantity: 1 },
    ];
    replace(line.id, { ...line, formulaLocked: false, detail, amount: adminDetailTotal(detail) });
  };
  const disableDetail = (line: BillingCostLine) => {
    replace(line.id, withoutDetail(line, { formulaLocked: false, amount: adminDetailTotal(line.detail) }));
  };
  const writeDetail = (line: BillingCostLine, detail: AdminCostDetailItem[]) => {
    replace(line.id, { ...line, formulaLocked: false, detail, amount: adminDetailTotal(detail) });
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
              Listar cada línea
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
                  const detailed = adminLineHasDetail(line) && !formula;
                  const detailRows = line.detail || [];
                  return (
                    <div key={line.id} className="p-3 space-y-3">
                      <div className="grid md:grid-cols-[minmax(0,1fr)_180px_auto] gap-2 items-end">
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
                            disabled={locked || formula || detailed}
                            value={formula || detailed ? Number(amountOf(line).toFixed(2)) : line.amount}
                            onChange={(event) => replace(line.id, withoutDetail(line, { amount: Number(event.target.value) || 0, formulaLocked: false }))}
                          />
                          {detailed && <span className="block text-[11px] text-slate-400 mt-1">Suma del detalle</span>}
                          {formula && <span className="block text-[11px] text-slate-400 mt-1">Sale de la fórmula</span>}
                        </label>
                        <div className="flex flex-wrap items-center gap-2 pb-1">
                          {allowFormulaToggle && kind === 'financiero' && !locked && (
                            <button
                              type="button"
                              className="text-xs text-blue-700 whitespace-nowrap"
                              onClick={() =>
                                formula
                                  ? replace(line.id, withoutDetail(line, { formulaLocked: false, amount: shown.get(line.id) || 0 }))
                                  : useFormula(line.id)
                              }
                            >
                              {formula ? 'Escribir monto' : 'Usar fórmula'}
                            </button>
                          )}
                          {!locked && !detailed && (
                            <button type="button" className="text-xs text-blue-700 whitespace-nowrap" onClick={() => enableDetail(line)}>
                              Armar detalle
                            </button>
                          )}
                          {!locked && detailed && (
                            <button type="button" className="text-xs text-blue-700 whitespace-nowrap" onClick={() => disableDetail(line)}>
                              Usar monto entero
                            </button>
                          )}
                          {!locked && (
                            <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => onChange(lines.filter((item) => item.id !== line.id))} aria-label="Quitar línea">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                      {detailed && (
                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                          <p className="px-3 py-2 bg-slate-50 text-xs text-slate-500">
                            Cada fila multiplica el costo unitario por la cantidad. La suma reemplaza el monto de la línea.
                          </p>
                          {detailRows.length === 0 ? (
                            <p className="px-3 py-3 text-sm text-slate-500">Sin ítems. El monto de la línea queda en cero.</p>
                          ) : (
                            <div className="overflow-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    <th className="text-left px-2 py-2 min-w-[12rem]">Concepto</th>
                                    <th className="text-right px-2 py-2 min-w-[8rem]">Costo unitario</th>
                                    <th className="text-right px-2 py-2 min-w-[7rem]">Cantidad</th>
                                    <th className="text-right px-2 py-2 min-w-[14rem]">Unitario × cantidad</th>
                                    <th className="w-10" />
                                  </tr>
                                </thead>
                                <tbody>
                                  {detailRows.map((item) => {
                                    const rowAmount = adminDetailAmount(item);
                                    return (
                                      <tr key={item.id} className="border-t border-slate-100">
                                        <td className="px-2 py-1.5">
                                          <input
                                            className={cellInput}
                                            disabled={locked}
                                            placeholder="Concepto"
                                            value={item.concept}
                                            onChange={(event) =>
                                              writeDetail(
                                                line,
                                                detailRows.map((row) => (row.id === item.id ? { ...row, concept: event.target.value } : row))
                                              )
                                            }
                                          />
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <input
                                            className={cellNumber}
                                            type="number"
                                            step="0.01"
                                            disabled={locked}
                                            value={item.unitCost}
                                            onChange={(event) =>
                                              writeDetail(
                                                line,
                                                detailRows.map((row) => (row.id === item.id ? { ...row, unitCost: Number(event.target.value) || 0 } : row))
                                              )
                                            }
                                          />
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <input
                                            className={cellNumber}
                                            type="number"
                                            step="0.01"
                                            disabled={locked}
                                            value={item.quantity}
                                            onChange={(event) =>
                                              writeDetail(
                                                line,
                                                detailRows.map((row) => (row.id === item.id ? { ...row, quantity: Number(event.target.value) || 0 } : row))
                                              )
                                            }
                                          />
                                        </td>
                                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-slate-700">
                                          <span className="text-slate-400">{pen(Number(item.unitCost) || 0)} × {Number(item.quantity) || 0} = </span>
                                          <span className="font-semibold text-slate-900">{pen(rowAmount)}</span>
                                        </td>
                                        <td className="px-1 py-1.5 text-center">
                                          {!locked && (
                                            <button
                                              type="button"
                                              className="text-slate-400 hover:text-red-600"
                                              aria-label="Quitar ítem del detalle"
                                              onClick={() => writeDetail(line, detailRows.filter((row) => row.id !== item.id))}
                                            >
                                              <Trash2 size={15} />
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-slate-200 bg-slate-50">
                                    <td className="px-2 py-2 text-sm font-medium text-slate-700" colSpan={3}>Total del detalle</td>
                                    <td className="px-2 py-2 text-right font-semibold tabular-nums text-slate-900">{pen(adminDetailTotal(detailRows))}</td>
                                    <td />
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                          {!locked && (
                            <div className="px-3 py-2 border-t border-slate-100">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs text-slate-700"
                                onClick={() =>
                                  writeDetail(line, [...detailRows, { id: newBillingId(), concept: '', unitCost: 0, quantity: 1 }])
                                }
                              >
                                <Plus size={14} /> Agregar ítem
                              </button>
                            </div>
                          )}
                        </div>
                      )}
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
