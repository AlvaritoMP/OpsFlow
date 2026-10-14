import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, TrendingUp } from 'lucide-react';
import { Resource, Unit } from '../types';
import {
  TurnoverMonthPoint,
  buildTurnoverSpells,
  computePersonnelTurnoverHistory,
} from '../utils/personnelTurnoverHistory';

interface PersonnelTurnoverHistoryProps {
  units: Unit[];
  archivedPersonnel: Array<Resource & { originalUnitId?: string }>;
  archivedLoading?: boolean;
}

function formatRate(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

function TurnoverTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TurnoverMonthPoint }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-slate-800">{row.label}</p>
      <p className="text-slate-600">Personal al inicio: {row.inicio}</p>
      <p className="text-slate-600">Ingresos: {row.ingresos}</p>
      <p className="text-slate-600">Salidas: {row.salidas}</p>
      <p className="mt-1 text-emerald-700">Rotación: {formatRate(row.rotacion)}</p>
      <p className="text-blue-700">Tasa de ingreso: {formatRate(row.tasaIngreso)}</p>
      <p className="text-rose-700">Tasa de salida: {formatRate(row.tasaSalida)}</p>
      {row.inicio === 0 && (
        <p className="mt-1 text-slate-400">Sin personal al inicio: las tasas no tienen base.</p>
      )}
    </div>
  );
}

export const PersonnelTurnoverHistory: React.FC<PersonnelTurnoverHistoryProps> = ({
  units,
  archivedPersonnel,
  archivedLoading = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[] | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const spells = useMemo(
    () => buildTurnoverSpells(units, archivedPersonnel),
    [units, archivedPersonnel]
  );

  const clients = useMemo(() => {
    const names = new Set(spells.map((spell) => spell.clientName));
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  }, [spells]);

  useEffect(() => {
    if (selected == null) return;
    const stillThere = selected.filter((name) => clients.includes(name));
    if (stillThere.length !== selected.length) setSelected(stillThere);
  }, [clients, selected]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const series = useMemo(
    () => computePersonnelTurnoverHistory(spells, selected && selected.length === clients.length ? null : selected),
    [spells, selected, clients.length]
  );

  const allSelected = selected == null || (clients.length > 0 && selected.length === clients.length);
  const noneSelected = selected != null && selected.length === 0;
  const visibleClients = clients.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()));

  const filterLabel = allSelected
    ? 'Todos los clientes'
    : selected?.length === 1
      ? selected[0]
      : `${selected?.length || 0} clientes`;

  const toggleAll = () => {
    setSelected(allSelected ? [] : null);
  };

  const toggleClient = (name: string) => {
    const base = selected == null ? [...clients] : [...selected];
    const next = base.includes(name) ? base.filter((item) => item !== name) : [...base, name];
    setSelected(next.length === clients.length ? null : next);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-emerald-600" />
            <h3 className="text-base font-semibold text-slate-800 md:text-lg">Rotación histórica</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500 md:text-sm">
            Horizonte de 12 meses. Rotación = (ingresos + salidas) / personal al inicio. Tasa de ingreso = ingresos / inicio. Tasa de salida = ceses / inicio.
          </p>
          {archivedLoading && (
            <p className="mt-1 text-xs text-slate-400">Actualizando ceses archivados…</p>
          )}
        </div>

        <div className="relative shrink-0" ref={panelRef}>
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => setOpen((value) => !value)}
            className="flex w-full min-w-[220px] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:border-slate-300 sm:w-64"
          >
            <span className="truncate">{filterLabel}</span>
            <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="absolute right-0 z-20 mt-1 w-full min-w-[240px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg sm:w-72">
              {clients.length > 6 && (
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar cliente"
                  className="mb-2 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400"
                />
              )}
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(element) => {
                    if (element) element.indeterminate = !allSelected && !noneSelected;
                  }}
                  onChange={toggleAll}
                />
                Todos los clientes
              </label>
              <div className="max-h-56 overflow-y-auto">
                {visibleClients.map((name) => {
                  const checked = selected == null || selected.includes(name);
                  return (
                    <label key={name} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                      <input type="checkbox" checked={checked} onChange={() => toggleClient(name)} />
                      <span className="truncate">{name}</span>
                    </label>
                  );
                })}
                {visibleClients.length === 0 && (
                  <p className="px-2 py-3 text-sm text-slate-400">Ningún cliente coincide.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {noneSelected ? (
        <p className="py-10 text-center text-sm text-slate-500">Selecciona al menos un cliente para ver la rotación.</p>
      ) : (
        <>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
              <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={52} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  width={42}
                  tickFormatter={(value: number) => `${value}%`}
                />
                <Tooltip content={<TurnoverTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="rotacion" name="Rotación" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="tasaIngreso" name="Tasa de ingreso" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="tasaSalida" name="Tasa de salida" stroke="#e11d48" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-2 py-2 font-medium">Mes</th>
                  <th className="px-2 py-2 text-right font-medium">Inicio</th>
                  <th className="px-2 py-2 text-right font-medium">Ingresos</th>
                  <th className="px-2 py-2 text-right font-medium">Salidas</th>
                  <th className="px-2 py-2 text-right font-medium">Rotación</th>
                  <th className="px-2 py-2 text-right font-medium">Tasa ingreso</th>
                  <th className="px-2 py-2 text-right font-medium">Tasa salida</th>
                </tr>
              </thead>
              <tbody>
                {series.map((row, index) => (
                  <tr
                    key={row.key}
                    className={`border-b border-slate-100 ${index === series.length - 1 ? 'bg-emerald-50/60 font-medium text-slate-800' : 'text-slate-700'}`}
                  >
                    <td className="whitespace-nowrap px-2 py-2">{row.label}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.inicio}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.ingresos}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.salidas}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-emerald-700">{formatRate(row.rotacion)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-blue-700">{formatRate(row.tasaIngreso)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-rose-700">{formatRate(row.tasaSalida)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-slate-400 md:text-xs">
            El mes en curso está resaltado. Sus ingresos llegan hasta hoy y sus salidas consideran todo el mes. El personal compartido se cuenta una vez. El fin de contrato de quien sigue activo no cuenta como salida. Los ceses archivados se atribuyen al cliente de su unidad.
          </p>
        </>
      )}
    </section>
  );
};
