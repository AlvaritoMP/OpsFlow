import { normalizeDocumentNumber } from './documentNumber';

/** Catálogo fijo de Opalosis. No hay GET de motivos de cese. */
export const OPALOSIS_MOTIVOS_CESE = [
  { id: 1, label: 'Renuncia' },
  { id: 2, label: 'Despido o destitución' },
  { id: 3, label: 'Término de obra / servicio o vencimiento del plazo' },
  { id: 4, label: 'Mutuo disenso' },
  { id: 5, label: 'No se inició relación laboral' },
] as const;

const OBSERVACIONES_MAX = 250;

export interface RegistroCesePayload {
  Documento: string;
  MotivoCeseId: number | null;
  FechaCese: string;
  Observaciones: string | null;
  PayloadJson: string | null;
  UsuarioOf: string | null;
}

/** Quita un prefijo "DNI:" / "CE:" y deja el documento que Opalosis usa como clave. */
export function documentForOpalosis(value: string | null | undefined): string {
  const raw = (value || '').trim().replace(/^(dni|ce|pasaporte|passport)\s*[:\-]\s*/i, '');
  return normalizeDocumentNumber(raw);
}

export function mapTerminationReasonToMotivoCeseId(reason: string | null | undefined): number | null {
  const text = (reason || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!text) return null;
  if (text.includes('renuncia')) return 1;
  if (text.includes('despido') || text.includes('destitu')) return 2;
  if (
    text.includes('fin de contrato') ||
    text.includes('no renov') ||
    text.includes('termino de obra') ||
    text.includes('vencimiento')
  ) {
    return 3;
  }
  if (text.includes('mutuo')) return 4;
  if (text.includes('no se inicio') || text.includes('no inicio la relacion')) return 5;
  return null;
}

export function buildCeseObservaciones(
  terminationReason: string,
  personnelStatus: 'cesado' | 'archivado',
): string {
  const tipo = personnelStatus === 'archivado' ? 'Archivado en OpsFlow' : 'Cesado en OpsFlow';
  const reason = terminationReason.trim();
  const text = reason ? `${tipo}. Motivo: ${reason}` : tipo;
  return text.slice(0, OBSERVACIONES_MAX);
}

export function buildRegistroCesePayload(input: {
  documento: string;
  fechaCese: string;
  terminationReason: string;
  personnelStatus: 'cesado' | 'archivado';
  usuarioOf?: string | null;
  resourceId: string;
  unitId?: string | null;
}): RegistroCesePayload {
  const motivoCeseId = mapTerminationReasonToMotivoCeseId(input.terminationReason);
  const observaciones = buildCeseObservaciones(input.terminationReason, input.personnelStatus);
  const usuario = (input.usuarioOf || '').trim().slice(0, 120) || null;
  const payloadJson = JSON.stringify({
    origen: 'opsflow',
    resourceId: input.resourceId,
    unitId: input.unitId || null,
    personnelStatus: input.personnelStatus,
    terminationReason: input.terminationReason,
  });

  return {
    Documento: input.documento,
    MotivoCeseId: motivoCeseId,
    FechaCese: input.fechaCese,
    Observaciones: observaciones || null,
    PayloadJson: payloadJson,
    UsuarioOf: usuario,
  };
}
