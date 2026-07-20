/**
 * Formato de fechas de UI OpsFlow (Perú): dd/mm/yyyy
 * Almacenamiento / API: yyyy-MM-dd
 */

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

/** yyyy-MM-dd → dd/mm/yyyy */
export function formatDateDisplay(iso: string | null | undefined): string {
  if (!iso?.trim()) return '';
  const m = iso.trim().match(ISO_RE);
  if (!m) return iso;
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
