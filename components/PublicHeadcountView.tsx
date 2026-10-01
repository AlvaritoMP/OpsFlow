import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Users } from 'lucide-react';
import {
  fetchPublicHeadcount,
  readPublicHeadcountToken,
  type PublicHeadcountBoard,
  type PublicHeadcountClosed,
  type HeadcountShiftCounts,
} from '../services/publicHeadcountService';

const POLL_MS = 60_000;

function formatCurrency(value: number): string {
  if (!value) return '—';
  return `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cellNum(value: number): string {
  return value ? String(value) : '—';
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function coverageClass(value: number): string {
  if (value >= 100) return 'text-green-600';
  if (value >= 80) return 'text-amber-600';
  return 'text-red-600';
}

const thBase = 'px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-center whitespace-nowrap border border-slate-300';
const tdBase = 'px-2 py-1.5 text-xs text-center border border-slate-200 whitespace-nowrap';

export const PublicHeadcountView: React.FC = () => {
  const token = readPublicHeadcountToken();
  const [board, setBoard] = useState<PublicHeadcountBoard | null>(null);
  const [closed, setClosed] = useState<PublicHeadcountClosed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const boardRef = useRef<PublicHeadcountBoard | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!token) {
      boardRef.current = null;
      setBoard(null);
      setClosed({
        available: false,
        code: 'invalid_token',
        message: 'Este enlace no es válido.',
        windowLabel: '8:00 a.m. – 6:00 p.m.',
      });
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const result = await fetchPublicHeadcount(token);
      if (result.available) {
        boardRef.current = result;
        setBoard(result);
        setClosed(null);
        setError(null);
      } else {
        boardRef.current = null;
        setBoard(null);
        setClosed(result);
        setError(null);
      }
    } catch (err) {
      if (!silent || !boardRef.current) {
        setError(err instanceof Error ? err.message : 'No se pudo cargar el cuadro');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Headcount — solo lectura';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => void load(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-[#1e3a5f] text-white px-4 py-4 md:px-8">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users size={22} />
            <div>
              <h1 className="text-lg font-bold leading-tight">Headcount</h1>
              <p className="text-xs text-blue-100">Solo lectura · sin acceso a OpsFlow</p>
            </div>
          </div>
          <div className="text-xs text-blue-100 flex items-center gap-2">
            <Clock size={14} />
            Disponible de 8:00 a.m. a 6:00 p.m. (hora de Perú)
            {board?.limaTime ? ` · ahora ${board.limaTime}` : ''}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 md:p-6">
        {loading && !board && (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-4 text-slate-500 text-sm">Cargando el cuadro de headcount…</p>
          </div>
        )}

        {!loading && error && !board && (
          <div className="bg-white rounded-xl border border-red-200 p-8 text-center max-w-lg mx-auto">
            <p className="text-red-700 font-medium">{error}</p>
            <button
              type="button"
              onClick={() => void load(false)}
              className="mt-4 px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm"
            >
              Reintentar
            </button>
          </div>
        )}

        {!loading && closed && !board && !error && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-lg mx-auto">
            <Clock className="mx-auto text-slate-400 mb-3" size={28} />
            <p className="font-semibold text-slate-800">{closed.message}</p>
            <p className="text-sm text-slate-500 mt-2">
              Horario: {closed.windowLabel} (hora de Perú)
              {closed.limaTime ? ` · ahora ${closed.limaTime}` : ''}
            </p>
          </div>
        )}

        {board && <BoardView board={board} />}
      </main>
    </div>
  );
};

const BoardView: React.FC<{ board: PublicHeadcountBoard }> = ({ board }) => {
  const { totals, dayStatus } = board;
  return (
    <div className="space-y-5 pb-10">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="RQ Total" value={String(totals.rq)} />
        <Kpi label="Activos" value={String(totals.activos)} tone="amber" />
        <Kpi label="Por cubrir" value={String(totals.porCubrir)} tone="orange" />
        <Kpi label="Cobertura" value={`${totals.coverage.toFixed(1)}%`} className={coverageClass(totals.coverage)} />
        <Kpi label="Turnover (salarios)" value={formatCurrency(totals.turnover)} />
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-slate-700 text-sm">Detalle Headcount por Unidad / Cargo</h2>
          <p className="text-xs text-slate-500">
            {formatDate(board.limaDate)} · {board.rows.length} filas · Retenes hoy: {dayStatus.retenesHoy}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-[#1e3a5f] text-white">
                <th rowSpan={2} className={`${thBase} text-left min-w-[160px]`}>Unidad</th>
                <th rowSpan={2} className={`${thBase} text-left min-w-[140px]`}>Cargo</th>
                <th rowSpan={2} className={thBase}>RQ</th>
                <th colSpan={3} className={`${thBase} bg-[#254a73]`}>Turnos (RQ)</th>
                <th rowSpan={2} className={thBase}>Turnover</th>
                <th rowSpan={2} className={`${thBase} bg-amber-400 text-amber-950`}>Activos</th>
                <th rowSpan={2} className={`${thBase} bg-orange-400 text-orange-950`}>Por cubrir</th>
                <th colSpan={3} className={`${thBase} bg-orange-300 text-orange-950`}>Turnos por cubrir</th>
                <th colSpan={3} className={`${thBase} bg-emerald-600`}>Preventivo FDM</th>
                <th colSpan={2} className={`${thBase} bg-slate-600`}>Retén del día</th>
              </tr>
              <tr className="bg-[#254a73] text-white">
                <ShiftHeads />
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Mañana</th>
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Tarde</th>
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Noche</th>
                <th className={`${thBase} bg-emerald-500`}>Mañana</th>
                <th className={`${thBase} bg-emerald-500`}>Tarde</th>
                <th className={`${thBase} bg-emerald-500`}>Noche</th>
                <th className={`${thBase} bg-slate-500`}>Nombre</th>
                <th className={`${thBase} bg-slate-500`}>#</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-6 py-10 text-center text-slate-400 text-sm">Sin datos</td>
                </tr>
              ) : board.rows.map((row, idx) => (
                <tr key={`${row.unitId}_${row.positionId}`} className={idx % 2 ? 'bg-slate-50' : 'bg-white'}>
                  {row.isFirstInUnit && (
                    <td rowSpan={row.unitRowSpan} className={`${tdBase} text-left font-semibold align-top bg-slate-50 max-w-[200px]`}>
                      <div className="whitespace-normal leading-snug">{row.unitName}</div>
                      {row.clientName && <div className="text-[10px] text-slate-400 font-normal mt-0.5">{row.clientName}</div>}
                    </td>
                  )}
                  <td className={`${tdBase} text-left font-medium`}>{row.positionName}</td>
                  <td className={`${tdBase} font-semibold`}>{row.rq}</td>
                  <ShiftCells counts={row.requiredByShift} />
                  <td className={`${tdBase} text-right tabular-nums`}>{formatCurrency(row.turnover)}</td>
                  <td className={`${tdBase} bg-amber-100 font-bold text-amber-900`}>{row.activos}</td>
                  <td className={`${tdBase} bg-orange-100 font-bold ${row.porCubrir > 0 ? 'text-red-700' : 'text-green-700'}`}>{row.porCubrir}</td>
                  <td className={`${tdBase} bg-orange-50 ${row.vacantByShift.Day > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>{cellNum(row.vacantByShift.Day)}</td>
                  <td className={`${tdBase} bg-orange-50 ${row.vacantByShift.Afternoon > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>{cellNum(row.vacantByShift.Afternoon)}</td>
                  <td className={`${tdBase} bg-orange-50 ${row.vacantByShift.Night > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>{cellNum(row.vacantByShift.Night)}</td>
                  <td className={`${tdBase} bg-emerald-50`}>{row.preventivo.Day || '—'}</td>
                  <td className={`${tdBase} bg-emerald-50`}>{row.preventivo.Afternoon || '—'}</td>
                  <td className={`${tdBase} bg-emerald-50`}>{row.preventivo.Night || '—'}</td>
                  {row.isFirstInUnit && (
                    <>
                      <td rowSpan={row.unitRowSpan} className={`${tdBase} text-left align-top text-[11px] max-w-[180px] whitespace-normal bg-slate-50`}>
                        {row.reten?.details?.length ? row.reten.details.map((detail, detailIndex) => (
                          <div key={`${row.unitId}-reten-${detailIndex}`} className="leading-snug font-semibold">{detail}</div>
                        )) : <span className="text-slate-400">—</span>}
                      </td>
                      <td rowSpan={row.unitRowSpan} className={`${tdBase} align-top font-bold`}>{row.reten?.count || 0}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            {board.rows.length > 0 && (
              <tfoot>
                <tr className="bg-[#1e3a5f] text-white font-bold">
                  <td className={`${thBase} text-left`} colSpan={2}>TOTAL</td>
                  <td className={thBase}>{totals.rq}</td>
                  <td className={thBase}>{cellNum(totals.shiftReq.Day)}</td>
                  <td className={thBase}>{cellNum(totals.shiftReq.Afternoon)}</td>
                  <td className={thBase}>{cellNum(totals.shiftReq.Night)}</td>
                  <td className={`${thBase} text-right`}>{formatCurrency(totals.turnover)}</td>
                  <td className={`${thBase} bg-amber-400 text-amber-950`}>{totals.activos}</td>
                  <td className={`${thBase} bg-orange-400 text-orange-950`}>{totals.porCubrir}</td>
                  <td className={`${thBase} bg-orange-300 text-orange-950`}>{cellNum(totals.shiftVacant.Day)}</td>
                  <td className={`${thBase} bg-orange-300 text-orange-950`}>{cellNum(totals.shiftVacant.Afternoon)}</td>
                  <td className={`${thBase} bg-orange-300 text-orange-950`}>{cellNum(totals.shiftVacant.Night)}</td>
                  <td className={`${thBase} bg-emerald-500`}>{totals.preventivo.Day || '—'}</td>
                  <td className={`${thBase} bg-emerald-500`}>{totals.preventivo.Afternoon || '—'}</td>
                  <td className={`${thBase} bg-emerald-500`}>{totals.preventivo.Night || '—'}</td>
                  <td className={thBase} colSpan={2}>{dayStatus.retenesHoy} retén(es) hoy</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h2 className="font-bold text-slate-700 text-sm">Resumen por Puesto</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-[#1e3a5f] text-white">
                <th className={`${thBase} text-left`}>Cargo</th>
                <th className={thBase}>RQ</th>
                <ShiftHeads />
                <th className={`${thBase} bg-amber-400 text-amber-950`}>Activos</th>
                <th className={`${thBase} bg-orange-400 text-orange-950`}>Por cubrir</th>
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Vac. M</th>
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Vac. T</th>
                <th className={`${thBase} bg-orange-200 text-orange-900`}>Vac. N</th>
                <th className={thBase}>Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {board.positionSummary.map((pos, idx) => {
                const cov = pos.rq > 0 ? (pos.activos / pos.rq) * 100 : 0;
                return (
                  <tr key={pos.positionName} className={idx % 2 ? 'bg-slate-50' : 'bg-white'}>
                    <td className={`${tdBase} text-left font-medium`}>{pos.positionName}</td>
                    <td className={`${tdBase} font-semibold`}>{pos.rq}</td>
                    <ShiftCells counts={pos.requiredByShift} />
                    <td className={`${tdBase} bg-amber-50 font-bold`}>{pos.activos}</td>
                    <td className={`${tdBase} bg-orange-50 font-bold ${pos.porCubrir > 0 ? 'text-red-600' : 'text-green-600'}`}>{pos.porCubrir}</td>
                    <td className={tdBase}>{cellNum(pos.vacantByShift.Day)}</td>
                    <td className={tdBase}>{cellNum(pos.vacantByShift.Afternoon)}</td>
                    <td className={tdBase}>{cellNum(pos.vacantByShift.Night)}</td>
                    <td className={`${tdBase} font-medium ${coverageClass(cov)}`}>{cov.toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h2 className="font-bold text-slate-700 text-sm">Resumen por Unidad</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-[#1e3a5f] text-white">
                <th className={`${thBase} text-left`}>Unidad</th>
                <th className={`${thBase} text-left`}>Cliente</th>
                <th className={thBase}>RQ</th>
                <th className={`${thBase} bg-amber-400 text-amber-950`}>Activos</th>
                <th className={`${thBase} bg-orange-400 text-orange-950`}>Por cubrir</th>
                <th className={thBase}>Cobertura</th>
                <th className={`${thBase} bg-slate-600`}>Retén</th>
              </tr>
            </thead>
            <tbody>
              {board.unitSummary.map((unit, idx) => {
                const cov = unit.rq > 0 ? (unit.activos / unit.rq) * 100 : 0;
                return (
                  <tr key={unit.unitId} className={idx % 2 ? 'bg-slate-50' : 'bg-white'}>
                    <td className={`${tdBase} text-left font-medium`}>{unit.unitName}</td>
                    <td className={`${tdBase} text-left text-slate-500`}>{unit.clientName || '—'}</td>
                    <td className={`${tdBase} font-semibold`}>{unit.rq}</td>
                    <td className={`${tdBase} bg-amber-50 font-bold`}>{unit.activos}</td>
                    <td className={`${tdBase} bg-orange-50 font-bold ${unit.porCubrir > 0 ? 'text-red-600' : 'text-green-600'}`}>{unit.porCubrir}</td>
                    <td className={`${tdBase} font-medium ${coverageClass(cov)}`}>{cov.toFixed(0)}%</td>
                    <td className={`${tdBase} text-left text-[11px] max-w-[180px] whitespace-normal`}>
                      {unit.reten?.names?.length ? unit.reten.names.join(', ') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-md">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h2 className="font-bold text-slate-700 text-sm">Estado del día</h2>
        </div>
        <table className="min-w-full border-collapse">
          <tbody>
            <StatusRow label="Retenes asignados hoy" value={dayStatus.retenesHoy} alt={false} />
            <StatusRow label="Descanso (OFF)" value={dayStatus.descanso} alt />
            <StatusRow label="Falta / Enfermedad" value={dayStatus.falta} alt={false} />
            <StatusRow label="Vacaciones" value={dayStatus.vacaciones} alt />
          </tbody>
        </table>
      </section>
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: string; tone?: 'amber' | 'orange'; className?: string }> = ({
  label, value, tone, className,
}) => (
  <div className={`rounded-lg border px-4 py-3 ${
    tone === 'amber' ? 'bg-amber-50 border-amber-200' : tone === 'orange' ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'
  }`}>
    <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`text-xl font-bold ${className || 'text-slate-800'}`}>{value}</p>
  </div>
);

const ShiftHeads: React.FC = () => (
  <>
    <th className={thBase}>Mañana</th>
    <th className={thBase}>Tarde</th>
    <th className={thBase}>Noche</th>
  </>
);

const ShiftCells: React.FC<{ counts: HeadcountShiftCounts }> = ({ counts }) => (
  <>
    <td className={tdBase}>{cellNum(counts.Day)}</td>
    <td className={tdBase}>{cellNum(counts.Afternoon)}</td>
    <td className={tdBase}>{cellNum(counts.Night)}</td>
  </>
);

const StatusRow: React.FC<{ label: string; value: number; alt: boolean }> = ({ label, value, alt }) => (
  <tr className={alt ? 'bg-slate-50' : 'bg-white'}>
    <td className={`${tdBase} text-left`}>{label}</td>
    <td className={`${tdBase} font-bold`}>{value}</td>
  </tr>
);
