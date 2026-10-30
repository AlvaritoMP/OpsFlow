import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, TrendingUp } from 'lucide-react';
import { Resource, Unit } from '../types';
import { TurnoverMonthPoint, computePersonnelTurnoverHistory } from '../utils/personnelTurnoverHistory';

interface PersonnelTurnoverHistoryProps {
  units: Unit[];
  archivedPersonnel: Array<Resource & { originalUnitId?: string }>;
  archivedLoading?: boolean;
}

function formatRate(value: number): string {
  return `${value.toFixed(1)}%`;
}

function TurnoverTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TurnoverMonthPoint }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-slate-800">{row.label}</p>
      <p className="text-slate-600">Activos al cierre: {row.inicio}</p>
      <p className="text-slate-600">Ingresos: {row.ingresos}</p>
      <p className="text-slate-600">Salidas: {row.salidas}</p>
      <p className="mt-1 text-emerald-700">Rotación: {formatRate(row.rotacion)}</p>
      <p className="text-blue-700">Tasa de ingreso: {formatRate(row.tasaIngreso)}</p>
      <p className="text-rose-700">Tasa de salida: {formatRate(row.tasaSalida)}</p>
    </div>
  );
}

function clientNameOf(unit: Unit): string {
  return unit.clientName?.trim() || 'Sin cliente';
}

