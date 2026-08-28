import { DailyShift, Resource, ShiftType } from '../types';

export const ROSTER_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const DEFAULT_WINDOWS: Record<'Day' | 'Afternoon' | 'Night', Record<8 | 12, { startTime: string; endTime: string }>> = {
  Day: {
    8: { startTime: '06:00', endTime: '14:00' },
    12: { startTime: '06:00', endTime: '18:00' },
  },
  Afternoon: {
    8: { startTime: '14:00', endTime: '22:00' },
    12: { startTime: '14:00', endTime: '02:00' },
  },
  Night: {
    8: { startTime: '22:00', endTime: '06:00' },
    12: { startTime: '18:00', endTime: '06:00' },
  },
};

export function isRosterWorkShift(type?: string): type is 'Day' | 'Afternoon' | 'Night' {
  return type === 'Day' || type === 'Afternoon' || type === 'Night';
}

export function normalizeShiftTime(value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function minutesFromTime(value: string): number {
  const normalized = normalizeShiftTime(value);
  if (!normalized) return 0;
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute;
}

export function timeFromMinutes(total: number): string {
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function addHoursToTime(startTime: string, hours: number): string {
  return timeFromMinutes(minutesFromTime(startTime) + Math.round(hours * 60));
}

export function durationHours(startTime?: string, endTime?: string): number {
  const start = normalizeShiftTime(startTime);
  const end = normalizeShiftTime(endTime);
  if (!start || !end) return 0;
  let minutes = minutesFromTime(end) - minutesFromTime(start);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatShiftTimeRange(startTime?: string, endTime?: string): string {
  const start = normalizeShiftTime(startTime);
  const end = normalizeShiftTime(endTime);
  if (!start || !end) return '';
  return `${start}–${end}`;
}

export function isGenericBandWindow(
  type: ShiftType | undefined,
  startTime?: string,
  endTime?: string
): boolean {
  if (!isRosterWorkShift(type)) return false;
  const start = normalizeShiftTime(startTime);
  const end = normalizeShiftTime(endTime);
  if (!start || !end) return false;
  return Object.values(DEFAULT_WINDOWS[type]).some(
    (window) => window.startTime === start && window.endTime === end
  );
}

export function defaultWindowForShift(
  type: ShiftType,
  hours: 8 | 12 = 8,
  worker?: Pick<Resource, 'entryTime' | 'exitTime'>
): { startTime?: string; endTime?: string; hours: number } {
  if (!isRosterWorkShift(type)) return { hours: 0 };

  const workerStart = normalizeShiftTime(worker?.entryTime);
  const workerEnd = normalizeShiftTime(worker?.exitTime);
  if (workerStart && workerEnd) {
    return {
      startTime: workerStart,
      endTime: workerEnd,
      hours: durationHours(workerStart, workerEnd) || hours,
    };
  }

  const preset = DEFAULT_WINDOWS[type][hours];
  return { ...preset, hours };
}

export function resolveShiftWindow(
  shift?: Pick<DailyShift, 'type' | 'hours' | 'startTime' | 'endTime'>,
  worker?: Pick<Resource, 'entryTime' | 'exitTime'>
): { startTime: string; endTime: string; hours: number } | null {
  if (!isRosterWorkShift(shift?.type)) return null;
  const startTime = normalizeShiftTime(shift?.startTime);
  const endTime = normalizeShiftTime(shift?.endTime);
  const requestedHours = Number(shift?.hours) === 12 ? 12 : 8;
  const workerWindow = defaultWindowForShift(shift.type, requestedHours, worker);
  const storedIsGeneric = isGenericBandWindow(shift.type, startTime, endTime);
  const hasWorkerHours = !!(normalizeShiftTime(worker?.entryTime) && normalizeShiftTime(worker?.exitTime));

  if (startTime && endTime && !(storedIsGeneric && hasWorkerHours)) {
    return { startTime, endTime, hours: durationHours(startTime, endTime) || Number(shift?.hours) || 8 };
  }
  if (workerWindow.startTime && workerWindow.endTime) {
    return { startTime: workerWindow.startTime, endTime: workerWindow.endTime, hours: workerWindow.hours };
  }
  return null;
}

/** Hour H (0-23) is covered if the person is present during [H:00, H+1:00). */
export function shiftCoversHour(
  startTime: string,
  endTime: string,
  hour: number
): boolean {
  const start = minutesFromTime(startTime);
  let end = minutesFromTime(endTime);
  const hourStart = hour * 60;
  if (end <= start) end += 24 * 60;
  const candidates = [hourStart, hourStart + 24 * 60];
  return candidates.some((value) => value >= start && value < end);
}

export function coveredHours(startTime: string, endTime: string): number[] {
  return ROSTER_HOURS.filter((hour) => shiftCoversHour(startTime, endTime, hour));
}

export function buildShiftForType(
  date: string,
  type: ShiftType,
  worker?: Pick<Resource, 'entryTime' | 'exitTime'>,
  previous?: Pick<DailyShift, 'type' | 'hours' | 'startTime' | 'endTime'>
): DailyShift {
  if (!isRosterWorkShift(type)) {
    return { date, type, hours: 0 };
  }

  const prevStart = normalizeShiftTime(previous?.startTime);
  const prevEnd = normalizeShiftTime(previous?.endTime);
  const prevIsGeneric =
    !!previous &&
    isRosterWorkShift(previous.type) &&
    isGenericBandWindow(previous.type, prevStart, prevEnd);

  if (prevStart && prevEnd && isRosterWorkShift(previous?.type) && !prevIsGeneric) {
    return {
      date,
      type,
      hours: durationHours(prevStart, prevEnd) || Number(previous?.hours) || 8,
      startTime: prevStart,
      endTime: prevEnd,
    };
  }

  const window = defaultWindowForShift(type, 8, worker);
  return {
    date,
    type,
    hours: window.hours || 8,
    startTime: window.startTime,
    endTime: window.endTime,
  };
}
