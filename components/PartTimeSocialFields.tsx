import React from 'react';
import { BillingFormulaSet, describeFormula } from '../utils/billingFormulas';
import { PartTimeSocialRates } from '../utils/clientBillingCalc';

const fieldClass = 'mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-50';

/** Tasas que reemplazan a las de la jornada completa, solo en los puestos part time. */
export function PartTimeSocialFields(props: {
  rates: PartTimeSocialRates;
  locked: boolean;
  formulas?: BillingFormulaSet;
  onChange: (patch: Partial<PartTimeSocialRates>) => void;
}) {
  const percent = (key: keyof PartTimeSocialRates, label: string, formulaId?: string) => (
    <label className="text-xs text-slate-500">
      {label} %
      <input
        className={fieldClass}
        type="number"
        step="0.001"
        disabled={props.locked}
        value={Number((((props.rates[key] as number) || 0) * 100).toFixed(4))}
        onChange={(event) => props.onChange({ [key]: (Number(event.target.value) || 0) / 100 })}
      />
      {formulaId && <span className="block text-[11px] text-slate-400 mt-1">{describeFormula(formulaId, props.formulas)}</span>}
    </label>
  );
  return (
    <div className="border-t border-slate-200 pt-4 space-y-3">
      <div>
        <h3 className="font-semibold text-slate-900">Ajuste de cargas del part time</h3>
        <p className="text-sm text-slate-500 mt-1">
          Estas tasas entran solo en los puestos part time. El full time sigue con las de arriba. Las horas por día arrancan en 4, porque cambian el valor de la hora extra y del bono nocturno. El resto arranca igual que el full time: cámbielo donde la carga social del part time sea otra.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="text-xs text-slate-500">
          Horas por día
          <input
            className={fieldClass}
            type="number"
            step="0.5"
            disabled={props.locked}
            value={props.rates.hoursPerDay}
            onChange={(event) => props.onChange({ hoursPerDay: Number(event.target.value) || 0 })}
          />
        </label>
        {percent('vacationRate', 'Vacaciones', 'vacaciones')}
        {percent('gratiRate', 'Gratificación', 'gratificacion')}
        <label className="text-xs text-slate-500">
          Factor de bonificación extraordinaria
          <input
            className={fieldClass}
            type="number"
            step="0.01"
            disabled={props.locked}
            value={props.rates.gratiBonusFactor}
            onChange={(event) => props.onChange({ gratiBonusFactor: Number(event.target.value) || 0 })}
          />
        </label>
        {percent('ctsRate', 'CTS', 'cts')}
        {percent('feriaRate', 'Feriados', 'feriado')}
        {percent('essaludRate', 'EsSalud', 'essalud')}
        {percent('vidaLeyRate', 'Vida Ley', 'vidaLey')}
        {percent('sctrRate', 'SCTR', 'sctr')}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs text-slate-500">
          EsSalud
          <select
            className={fieldClass}
            disabled={props.locked}
            value={props.rates.essaludMode}
            onChange={(event) => props.onChange({ essaludMode: event.target.value === 'fixed' ? 'fixed' : 'percent' })}
          >
            <option value="percent">Porcentaje de la base</option>
            <option value="fixed">Monto fijo por puesto</option>
          </select>
        </label>
        {props.rates.essaludMode === 'fixed' && (
          <label className="text-xs text-slate-500">
            Monto fijo de EsSalud
            <input
              className={fieldClass}
              type="number"
              step="0.01"
              disabled={props.locked}
              value={props.rates.essaludFixedAmount}
              onChange={(event) => props.onChange({ essaludFixedAmount: Number(event.target.value) || 0 })}
            />
          </label>
        )}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" disabled={props.locked} checked={props.rates.applyFeria} onChange={(event) => props.onChange({ applyFeria: event.target.checked })} />
          Incluir feriados
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" disabled={props.locked} checked={props.rates.applyVidaLey} onChange={(event) => props.onChange({ applyVidaLey: event.target.checked })} />
          Incluir Vida Ley
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" disabled={props.locked} checked={props.rates.applySctr} onChange={(event) => props.onChange({ applySctr: event.target.checked })} />
          Incluir SCTR
        </label>
      </div>
    </div>
  );
}