export const PersonnelTurnoverHistory: React.FC<PersonnelTurnoverHistoryProps> = ({
  units,
  archivedPersonnel,
  archivedLoading = false,
}) => {
  const [clientOpen, setClientOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [unitQuery, setUnitQuery] = useState('');
  const [selected, setSelected] = useState<string[] | null>(null);
  const [selectedUnits, setSelectedUnits] = useState<string[] | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const clients = useMemo(() => {
    const names = new Set<string>(units.map((unit) => clientNameOf(unit)));
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'));
  }, [units]);

  const availableUnits = useMemo(() => {
    const activeClients = new Set(selected == null ? clients : selected);
    return units
      .filter((unit) => activeClients.has(clientNameOf(unit)))
      .map((unit) => ({
        id: unit.id,
        name: unit.name?.trim() || 'Sin nombre',
        client: clientNameOf(unit),
      }))
      .sort((a, b) => a.client.localeCompare(b.client, 'es') || a.name.localeCompare(b.name, 'es'));
  }, [units, selected, clients]);

  useEffect(() => {
    if (selected == null) return;
    const stillThere = selected.filter((name) => clients.includes(name));
    if (stillThere.length !== selected.length) setSelected(stillThere);
  }, [clients, selected]);

  useEffect(() => {
    if (selectedUnits == null) return;
    const allowed = new Set(availableUnits.map((unit) => unit.id));
    const stillThere = selectedUnits.filter((id) => allowed.has(id));
    if (stillThere.length !== selectedUnits.length) {
      setSelectedUnits(stillThere.length > 0 && stillThere.length === availableUnits.length ? null : stillThere);
    }
  }, [availableUnits, selectedUnits]);

  useEffect(() => {
    if (!clientOpen && !unitOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setClientOpen(false);
        setUnitOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [clientOpen, unitOpen]);

  const series = useMemo(() => {
    const clientScope = selected == null || selected.length === clients.length ? null : selected;
    const unitScope = selectedUnits == null || selectedUnits.length === availableUnits.length ? null : selectedUnits;
    return computePersonnelTurnoverHistory(units, archivedPersonnel, clientScope, new Date(), 12, unitScope);
  }, [units, archivedPersonnel, selected, selectedUnits, clients.length, availableUnits.length]);

  const allSelected = selected == null || (clients.length > 0 && selected.length === clients.length);
  const noneSelected = selected != null && selected.length === 0;
  const allUnitsSelected = selectedUnits == null || (availableUnits.length > 0 && selectedUnits.length === availableUnits.length);
  const noneUnitsSelected = selectedUnits != null && selectedUnits.length === 0;
  const visibleClients = clients.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()));
  const unitNeedle = unitQuery.trim().toLowerCase();
  const visibleUnits = availableUnits.filter((unit) =>
    !unitNeedle || unit.name.toLowerCase().includes(unitNeedle) || unit.client.toLowerCase().includes(unitNeedle)
  );
  const showClientGroups = new Set(availableUnits.map((unit) => unit.client)).size > 1;

  const filterLabel = allSelected
    ? 'Todos los clientes'
    : selected?.length === 1
      ? selected[0]
      : `${selected?.length || 0} clientes`;

  const selectedUnit = selectedUnits?.length === 1
    ? availableUnits.find((unit) => unit.id === selectedUnits[0])
    : undefined;
  const unitFilterLabel = allUnitsSelected
    ? 'Todas las unidades'
    : selectedUnit
      ? (showClientGroups ? `${selectedUnit.name} · ${selectedUnit.client}` : selectedUnit.name)
      : `${selectedUnits?.length || 0} unidades`;

  const toggleAll = () => {
    setSelected(allSelected ? [] : null);
  };

  const toggleClient = (name: string) => {
    const base = selected == null ? [...clients] : [...selected];
    const next = base.includes(name) ? base.filter((item) => item !== name) : [...base, name];
    setSelected(next.length === clients.length ? null : next);
  };

  const toggleAllUnits = () => {
    setSelectedUnits(allUnitsSelected ? [] : null);
  };

  const toggleUnit = (id: string) => {
    const base = selectedUnits == null ? availableUnits.map((unit) => unit.id) : [...selectedUnits];
    const next = base.includes(id) ? base.filter((item) => item !== id) : [...base, id];
    setSelectedUnits(next.length === availableUnits.length ? null : next);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-emerald-600" />
            <h3 className="text-base font-semibold text-slate-800 md:text-lg">Rotación histórica</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500 md:text-sm">
            Horizonte de 12 meses, con la misma fórmula que la tarjeta Rotación mensual: (nuevos + salidas) / activos al cierre del mes.
          </p>
          {archivedLoading && (
            <p className="mt-1 text-xs text-slate-400">Actualizando ceses archivados…</p>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row" ref={panelRef}>
          <div className="relative">
            <button
              type="button"
              aria-expanded={clientOpen}
              aria-haspopup="listbox"
              aria-label="Filtrar por cliente"
              onClick={() => {
                setClientOpen((value) => !value);
                setUnitOpen(false);
              }}
              className="flex w-full min-w-[220px] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:border-slate-300 sm:w-64"
            >
              <span className="truncate">{filterLabel}</span>
              <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${clientOpen ? 'rotate-180' : ''}`} />
            </button>
            {clientOpen && (
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

          <div className="relative">
            <button
              type="button"
              aria-expanded={unitOpen}
              aria-haspopup="listbox"
              aria-label="Filtrar por unidad"
              title={unitFilterLabel}
              onClick={() => {
                setUnitOpen((value) => !value);
                setClientOpen(false);
              }}
              className="flex w-full min-w-[220px] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:border-slate-300 sm:w-64"
            >
              <span className="truncate">{unitFilterLabel}</span>
              <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${unitOpen ? 'rotate-180' : ''}`} />
            </button>
            {unitOpen && (
              <div className="absolute right-0 z-20 mt-1 w-full min-w-[240px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg sm:w-80">
                {availableUnits.length > 6 && (
                  <input
                    type="search"
                    value={unitQuery}
                    onChange={(event) => setUnitQuery(event.target.value)}
                    placeholder="Buscar unidad"
                    className="mb-2 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400"
                  />
                )}
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={allUnitsSelected}
                    ref={(element) => {
                      if (element) element.indeterminate = !allUnitsSelected && !noneUnitsSelected;
                    }}
                    onChange={toggleAllUnits}
                  />
                  Todas las unidades
                </label>
                <div className="max-h-64 overflow-y-auto">
                  {visibleUnits.map((unit, index) => {
                    const checked = selectedUnits == null || selectedUnits.includes(unit.id);
                    const showHeader = showClientGroups && (index === 0 || visibleUnits[index - 1].client !== unit.client);
                    return (
                      <div key={unit.id}>
                        {showHeader && (
                          <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{unit.client}</p>
                        )}
                        <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                          <input type="checkbox" checked={checked} onChange={() => toggleUnit(unit.id)} />
                          <span className="truncate">{unit.name}</span>
                        </label>
                      </div>
                    );
                  })}
                  {visibleUnits.length === 0 && (
                    <p className="px-2 py-3 text-sm text-slate-400">
                      {availableUnits.length === 0 ? 'No hay unidades para este filtro.' : 'Ninguna unidad coincide.'}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {noneSelected ? (
        <p className="py-10 text-center text-sm text-slate-500">Selecciona al menos un cliente para ver la rotación.</p>
      ) : availableUnits.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">No hay unidades para los clientes seleccionados.</p>
      ) : noneUnitsSelected ? (
        <p className="py-10 text-center text-sm text-slate-500">Selecciona al menos una unidad para ver la rotación.</p>
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
                  <th className="px-2 py-2 text-right font-medium">Cierre</th>
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
            El cierre es quien seguía activo el último día del mes. En el mes en curso, ese día es hoy. Ingresos y salidas incluyen a quien entró o cesó en el mes, aunque haya durado pocos días. El personal compartido se cuenta una vez. Con todos los clientes y todas las unidades, la fila del mes coincide con la tarjeta.
          </p>
        </>
      )}
    </section>
  );
};
