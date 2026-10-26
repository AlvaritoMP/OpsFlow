import { useState } from 'react';
import {
  BILLING_FORMULA_DEFS,
  BILLING_FORMULA_INPUTS,
  BillingFormulaGroup,
  BillingFormulaSet,
  FORMULA_GROUP_LABELS,
  defaultBillingFormulas,
  describeExpression,
  normalizeBillingFormulas,
  validateBillingFormulas,
} from '../utils/billingFormulas';

const GROUPS: BillingFormulaGroup[] = ['remuneracion', 'cargas', 'costo', 'liquidacion'];

export function BillingFormulaEditor(props: {
  billingKey: string;
  formulas?: BillingFormulaSet;
  locked: boolean;
  publishing: boolean;
  onApply: (formulas: BillingFormulaSet) => void;
  onPublish: (formulas: BillingFormulaSet) => void;
}) {
  const [billingKey, setBillingKey] = useState(props.billingKey);
  const [draft, setDraft] = useState<BillingFormulaSet>(() => normalizeBillingFormulas(props.formulas));
  const [issues, setIssues] = useState<{ id: string; message: string }[]>([]);
  if (props.billingKey !== billingKey) {
    setBillingKey(props.billingKey);
    setDraft(normalizeBillingFormulas(props.formulas));
    setIssues([]);
  }

  const defaults = defaultBillingFormulas();
  const apply = (next: BillingFormulaSet) => {
    const found = validateBillingFormulas(next);
    setIssues(found);
    if (!found.length) props.onApply(normalizeBillingFormulas(next));
  };
  const edit = (id: string, expression: string) => {
    const next = { ...draft, [id]: expression };
    setDraft(next);
    apply(next);
  };
  const restore = () => {
    setDraft(defaults);
    setIssues([]);
    props.onApply(defaults);
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Editor de fórmulas</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Solo administradores. Una fórmula válida recalcula esta liquidación y actualiza su descripción. Publique el método para las liquidaciones nuevas y guarde el borrador para conservarlo aquí.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={props.locked}
            onClick={restore}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm disabled:opacity-50"
          >
            Restaurar fábrica
          </button>
          <button
            type="button"
            disabled={props.locked || props.publishing || issues.length > 0}
            onClick={() => props.onPublish(normalizeBillingFormulas(draft))}
            className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            Publicar método
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">
        Escriba nombres, números, + − * / y paréntesis. Funciones: max(a, b), min(a, b), if(condición, si se cumple, si no). Comparaciones: &gt; &lt; &gt;= &lt;= =. Una condición distinta de cero se cumple.
      </p>
      <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <summary className="cursor-pointer text-sm text-slate-700">Nombres disponibles</summary>
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-1 mt-2">
          {BILLING_FORMULA_INPUTS.map((item) => (
            <p key={item.id} className="text-[11px] text-slate-600">
              <span className="font-mono text-slate-800">{item.id}</span> · {item.label}
              <span className="text-slate-400"> · {item.scope === 'worker' ? 'trabajador' : 'liquidación'}</span>
            </p>
          ))}
          {BILLING_FORMULA_DEFS.map((item) => (
            <p key={`out-${item.id}`} className="text-[11px] text-slate-600">
              <span className="font-mono text-slate-800">{item.id}</span> · {item.label}
              <span className="text-slate-400"> · resultado</span>
            </p>
          ))}
        </div>
      </details>
      {GROUPS.map((group) => (
        <details key={group} open={group === 'cargas'} className="rounded-lg border border-slate-200">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-800">{FORMULA_GROUP_LABELS[group]}</summary>
          <div className="border-t border-slate-100 divide-y divide-slate-100">
            {BILLING_FORMULA_DEFS.filter((item) => item.group === group).map((item) => {
              const expression = draft[item.id] ?? defaults[item.id];
              const issue = issues.find((entry) => entry.id === item.id);
              let description = '';
              if (!issue) {
                try {
                  description = describeExpression(expression);
                } catch (error) {
                  description = error instanceof Error ? error.message : '';
                }
              }
              const custom = expression.trim() !== defaults[item.id];
              return (
                <label key={item.id} className="block px-3 py-3 text-xs text-slate-500">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-slate-800">{item.label}</span>
                    <span className="font-mono text-[10px] text-slate-400">{item.id}{custom ? ' · distinta de fábrica' : ''}</span>
                  </span>
                  <textarea
                    className="mt-1 w-full min-h-16 rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-800 disabled:bg-slate-50"
                    disabled={props.locked}
                    value={expression}
                    spellCheck={false}
                    onChange={(event) => edit(item.id, event.target.value)}
                  />
                  {issue ? (
                    <span className="block text-[11px] text-red-600 mt-1">{issue.message}</span>
                  ) : (
                    <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">{description}</span>
                  )}
                </label>
              );
            })}
          </div>
        </details>
      ))}
    </section>
  );
}
