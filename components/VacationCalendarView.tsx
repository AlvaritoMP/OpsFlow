import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Building2, Palmtree } from 'lucide-react';
import { Unit, VacationCalendarEvent } from '../types';
import { vacationService } from '../services/vacationService';

interface VacationCalendarViewProps {
  units: Unit[];
  fixedUnitId?: string;
  showUnitLegend?: boolean;
}

const UNIT_COLORS = [
  '#059669', '#2563eb', '#d97706', '#dc2626', '#7c3aed',
  '#0891b2', '#be185d', '#4f46e5', '#0d9488', '#ea580c',
];

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDaysDate(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function unitColor(unitId: string, unitIds: string[]): string {
  const idx = unitIds.indexOf(unitId);
  return UNIT_COLORS[idx >= 0 ? idx % UNIT_COLORS.length : 0];
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const VacationCalendarView: React.FC<VacationCalendarViewProps> = ({
  units,
  fixedUnitId,
  showUnitLegend = true,
}) => {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('month');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [events, setEvents] = useState<VacationCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const todayStr = formatYmd(new Date());

  const range = useMemo(() => {
    if (viewMode === 'week') {
      const start = getMonday(anchorDate);
      const end = addDaysDate(start, 6);
      return { from: formatYmd(start), to: formatYmd(end), start, end };
    }
    const y = anchorDate.getFullYear();
    const m = anchorDate.getMonth();
    const from = formatYmd(new Date(y, m, 1));
    const to = formatYmd(new Date(y, m + 1, 0));
    return { from, to, start: parseDate(from), end: parseDate(to) };
  }, [anchorDate, viewMode]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await vacationService.getCalendarEvents(units, range.from, range.to);
      setEvents(data);
    } catch (err) {
      console.error('Error cargando calendario de vacaciones:', err);
    } finally {
      setLoading(false);
    }
  }, [units, range.from, range.to]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, VacationCalendarEvent[]>();
    events.forEach(ev => {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    });
    return map;
  }, [events]);

  const unitIdsInRange = useMemo(() => {
    const ids = new Set<string>();
    events.forEach(e => ids.add(e.unitId));
    return Array.from(ids);
  }, [events]);

  const unitsWithActiveVacation = useMemo(() => {
    const today = todayStr;
    const active = new Map<string, { unitName: string; count: number }>();
    events.forEach(ev => {
      if (ev.date === today) {
        const cur = active.get(ev.unitId) || { unitName: ev.unitName, count: 0 };
        cur.count += 1;
        active.set(ev.unitId, cur);
      }
    });
    return Array.from(active.entries()).map(([unitId, v]) => ({ unitId, ...v }));
  }, [events, todayStr]);

  const monthGridDays = useMemo(() => {
    if (viewMode !== 'month') return [];
    const y = anchorDate.getFullYear();
    const m = anchorDate.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startPad = (first.getDay() + 6) % 7;
    const days: { date: string; inMonth: boolean }[] = [];
    for (let i = startPad; i > 0; i--) {
      const d = new Date(y, m, 1 - i);
      days.push({ date: formatYmd(d), inMonth: false });
    }
    for (let d = 1; d <= last.getDate(); d++) {
      days.push({ date: formatYmd(new Date(y, m, d)), inMonth: true });
    }
    while (days.length % 7 !== 0) {
      const d = new Date(y, m + 1, days.length - last.getDate() - startPad + 1);
      days.push({ date: formatYmd(d), inMonth: false });
    }
    return days;
  }, [anchorDate, viewMode]);

  const weekDays = useMemo(() => {
    if (viewMode !== 'week') return [];
    const start = getMonday(anchorDate);
    return Array.from({ length: 7 }, (_, i) => formatYmd(addDaysDate(start, i)));
  }, [anchorDate, viewMode]);

  const navigate = (dir: -1 | 1) => {
    const d = new Date(anchorDate);
    if (viewMode === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchorDate(d);
    setSelectedDate(null);
  };

  const title =
    viewMode === 'month'
      ? `${MONTH_NAMES[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`
      : (() => {
          const s = getMonday(anchorDate);
          const e = addDaysDate(s, 6);
          return `${s.getDate()} – ${e.getDate()} ${MONTH_NAMES[e.getMonth()]} ${e.getFullYear()}`;
        })();

  const renderDayCell = (date: string, inMonth = true, compact = false) => {
    const dayEvents = eventsByDate.get(date) || [];
    const isToday = date === todayStr;
    const isSelected = date === selectedDate;
    const unitsOnDay = [...new Set(dayEvents.map(e => e.unitId))];

    return (
      <button
        key={date}
        type="button"
        onClick={() => setSelectedDate(date === selectedDate ? null : date)}
        className={`min-h-[90px] p-1.5 border border-slate-100 text-left transition-colors rounded-lg ${
          inMonth ? 'bg-white' : 'bg-slate-50/80'
        } ${isToday ? 'ring-2 ring-emerald-500 ring-inset' : ''} ${
          isSelected ? 'bg-emerald-50 border-emerald-300' : 'hover:bg-slate-50'
        }`}
      >
        <div className={`text-xs font-semibold mb-1 ${inMonth ? 'text-slate-700' : 'text-slate-400'} ${isToday ? 'text-emerald-700' : ''}`}>
          {parseDate(date).getDate()}
        </div>
        {dayEvents.length > 0 && (
          <div className="space-y-0.5">
            {unitsOnDay.slice(0, compact ? 2 : 3).map(uid => {
              const unitEv = dayEvents.filter(e => e.unitId === uid);
              const name = unitEv[0]?.unitName || '';
              return (
                <div
                  key={uid}
                  className="text-[10px] px-1 py-0.5 rounded truncate text-white font-medium"
                  style={{ backgroundColor: unitColor(uid, unitIdsInRange) }}
                  title={`${name}: ${unitEv.map(e => e.workerName).join(', ')}`}
                >
                  {fixedUnitId ? unitEv[0]?.workerName : name}
                  {!fixedUnitId && unitEv.length > 1 ? ` (${unitEv.length})` : ''}
                </div>
              );
            })}
            {unitsOnDay.length > (compact ? 2 : 3) && (
              <div className="text-[10px] text-slate-500">+{unitsOnDay.length - (compact ? 2 : 3)} unid.</div>
            )}
          </div>
        )}
      </button>
    );
  };

  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) || [] : [];

  return (
    <div className="space-y-4">
      {/* Unidades con vacaciones hoy */}
      {!fixedUnitId && unitsWithActiveVacation.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2 mb-2">
            <Palmtree size={16} /> Vacaciones en curso hoy ({todayStr})
          </p>
          <div className="flex flex-wrap gap-2">
            {unitsWithActiveVacation.map(u => (
              <span
                key={u.unitId}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full text-white"
                style={{ backgroundColor: unitColor(u.unitId, unitIdsInRange) }}
              >
                <Building2 size={12} />
                {u.unitName}
                <span className="bg-white/25 px-1.5 rounded-full">{u.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(-1)} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
            <ChevronLeft size={18} />
          </button>
          <h3 className="text-lg font-semibold text-slate-800 min-w-[200px] text-center">{title}</h3>
          <button type="button" onClick={() => navigate(1)} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            onClick={() => { setAnchorDate(new Date()); setSelectedDate(null); }}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 ml-1"
          >
            Hoy
          </button>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 self-start">
          <button
            type="button"
            onClick={() => setViewMode('week')}
            className={`px-3 py-1.5 text-sm rounded-md ${viewMode === 'week' ? 'bg-white shadow text-emerald-700 font-medium' : 'text-slate-500'}`}
          >
            Semana
          </button>
          <button
            type="button"
            onClick={() => setViewMode('month')}
            className={`px-3 py-1.5 text-sm rounded-md ${viewMode === 'month' ? 'bg-white shadow text-emerald-700 font-medium' : 'text-slate-500'}`}
          >
            Mes
          </button>
        </div>
      </div>

      {showUnitLegend && !fixedUnitId && unitIdsInRange.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {unitIdsInRange.map(uid => {
            const name = events.find(e => e.unitId === uid)?.unitName || uid;
            return (
              <span key={uid} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: unitColor(uid, unitIdsInRange) }} />
                {name}
              </span>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      ) : viewMode === 'month' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {DAY_LABELS.map(l => (
              <div key={l} className="text-center text-xs font-semibold text-slate-500 py-2">{l}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-slate-100 p-px">
            {monthGridDays.map(({ date, inMonth }) => renderDayCell(date, inMonth))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {weekDays.map((date, i) => (
            <div key={date} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className={`text-center text-xs font-semibold py-2 border-b ${date === todayStr ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-50 text-slate-600'}`}>
                {DAY_LABELS[i]} {parseDate(date).getDate()}
              </div>
              <div className="p-2 min-h-[120px] space-y-1">
                {(eventsByDate.get(date) || []).map((ev, idx) => (
                  <div
                    key={`${ev.resourceId}-${idx}`}
                    className="text-[11px] px-2 py-1 rounded text-white truncate"
                    style={{ backgroundColor: unitColor(ev.unitId, unitIdsInRange) }}
                    title={ev.workerName}
                  >
                    {ev.workerName}
                    {ev.eventType === 'day_entry' && <span className="opacity-75"> · a cuenta</span>}
                  </div>
                ))}
                {(eventsByDate.get(date) || []).length === 0 && (
                  <p className="text-[10px] text-slate-400 text-center pt-4">—</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detalle del día seleccionado */}
      {selectedDate && selectedEvents.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h4 className="font-semibold text-slate-800 mb-3">
            Vacaciones el {selectedDate} ({selectedEvents.length} registro{selectedEvents.length > 1 ? 's' : ''})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {selectedEvents.map((ev, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2">
                <div>
                  <span className="font-medium text-slate-800">{ev.workerName}</span>
                  {!fixedUnitId && <span className="text-slate-500 ml-2">· {ev.unitName}</span>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  ev.eventType === 'papeleta' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {ev.eventType === 'papeleta' ? ev.code || 'Papeleta' : 'Día a cuenta'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
