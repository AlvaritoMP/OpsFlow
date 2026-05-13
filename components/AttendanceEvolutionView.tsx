import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  CalendarRange,
  ChevronDown,
  TrendingUp,
  CheckCircle,
  Clock,
  UserX,
  AlertTriangle,
} from 'lucide-react';
import { Unit, ResourceType, Resource } from '../types';
import {
  attendanceReportService,
  AttendanceRowWithImportMeta,
  effectiveAttendanceDate,
  isPersonnelActiveForUnitView,
  workerRangeStats,
  classifyAttendanceStatus,
} from '../services/attendanceReportService';
import { punchDisplay } from '../services/attendanceReportExcelParser';
import { SafeImage } from './SafeImage';

interface AttendanceEvolutionViewProps {
  unit: Unit;
}

function resourceById(unit: Unit, id: string | null): Resource | undefined {
  if (!id || !unit.resources?.length) return undefined;
  return unit.resources.find((r) => r.id === id);
}

/** Personal activo en la unidad (no archivado, no cesado/archivado como estado de personal). */
function activePersonnelList(unit: Unit): Resource[] {
  return (unit.resources || []).filter(
    (r) => r.type === ResourceType.PERSONNEL && isPersonnelActiveForUnitView(r)
  );
}

export const AttendanceEvolutionView: React.FC<AttendanceEvolutionViewProps> = ({ unit }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AttendanceRowWithImportMeta[]>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [resourceId, setResourceId] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await attendanceReportService.getUnitAttendanceRowsWithMeta(unit.id);
      setHistory(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar historial');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [unit.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeList = useMemo(() => {
    return activePersonnelList(unit).sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
    );
  }, [unit]);

  useEffect(() => {
    if (!resourceId && activeList.length) setResourceId(activeList[0].id);
  }, [activeList, resourceId]);

  /** Solo filas de personal activo actual, con match a ese recurso. */
  const historyForActive = useMemo(() => {
    const idSet = new Set(activeList.map((r) => r.id));
    return history.filter((h) => h.matched_resource_id && idSet.has(h.matched_resource_id));
  }, [history, activeList]);

  const rowsInRange = useMemo(() => {
    if (!resourceId) return [];
    return historyForActive.filter((h) => {
      if (h.matched_resource_id !== resourceId) return false;
      const d = effectiveAttendanceDate(h, h.import_report_date);
      return d >= dateFrom && d <= dateTo;
    });
  }, [historyForActive, resourceId, dateFrom, dateTo]);

  const byDateDesc = useMemo(() => {
    return [...rowsInRange].sort((a, b) => {
      const da = effectiveAttendanceDate(a, a.import_report_date);
      const db = effectiveAttendanceDate(b, b.import_report_date);
      if (da !== db) return db.localeCompare(da);
      return (b.uploaded_at || '').localeCompare(a.uploaded_at || '');
    });
  }, [rowsInRange]);

  const stats = useMemo(() => workerRangeStats(rowsInRange), [rowsInRange]);

  const chartData = useMemo(() => {
    const asc = [...rowsInRange].sort((a, b) => {
      const da = effectiveAttendanceDate(a, a.import_report_date);
      const db = effectiveAttendanceDate(b, b.import_report_date);
      return da.localeCompare(db);
    });
    const out: {
      date: string;
      fecha: string;
      completa: number;
      incompleta: number;
      sinMarcas: number;
      otro: number;
    }[] = [];
    for (const r of asc) {
const parts = d.split('-');
      const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
      const c = classifyAttendanceStatus(r.attendance_status);
      const row = {
        date: d,
        fecha: label,
        completa: 0,
        incompleta: 0,
        sinMarcas: 0,
        otro: 0,
      };
      if (c === 'complete') row.completa = 1;
      else if (c === 'partial') row.incompleta = 1;
      else if (c === 'none') row.sinMarcas = 1;
      else row.otro = 1;
      out.push(row);
    }
    return out;
  }, [rowsInRange]);

  const worker = resourceById(unit, resourceId);

  return (
    <div className="space-y-6 p-4 md:p-6 border-t border-slate-100 bg-slate-50/50">
      <div className="flex flex-col gap-2">
        <h4 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
          <TrendingUp size={22} className="text-blue-600" />
          Evolución por trabajador
        </h4>
        <p className="text-sm text-slate-600 max-w-3xl">
          Consulta por rango las marcas registradas en los Excel subidos a esta unidad. Solo se incluye personal
          <strong> activo</strong> hoy y con documento emparejado en el reporte. Los días sin archivo importado no
          aparecen (no se rellenan datos).
        </p>
      </div>

      <div className="flex flex-wrap gap-4 items-end bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Trabajador</label>
          <div className="relative">
            <select
              className="appearance-none border border-slate-300 rounded-lg pl-3 pr-9 py-2 text-sm min-w-[220px] max-w-[min(100vw-2rem,380px)] bg-white"
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
            >
              {activeList.length === 0 ? (
                <option value="">Sin personal activo</option>
              ) : (
                activeList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.dni ? ` · ${r.dni}` : ''}
                  </option>
                ))
              )}
            </select>
            <ChevronDown
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Desde</label>
          <input
            type="date"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Hasta</label>
          <input
            type="date"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={dateTo}
            min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-sm font-medium text-blue-700 hover:text-blue-900 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 disabled:opacity-50"
        >
          Actualizar datos
        </button>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm bg-red-50 text-red-900 border border-red-200">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Cargando historial de importaciones…</p>
      ) : activeList.length === 0 ? (
        <p className="text-sm text-slate-500 py-6">No hay personal activo en esta unidad.</p>
      ) : !worker ? (
        <p className="text-sm text-slate-500 py-6">Selecciona un trabajador.</p>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {worker.image ? (
              <SafeImage
                src={worker.image}
                alt={worker.name}
                className="h-20 w-20 rounded-xl object-cover border border-slate-200 shrink-0"
                fallback={
                  <div className="h-20 w-20 rounded-xl bg-slate-200 flex items-center justify-center text-slate-600 font-bold">
                    {(worker.name || '?')
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((x) => x[0]?.toUpperCase())
                      .join('')}
                  </div>
                }
              />
            ) : (
              <div className="h-20 w-20 rounded-xl bg-slate-200 flex items-center justify-center text-slate-600 font-bold shrink-0">
                {(worker.name || '?')
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((x) => x[0]?.toUpperCase())
                  .join('')}
              </div>
            )}
            <div>
              <h5 className="text-lg font-semibold text-slate-900">{worker.name}</h5>
              <p className="text-sm text-slate-600 font-mono">Documento · {worker.dni || '—'}</p>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                <CalendarRange size={12} /> Rango consultado · {dateFrom} → {dateTo}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase">Días con registro</div>
              <div className="text-2xl font-bold text-slate-900">{stats.daysWithReport}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                <CheckCircle size={14} /> Marcación OK
              </div>
              <div className="text-2xl font-bold text-emerald-700">{stats.complete}</div>
              <div className="text-xs text-slate-500">{stats.pctComplete}% del rango</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                <Clock size={14} /> Incompleta
              </div>
              <div className="text-2xl font-bold text-amber-700">{stats.partial}</div>
              <div className="text-xs text-slate-500">{stats.pctPartial}% del rango</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                <UserX size={14} /> Sin marcas
              </div>
              <div className="text-2xl font-bold text-slate-700">{stats.none}</div>
              <div className="text-xs text-slate-500">{stats.pctNone}% del rango</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                <AlertTriangle size={14} /> Otros
              </div>
              <div className="text-2xl font-bold text-blue-800">{stats.other}</div>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-xl p-10 text-center text-slate-500 text-sm">
              No hay registros de asistencia importados para este trabajador en el rango elegido.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h6 className="text-sm font-semibold text-slate-800 mb-4">Estado por día (rango consultado)</h6>
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11 }} stroke="#64748b" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(value: number, name: string) => [value, name]}
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload;
                        return p?.date ? `Fecha: ${p.date}` : '';
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="completa" stackId="a" name="Completa" fill="#059669" />
                    <Bar dataKey="incompleta" stackId="a" name="Incompleta" fill="#d97706" />
                    <Bar dataKey="sinMarcas" stackId="a" name="Sin marcas" fill="#64748b" />
                    <Bar dataKey="otro" stackId="a" name="Otro" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <h6 className="text-sm font-semibold text-slate-800">Detalle cronológico (más reciente primero)</h6>
            </div>
            {byDateDesc.length === 0 ? (
              <p className="p-8 text-center text-slate-500 text-sm">Sin filas en este rango.</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[min(520px,60vh)] overflow-y-auto">
                {byDateDesc.map((r) => {
                  const dIso = effectiveAttendanceDate(r, r.import_report_date);
                  const m = dIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                  const dLabel =
                    m && m[3] && m[2] && m[1] ? `${m[3]}/${m[2]}/${m[1]}` : dIso;
                  return (
                    <div key={r.id} className="p-4 grid grid-cols-1 lg:grid-cols-[140px_1fr] gap-3 hover:bg-slate-50/80">
                      <div>
                        <div className="font-mono text-sm font-semibold text-slate-900">{dLabel}</div>
                        <div className="text-[11px] text-slate-500 truncate mt-1" title={r.source_filename}>
                          {r.source_filename}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span
                          className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                            classifyAttendanceStatus(r.attendance_status) === 'complete'
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-100'
                              : classifyAttendanceStatus(r.attendance_status) === 'partial'
                                ? 'bg-amber-50 text-amber-900 border-amber-100'
                                : classifyAttendanceStatus(r.attendance_status) === 'none'
                                  ? 'bg-slate-100 text-slate-700 border-slate-200'
                                  : 'bg-blue-50 text-blue-900 border-blue-100'
                          }`}
                        >
                          {r.attendance_status || '—'}
                        </span>
                        {(
                          [
                            ['Llegada', punchDisplay(r.punch_arrival)],
                            ['S. almuerzo', punchDisplay(r.punch_lunch_out)],
                            ['R. almuerzo', punchDisplay(r.punch_lunch_in)],
                            ['Salida', punchDisplay(r.punch_departure)],
                          ] as const
                        ).map(([label, val]) => (
                          <div
                            key={label}
                            className="text-xs rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 min-w-[100px]"
                          >
                            <span className="text-slate-500 font-medium">{label}</span>
                            <div className="font-mono text-slate-900">{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
