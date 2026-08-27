import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DailyShift, Resource } from '../types';
import {
  ROSTER_HOURS,
  formatShiftTimeRange,
  isRosterWorkShift,
  resolveShiftWindow,
  shiftCoversHour,
} from '../utils/rosterHours';

const hourLabel = (hour: number) => String(hour).padStart(2, '0');

const coverageFillClass = (type: string) => {
  if (type === 'Day') return 'bg-blue-500';
  if (type === 'Afternoon') return 'bg-amber-500';
  if (type === 'Night') return 'bg-indigo-600';
  return 'bg-slate-200';
};

const shiftForDate = (worker: Resource, dateStr: string): DailyShift | undefined =>
  worker.workSchedule?.find((shift) => shift.date === dateStr);

interface RosterHourCoverageGridProps {
  workers: Resource[];
  dateStr: string;
  dateLabel: string;
  onPrevDay: () => void;
  onNextDay: () => void;
}

export const RosterHourCoverageGrid: React.FC<RosterHourCoverageGridProps> = ({
  workers,
  dateStr,
  dateLabel,
  onPrevDay,
  onNextDay,
}) => {
  const today = new Date();
  const todayHour = today.getHours();
  const isToday =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` === dateStr;

  const counts = ROSTER_HOURS.map((hour) =>
    workers.reduce((total, worker) => {
      const shift = shiftForDate(worker, dateStr);
      const window = resolveShiftWindow(shift, worker);
      if (!window || !shift) return total;
      return total + (shiftCoversHour(window.startTime, window.endTime, hour) ? 1 : 0);
    }, 0)
  );

  return (
    <div className="border-t border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50">
        <div>
          <p className="text-sm font-bold text-slate-800">Cobertura por hora</p>
          <p className="text-[11px] text-slate-500">Cada bloque cubre las horas reales del trabajador. El color es la franja.</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onPrevDay} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600" title="Día anterior">
            <ChevronLeft size={16} />
          </button>
          <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 min-w-[160px] text-center">
            {dateLabel}
          </div>
          <button type="button" onClick={onNextDay} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600" title="Día siguiente">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 260 + 24 * 32 }}>
          <thead>
            <tr className="bg-white">
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 border-r border-slate-200 w-[260px]">
                Colaborador
              </th>
              {ROSTER_HOURS.map((hour) => (
                <th
                  key={hour}
                  className={`px-0 py-2 text-center text-[10px] font-bold text-slate-500 w-8 ${
                    isToday && hour === todayHour ? 'bg-blue-50 text-blue-700' : ''
                  }`}
                >
                  {hourLabel(hour)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workers.length === 0 && (
              <tr>
                <td colSpan={25} className="px-4 py-6 text-center text-sm text-slate-400 italic">
                  No hay colaboradores para mostrar cobertura.
                </td>
              </tr>
            )}
            {workers.map((worker) => {
              const shift = shiftForDate(worker, dateStr);
              const window = resolveShiftWindow(shift, worker);
              const type = shift?.type || 'OFF';
              return (
                <tr key={worker.id} className="border-t border-slate-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-r border-slate-200 w-[260px] max-w-[260px]">
                    <p className="text-xs font-medium text-slate-800 truncate">{worker.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {window ? `${formatShiftTimeRange(window.startTime, window.endTime)} · ${window.hours}h` : type === 'OFF' ? 'OFF' : type}
                    </p>
                  </td>
                  {ROSTER_HOURS.map((hour) => {
                    const covered = !!(window && shiftCoversHour(window.startTime, window.endTime, hour));
                    return (
                      <td
                        key={`${worker.id}-${hour}`}
                        className={`p-0.5 w-8 h-8 ${isToday && hour === todayHour ? 'bg-blue-50/70' : ''}`}
                        title={
                          covered && window
                            ? `${hourLabel(hour)}:00 · ${worker.name} · ${formatShiftTimeRange(window.startTime, window.endTime)}`
                            : `${hourLabel(hour)}:00`
                        }
                      >
                        <div
                          className={`h-6 w-full rounded-sm ${
                            covered && isRosterWorkShift(type) ? coverageFillClass(type) : 'bg-slate-100'
                          }`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 border-r border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-700">
                En turno
              </td>
              {counts.map((count, hour) => (
                <td
                  key={`tot-${hour}`}
                  className={`px-0 py-2 text-center text-xs font-bold ${
                    isToday && hour === todayHour ? 'bg-blue-50 text-blue-800' : 'text-slate-700'
                  }`}
                >
                  {count}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
