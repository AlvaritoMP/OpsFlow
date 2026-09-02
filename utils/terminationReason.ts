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

export function splitTerminationReason(reason?: string | null): { preset: string; other: string } {
  const trimmed = reason?.trim() || '';
  if (!trimmed) return { preset: '', other: '' };
  if (PRESET_SET.has(trimmed)) return { preset: trimmed, other: '' };
  return { preset: 'Otro', other: trimmed };
}

export function buildTerminationReason(preset: string, other: string): string {
  if (preset === 'Otro') return other.trim();
  return preset.trim();
}

export function isTerminationReasonComplete(preset: string, other: string): boolean {
  return Boolean(buildTerminationReason(preset, other));
}
