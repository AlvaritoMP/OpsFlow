import React, { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Resource, Unit } from '../types';
import { TerminationReasonPoint, summarizeTerminationReasons } from '../utils/terminationReasonsChart';
import { DateInput } from './DateInput';

interface TerminationReasonsCardProps {
  units: Unit[];
  archivedPersonnel: Array<Resource & { originalUnitId?: string }>;
  loading?: boolean;
}

const PRESET_COLORS: Record<string, string> = {
  'Fin de contrato': '#3b82f6',
  'Renuncia voluntaria': '#10b981',
  'Despido': '#ef4444',
  'Mutuo acuerdo': '#8b5cf6',
  'Abandono de trabajo': '#f59e0b',
  'No renovación': '#06b6d4',
  'Término de obra o servicio': '#6366f1',
  'Fallecimiento': '#64748b',
  'Otro': '#ea580c',
  'Sin motivo': '#94a3b8',
};

const EXTRA_COLORS = ['#0ea5e9', '#d946ef', '#84cc16', '#f97316', '#14b8a6', '#a855f7'];

function colorFor(motivo: string, index: number): string {
  return PRESET_COLORS[motivo] || EXTRA_COLORS[index % EXTRA_COLORS.length];
}

function localIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  return { from: localIso(from), to: localIso(today) };
}

type RangePreset = '12m' | 'year' | 'all' | 'custom';

function ReasonTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TerminationReasonPoint }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const noun = row.ceses === 1 ? 'cese' : 'ceses';
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-800">{row.motivo}</p>
      <p className="text-slate-600">{row.ceses} {noun} · {row.share.toFixed(1)}%</p>
    </div>
  );
}

export const TerminationReasonsCard: React.FC<TerminationReasonsCardProps> = ({
  units,
  archivedPersonnel,
  loading = false,
}) => {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [preset, setPreset] = useState<RangePreset>('12m');

  const invalid = Boolean(from && to && from > to);
  const summary = useMemo(
    () => (invalid ? { points: [], total: 0, undated: 0 } : summarizeTerminationReasons(units, archivedPersonnel, { from, to })),
    [units, archivedPersonnel, from, to, invalid],
  );

  const applyPreset = (next: RangePreset) => {
    const today = new Date();
    setPreset(next);
    if (next === 'all') {
      setFrom('');
      setTo('');
      return;
    }
    if (next === 'year') {
      setFrom(localIso(new Date(today.getFullYear(), 0, 1)));
      setTo(localIso(today));
      return;
    }
    const range = defaultRange();
    setFrom(range.from);
    setTo(range.to);
  };

  const changeFrom = (value: string) => {
    setPreset('custom');
    setFrom(value);
  };
  const changeTo = (value: string) => {
    setPreset('custom');
    setTo(value);
  };

  const presetClass = (id: RangePreset) =>
    `px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
      preset === id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`;

  return (
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-4">
        <div>
          <h3 className="text-base md:text-lg font-semibold text-slate-800">Motivos de cese</h3>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Cuenta el motivo de la lista, según la fecha de cese. El detalle libre no abre una categoría.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={presetClass('12m')} onClick={() => applyPreset('12m')}>12 meses</button>
            <button type="button" className={presetClass('year')} onClick={() => applyPreset('year')}>Este año</button>
            <button type="button" className={presetClass('all')} onClick={() => applyPreset('all')}>Todo</button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Desde</label>
              <DateInput
                value={from}
                onChange={changeFrom}
                max={to || undefined}
                className="w-[9.5rem] px-2 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Hasta</label>
              <DateInput
                value={to}
                onChange={changeTo}
                min={from || undefined}
                className="w-[9.5rem] px-2 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {invalid && (
        <p className="text-sm text-rose-600 text-center py-8">La fecha desde queda después de la fecha hasta.</p>
      )}

      {!invalid && loading && summary.total === 0 && (
        <p className="text-sm text-slate-500 text-center py-8">Cargando ceses...</p>
      )}

      {!invalid && !loading && summary.total === 0 && (
        <p className="text-sm text-slate-500 text-center py-8">No hay ceses en este rango.</p>
      )}

      {!invalid && summary.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 md:gap-8 items-center">
          <div className="relative h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={summary.points}
                  dataKey="ceses"
                  nameKey="motivo"
                  innerRadius={62}
                  outerRadius={92}
                  paddingAngle={summary.points.length > 1 ? 2 : 0}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {summary.points.map((point, index) => (
                    <Cell key={point.motivo} fill={colorFor(point.motivo, index)} />
                  ))}
                </Pie>
                <Tooltip content={<ReasonTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-slate-800 tabular-nums">{summary.total}</span>
              <span className="text-[11px] text-slate-500">{summary.total === 1 ? 'cese' : 'ceses'}</span>
            </div>
          </div>
          <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {summary.points.map((point, index) => (
              <li key={point.motivo} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colorFor(point.motivo, index) }} />
                <span className="flex-1 min-w-0 truncate text-slate-700" title={point.motivo}>{point.motivo}</span>
                <span className="tabular-nums font-medium text-slate-800">{point.ceses}</span>
                <span className="w-12 text-right tabular-nums text-slate-400">{point.share.toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!invalid && summary.undated > 0 && (
        <p className="text-[10px] md:text-xs text-slate-400 mt-3 text-center">
          {summary.undated === 1
            ? '1 cese no tiene fecha y queda fuera del gráfico.'
            : `${summary.undated} ceses no tienen fecha y quedan fuera del gráfico.`}
        </p>
      )}
    </div>
  );
};
