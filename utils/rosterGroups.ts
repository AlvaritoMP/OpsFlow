import { DailyShift, Resource } from '../types';

export type RosterShiftGroupKey = 'supervision' | 'day' | 'afternoon' | 'night' | 'other' | 'none';

export interface RosterShiftGroup {
  key: RosterShiftGroupKey;
  label: string;
  order: number;
}

export interface RosterDayShiftCounts {
  programmed: number;
  day: number;
  afternoon: number;
  night: number;
  off: number;
  vacation: number;
}

export const isProgrammedWorkShift = (type?: string) =>
  type === 'Day' || type === 'Afternoon' || type === 'Night';

export const rosterShiftShortLabel = (type: string) =>
  type === 'Day' ? 'Dia' : type === 'Afternoon' ? 'Tar' : type === 'Night' ? 'Noc' : type === 'Vacation' ? 'Vac' : type;

const normalizePuestoKey = (value?: string) =>
  (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Supervisor, similares (jefe de turno, coordinador) o superiores (gerente, director). */
export const isSupervisorOrHigherPuesto = (puesto?: string): boolean => {
  const puestoKey = normalizePuestoKey(puesto);
  if (!puestoKey) return false;
  if (['auxiliar', 'asistente', 'ayudante', 'practicante'].some((word) => puestoKey.includes(word))) {
    return false;
  }
  return ['supervisor', 'jefe', 'coordinador', 'gerente', 'superintendente', 'director'].some((word) =>
    puestoKey.includes(word)
  );
};

export const getRosterShiftGroup = (
  worker: Pick<Resource, 'assignedShift' | 'puesto'>
): RosterShiftGroup => {
  if (isSupervisorOrHigherPuesto(worker.puesto)) {
    return { key: 'supervision', label: 'Supervisión', order: 0 };
  }
  const shift = (worker.assignedShift || '').trim().toLowerCase();
  if (!shift) return { key: 'none', label: 'Sin turno', order: 5 };
  if (shift.includes('diurno') || shift === 'day' || shift.includes('mañana') || shift.includes('manana')) {
    return { key: 'day', label: 'Diurno', order: 1 };
  }
  if (shift.includes('tarde') || shift === 'afternoon') {
    return { key: 'afternoon', label: 'Tarde', order: 2 };
  }
  if (shift.includes('nocturno') || shift === 'night' || shift.includes('noche')) {
    return { key: 'night', label: 'Nocturno', order: 3 };
  }
  return { key: 'other', label: worker.assignedShift!.trim(), order: 4 };
};

export const rosterShiftGroupsMatch = (
  a: { key: RosterShiftGroupKey; label: string },
  b: { key: RosterShiftGroupKey; label: string }
) => a.key === b.key && (a.key !== 'other' || a.label === b.label);

export const workerCountLabel = (n: number) => `${n} trabajador${n === 1 ? '' : 'es'}`;

export const countRosterShiftsForDate = (
  workers: Array<Pick<Resource, 'workSchedule'>>,
  dateStr: string
): RosterDayShiftCounts => {
  const counts: RosterDayShiftCounts = { programmed: 0, day: 0, afternoon: 0, night: 0, off: 0, vacation: 0 };
  for (const worker of workers) {
    const type = worker.workSchedule?.find((s) => s.date === dateStr)?.type || 'OFF';
    if (type === 'Day') {
      counts.day += 1;
      counts.programmed += 1;
    } else if (type === 'Afternoon') {
      counts.afternoon += 1;
      counts.programmed += 1;
    } else if (type === 'Night') {
      counts.night += 1;
      counts.programmed += 1;
    } else if (type === 'Vacation') {
      counts.vacation += 1;
    } else {
      counts.off += 1;
    }
  }
  return counts;
};

export const toLocalDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const shiftOnDate = (schedule: DailyShift[] | undefined, dateStr: string) =>
  schedule?.find((shift) => shift.date === dateStr);
