import {
  SupervisionCategory,
  SupervisionFrequency,
  SupervisionVisitDays,
  SupervisionWeekdayKey,
} from '../types';

export const EMPTY_VISIT_DAYS: SupervisionVisitDays = {
  mon: false,
  tue: false,
  wed: false,
  thu: false,
  fri: false,
  sat: false,
  sun: false,
};

export const WEEKDAYS: Array<{
  key: SupervisionWeekdayKey;
  iso: number;
  short: string;
  label: string;
}> = [
  { key: 'mon', iso: 1, short: 'Lun', label: 'Lunes' },
  { key: 'tue', iso: 2, short: 'Mar', label: 'Martes' },
  { key: 'wed', iso: 3, short: 'Mié', label: 'Miércoles' },
  { key: 'thu', iso: 4, short: 'Jue', label: 'Jueves' },
  { key: 'fri', iso: 5, short: 'Vie', label: 'Viernes' },
  { key: 'sat', iso: 6, short: 'Sáb', label: 'Sábado' },
  { key: 'sun', iso: 7, short: 'Dom', label: 'Domingo' },
];

export const SUPERVISION_FREQUENCIES: Array<{ value: SupervisionFrequency; label: string }> = [
  { value: 'SEMANAL', label: 'Semanal' },
  { value: 'QUINCENAL', label: 'Quincenal' },
  { value: 'MENSUAL', label: 'Mensual' },
  { value: 'PERMANENTE', label: 'Permanente' },
  { value: 'PREVIA_COORDINACION', label: 'Previa coordinación' },
  { value: 'CUANDO_SE_REQUIERA', label: 'Cuando se requiera' },
  { value: 'SEGUN_RUTA', label: 'Según ruta' },
  { value: 'POR_CONFIRMAR', label: 'Por confirmar' },
  { value: 'NINGUNO', label: 'Ninguno' },
];

export const SUPERVISION_CATEGORIES: Array<{
  value: SupervisionCategory;
  label: string;
  badge: string;
  dot: string;
}> = [
  { value: 'ALTA', label: 'Alta', badge: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  { value: 'MEDIA', label: 'Media', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  { value: 'BAJA', label: 'Baja', badge: 'bg-slate-200 text-slate-700', dot: 'bg-slate-400' },
];

export function weekdayKeyFromIso(iso: number): SupervisionWeekdayKey {
  return WEEKDAYS.find((d) => d.iso === iso)?.key ?? 'mon';
}

export function isoWeekdayFromDate(date: Date): number {
  const js = date.getDay(); // 0=domingo
  return js === 0 ? 7 : js;
}

export function formatDateYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseYmd(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function mondayOf(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const iso = isoWeekdayFromDate(copy);
  copy.setDate(copy.getDate() - (iso - 1));
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function weekDates(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => formatDateYmd(addDays(weekStart, i)));
}

export function monthDates(year: number, monthIndex: number): string[] {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => formatDateYmd(new Date(year, monthIndex, i + 1)));
}

export function formatMonthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
}

export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function frequencyAppliesToDate(frequency: SupervisionFrequency, visitDate: Date): boolean {
  switch (frequency) {
    case 'SEMANAL':
    case 'PERMANENTE':
      return true;
    case 'QUINCENAL':
      return isoWeekNumber(visitDate) % 2 === 0;
    case 'MENSUAL': {
      const iso = isoWeekdayFromDate(visitDate);
      const first = new Date(visitDate.getFullYear(), visitDate.getMonth(), 1);
      while (isoWeekdayFromDate(first) !== iso) {
        first.setDate(first.getDate() + 1);
      }
      return formatDateYmd(first) === formatDateYmd(visitDate);
    }
    default:
      return false;
  }
}

export function frequencyLabel(frequency: SupervisionFrequency): string {
  return SUPERVISION_FREQUENCIES.find((f) => f.value === frequency)?.label ?? frequency;
}

export function categoryStyle(category?: SupervisionCategory) {
  return SUPERVISION_CATEGORIES.find((c) => c.value === category) ?? SUPERVISION_CATEGORIES[1];
}

export function normalizeVisitDays(raw: unknown): SupervisionVisitDays {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    mon: Boolean(src.mon),
    tue: Boolean(src.tue),
    wed: Boolean(src.wed),
    thu: Boolean(src.thu),
    fri: Boolean(src.fri),
    sat: Boolean(src.sat),
    sun: Boolean(src.sun),
  };
}

export function visitDaysForIso(days: SupervisionVisitDays, iso: number): boolean {
  return Boolean(days[weekdayKeyFromIso(iso)]);
}

export function isTheoreticallyExpected(
  assignment: {
    isActive: boolean;
    supervisorStaffId?: string;
    visitDays: SupervisionVisitDays;
    restWeekday: number;
    frequency: SupervisionFrequency;
  },
  date: Date
): boolean {
  if (!assignment.isActive || !assignment.supervisorStaffId) return false;
  const iso = isoWeekdayFromDate(date);
  if (iso === assignment.restWeekday) return false;
  if (!visitDaysForIso(assignment.visitDays, iso)) return false;
  return frequencyAppliesToDate(assignment.frequency, date);
}

export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${weekStart.toLocaleDateString('es-PE', opts)} – ${end.toLocaleDateString('es-PE', { ...opts, year: 'numeric' })}`;
}

export function formatDateFull(dateStr: string): string {
  const date = parseYmd(dateStr);
  return date.toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

export function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /does not exist|schema cache|supervision_assignments|supervision_visits|supervision_routes/i.test(message);
}
