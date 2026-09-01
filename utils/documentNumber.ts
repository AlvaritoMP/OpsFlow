/** Documento de identidad del trabajador: DNI, CE o pasaporte (puede incluir letras). */
export const MAX_DOCUMENT_NUMBER_LENGTH = 15;
export const MIN_PUBLIC_FICHA_DOCUMENT_LENGTH = 5;

export type FichaDocumentType = 'DNI' | 'CE' | 'Pasaporte';

/** Quita espacios y signos, deja letras y números, y pasa a mayúsculas. */
export function normalizeDocumentNumber(value: string | null | undefined): string {
  return (value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_DOCUMENT_NUMBER_LENGTH);
}

export function isValidPublicFichaDocument(value: string | null | undefined): boolean {
  const doc = normalizeDocumentNumber(value);
  return doc.length >= MIN_PUBLIC_FICHA_DOCUMENT_LENGTH;
}

export function inferDocumentType(value: string | null | undefined): FichaDocumentType {
  const doc = normalizeDocumentNumber(value);
  if (/[A-Z]/.test(doc)) return 'Pasaporte';
  if (/^\d{8}$/.test(doc)) return 'DNI';
  if (/^\d{9}$/.test(doc)) return 'CE';
  return 'DNI';
}

export function documentNumbersMatch(
  a?: string | null,
  b?: string | null,
): boolean {
  const left = normalizeDocumentNumber(a);
  const right = normalizeDocumentNumber(b);
  return Boolean(left && right && left === right);
}
