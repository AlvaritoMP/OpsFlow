import React, { useState } from 'react';
import { BillingInternalNote, BillingInternalTab, formatBillingDateTime, newBillingId } from '../utils/clientBillingCalc';

const fieldClass = 'mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-50';

const DEFAULT_HINT = 'Anote por qué consideró estos datos. Queda en la liquidación para el equipo. No sale en el Excel, el PDF ni en las corridas.';

export function CostBitacora(props: {
  tab: BillingInternalTab;
  title?: string;
  hint?: string;
  notes: BillingInternalNote[] | undefined;
  locked: boolean;
  authorName: string;
  onChange: (notes: BillingInternalNote[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const entries = (props.notes || []).filter((note) => note.tab === props.tab).slice().reverse();
  const add = () => {
    const text = draft.trim();
    if (!text || props.locked) return;
    props.onChange([
      ...(props.notes || []),
      {
        id: newBillingId(),
        tab: props.tab,
        text,
        authorName: props.authorName || 'Usuario',
        createdAt: new Date().toISOString(),
      },
    ]);
    setDraft('');
  };
  return (
    <section className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-slate-900">{props.title || 'Bitácora interna'}</h3>
        <p className="text-xs text-slate-500 mt-1">{props.hint || DEFAULT_HINT}</p>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no hay notas en esta categoría.</p>
      ) : (
        <ol className="space-y-2 max-h-64 overflow-auto">
          {entries.map((note) => (
            <li key={note.id} className="bg-white border border-amber-100 rounded-lg px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] text-slate-500">
                  {note.authorName} · {formatBillingDateTime(note.createdAt)}
                </p>
                {!props.locked && (
                  <button
                    type="button"
                    className="text-[11px] text-red-600 shrink-0"
                    onClick={() => props.onChange((props.notes || []).filter((item) => item.id !== note.id))}
                  >
                    Quitar
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-800 whitespace-pre-wrap mt-1">{note.text}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="space-y-2">
        <textarea
          className={`${fieldClass} min-h-20`}
          disabled={props.locked}
          value={draft}
          placeholder="Sustento de esta categoría: por qué se tomó el dato, qué se revisó o qué quedó pendiente."
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="button"
          disabled={props.locked || !draft.trim()}
          onClick={add}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs disabled:opacity-50"
        >
          Agregar nota
        </button>
      </div>
    </section>
  );
}
