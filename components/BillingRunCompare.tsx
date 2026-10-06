import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import {
  BillingNoteKind,
  BillingStatus,
  ClientBillingNote,
  ClientBillingRecord,
  ClientBillingRun,
  SavedBillingCalc,
  buildSavedCalcs,
  calcOptionLabel,
  defaultComparisonBase,
} from '../services/clientBillingService';
import {
  defaultAdjustmentDescription,
  formatPeriodLabel,
  pen,
  snapshotFromSavedTotals,
  subtractBillingSnapshots,
  suggestedNoteKind,
} from '../utils/clientBillingCalc';

const fieldClass = 'mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-50';

export function BillingRunCompare(props: {
  records: ClientBillingRecord[];
  runs: ClientBillingRun[];
  notes: ClientBillingNote[];
  notesError: string | null;
  canEdit: boolean;
  busy: boolean;
  showForm: boolean;
  presetSourceId?: string;
  contextUnitId?: string;
  unsavedWarning?: boolean;
  onSave: (input: { source: SavedBillingCalc; base: SavedBillingCalc; noteKind: BillingNoteKind; itemDescription: string }) => void;
  onIssue: (id: string) => void;
  onReopen: (id: string) => void;
  onVoid: (id: string) => void;
}) {
  const calcs = useMemo(() => buildSavedCalcs(props.records, props.runs), [props.records, props.runs]);
  const calcsRef = useRef(calcs);
  calcsRef.current = calcs;
  const [sourceId, setSourceId] = useState('');
  const [baseId, setBaseId] = useState('');
  const [kind, setKind] = useState<BillingNoteKind>('debit');
  const [description, setDescription] = useState('');
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [kindTouched, setKindTouched] = useState(false);
  const [sameUnitOnly, setSameUnitOnly] = useState(Boolean(props.contextUnitId));
  const [showVoidNotes, setShowVoidNotes] = useState(false);

  useEffect(() => {
    if (!props.presetSourceId) return;
    const list = calcsRef.current;
    const sourceKey = list.find((calc) => calc.billingId === props.presetSourceId && calc.version === 'current')?.id || '';
    setSourceId(sourceKey);
    setBaseId(sourceKey ? defaultComparisonBase(list, sourceKey) : '');
    setDescriptionTouched(false);
    setKindTouched(false);
  }, [props.presetSourceId]);

  const source = calcs.find((calc) => calc.id === sourceId) || null;
  const base = calcs.find((calc) => calc.id === baseId) || null;
  const diff = useMemo(() => {
    if (!source || !base || source.id === base.id) return null;
    return subtractBillingSnapshots(snapshotFromSavedTotals(source), snapshotFromSavedTotals(base));
  }, [source, base]);

  useEffect(() => {
    if (!source || !base || descriptionTouched) return;
    setDescription(defaultAdjustmentDescription(source, base));
  }, [source, base, descriptionTouched]);

  useEffect(() => {
    if (!diff || kindTouched) return;
    const suggested = suggestedNoteKind(diff.signedGrand);
    if (suggested) setKind(suggested);
  }, [diff, kindTouched]);

  const visibleCalcs = calcs.filter((calc) => {
    if (sameUnitOnly && props.contextUnitId && calc.unitId !== props.contextUnitId && calc.id !== sourceId && calc.id !== baseId) return false;
    return true;
  });

  const visibleNotes = props.notes.filter((note) => {
    if (!showVoidNotes && note.status === 'void') return false;
    if (props.contextUnitId && note.unitId && note.unitId !== props.contextUnitId && note.sourceBillingId !== props.presetSourceId && note.baseBillingId !== props.presetSourceId) {
      return false;
    }
    return true;
  });

  const groups = groupCalcs(visibleCalcs);
  const zero = !!diff && diff.absoluteGrand < 0.005;
  const canCreate = props.canEdit && !!source && !!base && !!diff && !zero && !props.busy;

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <ArrowLeftRight size={18} /> Corrida entre cálculos
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Resta un cálculo guardado de otro. La diferencia del total sin IGV se convierte en el ítem de una nota de crédito o de débito, según lo que usted elija.
        </p>
      </div>

      {props.notesError && <p className="text-sm text-red-700">{props.notesError}</p>}
      {props.unsavedWarning && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Hay cambios sin guardar. La resta usa el último cálculo guardado de esta liquidación.
        </p>
      )}

      {props.showForm && (
        <div className="space-y-3">
          {calcs.length < 2 ? (
            <p className="text-sm text-slate-500">Guarde al menos dos cálculos para poder restarlos.</p>
          ) : (
            <>
              {props.contextUnitId && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={sameUnitOnly} onChange={(event) => setSameUnitOnly(event.target.checked)} />
                  Mostrar solo esta unidad
                </label>
              )}
              <div className="grid lg:grid-cols-2 gap-3">
                <label className="text-sm text-slate-600">
                  Cálculo
                  <select
                    className={fieldClass}
                    value={sourceId}
                    onChange={(event) => {
                      const next = event.target.value;
                      setSourceId(next);
                      setDescriptionTouched(false);
                      setKindTouched(false);
                      if (!baseId || baseId === next) setBaseId(defaultComparisonBase(calcs, next));
                    }}
                  >
                    <option value="">Seleccione el cálculo</option>
                    {groups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.calcs.map((calc) => (
                          <option key={calc.id} value={calc.id} disabled={calc.id === baseId}>
                            {calcOptionLabel(calc)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  Restar este cálculo
                  <select
                    className={fieldClass}
                    value={baseId}
                    onChange={(event) => {
                      setBaseId(event.target.value);
                      setDescriptionTouched(false);
                      setKindTouched(false);
                    }}
                  >
                    <option value="">Seleccione el cálculo a restar</option>
                    {groups.map((group) => (
                      <optgroup key={`base-${group.label}`} label={group.label}>
                        {group.calcs.map((calc) => (
                          <option key={calc.id} value={calc.id} disabled={calc.id === sourceId}>
                            {calcOptionLabel(calc)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </div>

              {diff && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">Concepto</th>
                        <th className="px-3 py-2 font-medium text-right">Cálculo</th>
                        <th className="px-3 py-2 font-medium text-right">Menos</th>
                        <th className="px-3 py-2 font-medium text-right">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.lines.map((line) => {
                        const emphasis = line.key === 'grand';
                        const reference = line.key === 'igv' || line.key === 'withIgv';
                        return (
                          <tr key={line.key} className={emphasis ? 'bg-slate-50 font-semibold text-slate-900' : 'text-slate-700'}>
                            <td className="px-3 py-2 border-t border-slate-100">
                              {line.label}
                              {reference ? <span className="block text-[11px] font-normal text-slate-400">Referencia. No entra en el ítem.</span> : null}
                            </td>
                            <td className="px-3 py-2 border-t border-slate-100 text-right">{pen(line.source)}</td>
                            <td className="px-3 py-2 border-t border-slate-100 text-right">{pen(line.base)}</td>
                            <td className={`px-3 py-2 border-t border-slate-100 text-right ${line.difference < 0 ? 'text-emerald-700' : line.difference > 0 ? 'text-amber-800' : ''}`}>
                              {pen(line.difference)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {diff && !zero && (
                <p className="text-sm text-slate-600">
                  {diff.signedGrand > 0
                    ? `El cálculo elegido es mayor por ${pen(diff.signedGrand)}. Lo habitual es una nota de débito, porque el cliente pagaría más.`
                    : `El cálculo elegido es menor por ${pen(diff.absoluteGrand)}. Lo habitual es una nota de crédito, porque el cliente pagaría menos.`}
                </p>
              )}
              {zero && <p className="text-sm text-slate-500">Los dos cálculos dan el mismo total sin IGV. No hay un ítem que crear.</p>}

              <div className="flex flex-wrap gap-4 text-sm text-slate-800">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="note-kind"
                    checked={kind === 'credit'}
                    onChange={() => {
                      setKind('credit');
                      setKindTouched(true);
                    }}
                  />
                  Nota de crédito
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="note-kind"
                    checked={kind === 'debit'}
                    onChange={() => {
                      setKind('debit');
                      setKindTouched(true);
                    }}
                  />
                  Nota de débito
                </label>
              </div>
              <p className="text-xs text-slate-500">
                {kind === 'credit' ? 'La nota de crédito reduce lo facturado al cliente.' : 'La nota de débito aumenta lo facturado al cliente.'} El ítem queda por {diff ? pen(diff.absoluteGrand) : pen(0)}, sin IGV.
              </p>
              <label className="text-sm text-slate-600 block">
                Descripción del ítem
                <input
                  className={fieldClass}
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setDescriptionTouched(true);
                  }}
                />
              </label>
              {props.canEdit && (
                <button
                  type="button"
                  disabled={!canCreate}
                  onClick={() => {
                    if (!source || !base) return;
                    props.onSave({ source, base, noteKind: kind, itemDescription: description });
                  }}
                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60"
                >
                  Crear ítem de {kind === 'credit' ? 'nota de crédito' : 'nota de débito'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Notas creadas</h3>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={showVoidNotes} onChange={(event) => setShowVoidNotes(event.target.checked)} />
            Ver anuladas
          </label>
        </div>
        {visibleNotes.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay notas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Nota</th>
                  <th className="px-3 py-2 font-medium">Ítem</th>
                  <th className="px-3 py-2 font-medium text-right">Monto</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visibleNotes.map((note) => (
                  <tr key={note.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{note.noteKind === 'credit' ? 'Nota de crédito' : 'Nota de débito'}</div>
                      <div className="text-xs text-slate-500">{note.unitName}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {note.itemDescription}
                      <details className="text-xs text-slate-500 mt-1">
                        <summary className="cursor-pointer">Ver resta</summary>
                        <p className="mt-1">Cálculo: {note.sourceLabel}</p>
                        <p>Menos: {note.baseLabel}</p>
                      </details>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">{pen(note.amount)}</td>
                    <td className="px-3 py-2">
                      <NoteStatus status={note.status} />
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {props.canEdit && note.status === 'draft' && (
                        <button type="button" disabled={props.busy} onClick={() => props.onIssue(note.id)} className="text-blue-700 text-xs font-medium mr-2 disabled:opacity-60">
                          Emitir
                        </button>
                      )}
                      {props.canEdit && note.status === 'issued' && (
                        <button type="button" disabled={props.busy} onClick={() => props.onReopen(note.id)} className="text-amber-800 text-xs font-medium mr-2 disabled:opacity-60">
                          Reabrir
                        </button>
                      )}
                      {props.canEdit && note.status !== 'void' && (
                        <button
                          type="button"
                          disabled={props.busy}
                          onClick={() => {
                            if (window.confirm('¿Anular esta nota? El ítem dejará de estar vigente.')) props.onVoid(note.id);
                          }}
                          className="text-red-600 text-xs font-medium disabled:opacity-60"
                        >
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function groupCalcs(calcs: SavedBillingCalc[]): { label: string; calcs: SavedBillingCalc[] }[] {
  const groups: { label: string; calcs: SavedBillingCalc[] }[] = [];
  calcs.forEach((calc) => {
    const label = `${calc.clientName} · ${calc.unitName} · ${formatPeriodLabel(calc.periodMonth)}`;
    const current = groups.find((group) => group.label === label);
    if (current) current.calcs.push(calc);
    else groups.push({ label, calcs: [calc] });
  });
  return groups;
}

function NoteStatus({ status }: { status: BillingStatus }) {
  const styles = {
    draft: 'bg-slate-100 text-slate-700',
    issued: 'bg-emerald-100 text-emerald-800',
    void: 'bg-red-100 text-red-700',
  }[status];
  const label = { draft: 'Borrador', issued: 'Emitida', void: 'Anulada' }[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles}`}>{label}</span>;
}
