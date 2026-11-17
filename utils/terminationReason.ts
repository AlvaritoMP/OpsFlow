export const TERMINATION_REASON_PRESETS = [
  'Fin de contrato',
  'Renuncia voluntaria',
  'Despido',
  'Mutuo acuerdo',
  'Abandono de trabajo',
  'No renovación',
  'Término de obra o servicio',
  'Fallecimiento',
  'Otro',
] as const;

export type TerminationReasonPreset = (typeof TERMINATION_REASON_PRESETS)[number];

const PRESET_SET = new Set<string>(TERMINATION_REASON_PRESETS.filter((p) => p !== 'Otro'));

/** El detalle es obligatorio cuando la categoría sola no alcanza para entender el caso. */
export function terminationDetailRequired(preset: string): boolean {
  return preset === 'Renuncia voluntaria' || preset === 'Otro';
}

export function splitTerminationReason(reason?: string | null): { preset: string; other: string } {
  const trimmed = reason?.trim() || '';
  if (!trimmed) return { preset: '', other: '' };
  if (PRESET_SET.has(trimmed) || trimmed === 'Otro') return { preset: trimmed, other: '' };
  return { preset: 'Otro', other: trimmed };
}

/** Al abrir un cese antiguo, el texto que antes reemplazaba al motivo pasa al detalle. */
export function initialTerminationDetail(reason?: string | null, detail?: string | null): string {
  const saved = detail?.trim() || '';
  if (saved) return saved;
  return splitTerminationReason(reason).other;
}

/** La categoría que se mide. «Otro» se guarda como categoría, no como el texto libre. */
export function buildTerminationReason(preset: string): string {
  return preset.trim();
}

export function isTerminationReasonComplete(preset: string, detail: string): boolean {
  if (!preset.trim()) return false;
  if (terminationDetailRequired(preset) && !detail.trim()) return false;
  return true;
}

export function terminationReasonError(preset: string, detail: string): string | null {
  if (!preset.trim()) return 'Indique el motivo del cese.';
  if (preset === 'Renuncia voluntaria' && !detail.trim()) return 'Describa el motivo de la renuncia.';
  if (preset === 'Otro' && !detail.trim()) return 'Indique el detalle del motivo.';
  return null;
}

export function terminationDetailPlaceholder(preset: string): string {
  if (preset === 'Renuncia voluntaria') return 'Cuente el caso: estudios, otra oferta, mudanza, clima laboral...';
  if (preset === 'Otro') return 'Describa el motivo que no está en la lista...';
  return 'Opcional. Agregue el contexto de este cese.';
}
