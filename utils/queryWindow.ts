/** Fechas locales (no UTC) para filtros de PostgREST. */

export const LIST_PAGE_SIZE = 50;

export function isoToday(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isoShiftDays(days: number, date = new Date()): string {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return isoToday(next);
}

export function monthBounds(date = new Date()): { from: string; to: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { from: isoToday(start), to: isoToday(end) };
}
