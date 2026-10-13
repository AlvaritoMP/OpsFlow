import type {
  UnitWorkPlan,
  WorkPlanActivity,
  WorkPlanFrequency,
  WorkPlanPerson,
  WorkPlanShift,
  WorkPlanSlot,
} from '../types';

export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const WEEKDAY_OPTIONS: { value: number; short: string; label: string }[] = [
  { value: 1, short: 'L', label: 'Lunes' },
  { value: 2, short: 'M', label: 'Martes' },
  { value: 3, short: 'X', label: 'Miércoles' },
  { value: 4, short: 'J', label: 'Jueves' },
  { value: 5, short: 'V', label: 'Viernes' },
  { value: 6, short: 'S', label: 'Sábado' },
  { value: 0, short: 'D', label: 'Domingo' },
];

export const FREQUENCY_OPTIONS: {
  value: WorkPlanFrequency;
  label: string;
  hint: string;
  chip: string;
}[] = [
  {
    value: 'diaria',
    label: 'Diaria',
    hint: 'Cada día que opera el turno',
    chip: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  {
    value: 'rutinaria',
    label: 'Rutinaria',
    hint: 'Parte fija del servicio',
    chip: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  {
    value: 'semanal',
    label: 'Semanal',
    hint: 'Solo los días que marque',
    chip: 'bg-amber-50 text-amber-900 border-amber-200',
  },
  {
    value: 'semana',
    label: 'De la semana',
    hint: 'Solo mientras este plan esté vigente',
    chip: 'bg-rose-50 text-rose-800 border-rose-200',
  },
];

export const SHIFT_PRESETS: { name: string; ranges: [string, string][] }[] = [
  { name: 'Mañana', ranges: [['06:00', '09:30'], ['09:45', '13:00']] },
  { name: 'Tarde', ranges: [['13:00', '17:00'], ['17:00', '21:00']] },
  { name: 'Noche', ranges: [['21:00', '01:00'], ['01:00', '06:00']] },
  { name: 'Jornada', ranges: [['08:00', '13:00'], ['14:00', '18:00']] },
];

export function newWorkPlanId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `wp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function frequencyMeta(frequency: WorkPlanFrequency) {
  return FREQUENCY_OPTIONS.find((item) => item.value === frequency) || FREQUENCY_OPTIONS[0];
}

export function sortWeekdays(days: number[]): number[] {
  const set = new Set(days.filter((day) => day >= 0 && day <= 6));
  return WEEK_ORDER.filter((day) => set.has(day));
}

export function weekdayShort(days: number[]): string {
  return sortWeekdays(days)
    .map((day) => WEEKDAY_OPTIONS.find((item) => item.value === day)?.short || '')
    .filter(Boolean)
    .join(' ');
}

export function formatClock(hhmm: string): string {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return hhmm || '';
  let hour = Number(hhmm.slice(0, 2));
  const minutes = hhmm.slice(3);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${String(hour).padStart(2, '0')}:${minutes} ${suffix}`;
}

export function formatTimeRange(start: string, end: string): string {
  if (!start || !end) return 'Horario sin definir';
  const overnight = end < start;
  return `${formatClock(start)} / ${formatClock(end)}${overnight ? ' (+1)' : ''}`;
}

export function addMinutes(hhmm: string, minutes: number): string {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return '08:00';
  const base = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  const total = ((base + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function makeSlot(startTime: string, endTime: string): WorkPlanSlot {
  return { id: newWorkPlanId(), startTime, endTime, activities: [] };
}

export function makeShift(name: string, ranges: [string, string][]): WorkPlanShift {
  return {
    id: newWorkPlanId(),
    name,
    people: [],
    slots: ranges.map(([start, end]) => makeSlot(start, end)),
  };
}

export function uniqueShiftName(existing: string[], name: string): string {
  const taken = new Set(existing.map((item) => item.trim().toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  let index = 2;
  while (taken.has(`${name} ${index}`.toLowerCase())) index += 1;
  return `${name} ${index}`;
}

export function exampleShifts(unitClass?: string): WorkPlanShift[] {
  if (unitClass === 'BPO') {
    return [makeShift('Jornada', [['08:00', '13:00'], ['14:00', '18:00']])];
  }
  return [
    makeShift('Mañana', [['06:00', '09:30'], ['09:45', '13:00']]),
    makeShift('Tarde', [['13:00', '17:00'], ['17:00', '21:00']]),
    makeShift('Noche', [['21:00', '01:00'], ['01:00', '06:00']]),
  ];
}

export function emptyActivity(): WorkPlanActivity {
  return {
    id: newWorkPlanId(),
    text: '',
    frequency: 'diaria',
    weekdays: [],
    personIds: [],
  };
}

export function emptyPlan(unitId: string, unitName: string): UnitWorkPlan {
  const now = new Date().toISOString();
  const title = unitName ? `Plan de trabajo ${unitName}` : 'Plan de trabajo';
  return {
    id: '',
    unitId,
    title: title.slice(0, 140),
    validFrom: null,
    validUntil: null,
    notes: '',
    status: 'draft',
    shifts: [],
    createdAt: now,
    updatedAt: now,
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseActivity(raw: unknown): WorkPlanActivity | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const frequency = row.frequency;
  const allowed: WorkPlanFrequency[] = ['diaria', 'rutinaria', 'semanal', 'semana'];
  const weekdays = Array.isArray(row.weekdays)
    ? row.weekdays.map(Number).filter((day) => Number.isInteger(day))
    : [];
  const personIds = Array.isArray(row.personIds) ? row.personIds.filter((id): id is string => typeof id === 'string' && !!id) : [];
  return {
    id: asString(row.id) || newWorkPlanId(),
    text: asString(row.text),
    frequency: allowed.includes(frequency as WorkPlanFrequency) ? (frequency as WorkPlanFrequency) : 'diaria',
    weekdays: sortWeekdays(weekdays),
    personIds,
    zone: asString(row.zone).trim() || undefined,
  };
}

function parsePerson(raw: unknown): WorkPlanPerson | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const name = asString(row.name).trim();
  if (!name) return null;
  return {
    id: asString(row.id) || newWorkPlanId(),
    resourceId: asString(row.resourceId) || undefined,
    name,
    role: asString(row.role).trim() || undefined,
  };
}

function parseSlot(raw: unknown): WorkPlanSlot | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const activities = Array.isArray(row.activities)
    ? row.activities.map(parseActivity).filter((item): item is WorkPlanActivity => item !== null)
    : [];
  return {
    id: asString(row.id) || newWorkPlanId(),
    startTime: asString(row.startTime),
    endTime: asString(row.endTime),
    activities,
  };
}

function parseShift(raw: unknown): WorkPlanShift | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const people = Array.isArray(row.people)
    ? row.people.map(parsePerson).filter((item): item is WorkPlanPerson => item !== null)
    : [];
  const slots = Array.isArray(row.slots)
    ? row.slots.map(parseSlot).filter((item): item is WorkPlanSlot => item !== null)
    : [];
  return {
    id: asString(row.id) || newWorkPlanId(),
    name: asString(row.name).trim() || 'Turno',
    people,
    slots,
  };
}

export function parseShifts(raw: unknown): WorkPlanShift[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseShift).filter((item): item is WorkPlanShift => item !== null);
}

export function knownPersonIds(shift: WorkPlanShift): Set<string> {
  return new Set(shift.people.map((person) => person.id));
}

export function sanitizePlan(plan: UnitWorkPlan): UnitWorkPlan {
  return {
    ...plan,
    title: plan.title.trim(),
    notes: plan.notes?.trim() || '',
    shifts: plan.shifts.map((shift) => {
      const people = shift.people
        .map((person) => ({ ...person, name: person.name.trim(), role: person.role?.trim() || undefined }))
        .filter((person) => person.name);
      const ids = new Set(people.map((person) => person.id));
      return {
        ...shift,
        name: shift.name.trim(),
        people,
        slots: shift.slots.map((slot) => ({
          ...slot,
          activities: slot.activities
            .filter((activity) => activity.text.trim())
            .map((activity) => ({
              ...activity,
              text: activity.text.trim(),
              weekdays: activity.frequency === 'semanal' ? sortWeekdays(activity.weekdays) : [],
              personIds: activity.personIds.filter((id) => ids.has(id)),
              zone: activity.zone?.trim() || undefined,
            })),
        })),
      };
    }),
  };
}

export function validatePlan(plan: UnitWorkPlan): string | null {
  if (!plan.title.trim()) return 'Escriba un nombre para el plan.';
  for (const shift of plan.shifts) {
    if (!shift.name.trim()) return 'Cada turno necesita un nombre.';
    for (const slot of shift.slots) {
      if (!slot.startTime || !slot.endTime) {
        return `Complete el horario en el turno ${shift.name.trim() || 'sin nombre'}.`;
      }
      if (slot.startTime === slot.endTime) {
        return `La hora de inicio y de fin no pueden ser iguales en ${shift.name.trim()}.`;
      }
      for (const activity of slot.activities) {
        if (!activity.text.trim()) return 'Complete o elimine las actividades que están vacías.';
        if (activity.frequency === 'semanal' && activity.weekdays.length === 0) {
          return `«${activity.text.trim()}» es semanal: marque al menos un día.`;
        }
      }
    }
  }
  return null;
}

export function audienceLabel(activity: WorkPlanActivity, people: WorkPlanPerson[]): string {
  const names = activity.personIds
    .map((id) => people.find((person) => person.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return 'Todo el turno';
  return names.join(', ');
}

export function appliesOnDay(activity: WorkPlanActivity, day: number): boolean {
  if (activity.frequency === 'semanal') return activity.weekdays.includes(day);
  return true;
}

export interface CronogramaRow {
  shiftId: string;
  shiftName: string;
  startTime: string;
  range: string;
  who: string;
  activity: WorkPlanActivity;
}

export function cronogramaRows(plan: UnitWorkPlan, day: number): CronogramaRow[] {
  const rows: CronogramaRow[] = [];
  for (const shift of plan.shifts) {
    for (const slot of shift.slots) {
      for (const activity of slot.activities) {
        if (!activity.text.trim() || !appliesOnDay(activity, day)) continue;
        rows.push({
          shiftId: shift.id,
          shiftName: shift.name,
          startTime: slot.startTime,
          range: formatTimeRange(slot.startTime, slot.endTime),
          who: audienceLabel(activity, shift.people),
          activity,
        });
      }
    }
  }
  return rows.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.shiftName.localeCompare(b.shiftName, 'es'));
}

export function semanalMissingDays(plan: UnitWorkPlan): { shiftName: string; text: string }[] {
  const missing: { shiftName: string; text: string }[] = [];
  for (const shift of plan.shifts) {
    for (const slot of shift.slots) {
      for (const activity of slot.activities) {
        if (activity.frequency === 'semanal' && activity.text.trim() && activity.weekdays.length === 0) {
          missing.push({ shiftName: shift.name, text: activity.text.trim() });
        }
      }
    }
  }
  return missing;
}

export function duplicatePlan(plan: UnitWorkPlan): UnitWorkPlan {
  const now = new Date().toISOString();
  return {
    ...plan,
    id: '',
    title: `Copia de ${plan.title}`.slice(0, 140),
    status: 'draft',
    shifts: plan.shifts.map(remapShift),
    createdAt: now,
    updatedAt: now,
  };
}

function remapShift(shift: WorkPlanShift): WorkPlanShift {
  const idMap = new Map<string, string>();
  const people = shift.people.map((person) => {
    const id = newWorkPlanId();
    idMap.set(person.id, id);
    return { ...person, id };
  });
  return {
    id: newWorkPlanId(),
    name: shift.name,
    people,
    slots: shift.slots.map((slot) => ({
      ...slot,
      id: newWorkPlanId(),
      activities: slot.activities.map((activity) => ({
        ...activity,
        id: newWorkPlanId(),
        weekdays: [...activity.weekdays],
        personIds: activity.personIds
          .map((id) => idMap.get(id))
          .filter((id): id is string => Boolean(id)),
      })),
    })),
  };
}

export function countActivities(plan: UnitWorkPlan): number {
  return plan.shifts.reduce(
    (sum, shift) => sum + shift.slots.reduce((inner, slot) => inner + slot.activities.filter((activity) => activity.text.trim()).length, 0),
    0,
  );
}
