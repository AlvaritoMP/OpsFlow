/**
 * Formato de fechas de UI OpsFlow (Perú): dd/mm/yyyy
 * Almacenamiento / API: yyyy-MM-dd
 */

export const APP_DATE_LOCALE = 'es-PE';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
/** También acepta el formato histórico dd-MM-yyyy (HR/Opalosis UI) */
const DISPLAY_HYPHEN_RE = /^(\d{2})-(\d{2})-(\d{4})$/;

export function isValidIsoDate(iso: string): boolean {
  const m = iso?.trim().match(ISO_RE);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** yyyy-MM-dd (o ISO datetime) → dd/mm/yyyy */
export function formatDateDisplay(iso: string | null | undefined): string {
  if (!iso?.trim()) return '';
  const dateOnly = iso.trim().slice(0, 10);
  const m = dateOnly.match(ISO_RE);
  if (!m) return iso.trim();
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * dd/mm/yyyy | dd-MM-yyyy | yyyy-MM-dd → yyyy-MM-dd
 * Devuelve '' si vacío; null si el texto no es una fecha válida.
 */
export function parseDateInput(value: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return '';

  const iso = trimmed.match(ISO_RE);
  if (iso) return isValidIsoDate(trimmed) ? trimmed : null;

  const slash = trimmed.match(DISPLAY_RE);
  if (slash) {
    const [, dd, mm, yyyy] = slash;
    const out = `${yyyy}-${mm}-${dd}`;
    return isValidIsoDate(out) ? out : null;
  }

  const hyphen = trimmed.match(DISPLAY_HYPHEN_RE);
  if (hyphen) {
    const [, dd, mm, yyyy] = hyphen;
    const out = `${yyyy}-${mm}-${dd}`;
    return isValidIsoDate(out) ? out : null;
  }

  return null;
}

/** Aplica máscara parcial mientras se escribe (solo dígitos → dd/mm/yyyy). */
export function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

function isoToLocalDate(iso: string): Date | null {
  const m = iso.trim().match(ISO_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** yyyy-MM-dd (o ISO datetime) → fecha local dd/mm/yyyy con locale Perú. */
export function formatDateLocale(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTS
): string {
  if (!iso?.trim()) return '';
  const dateOnly = iso.trim().slice(0, 10);
  const local = isoToLocalDate(dateOnly);
  if (local) return local.toLocaleDateString(APP_DATE_LOCALE, options);
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(APP_DATE_LOCALE, options);
}

/** ISO datetime → dd/mm/yyyy hh:mm (locale Perú). */
export function formatDateTimeDisplay(isoDateTime: string | null | undefined): string {
  if (!isoDateTime?.trim()) return '';
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) return isoDateTime;
  return parsed.toLocaleString(APP_DATE_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
