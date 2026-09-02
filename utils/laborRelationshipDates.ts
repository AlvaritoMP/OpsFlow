import { ContractHistory, Resource } from '../types';

type ContractLike = Partial<ContractHistory> & {
  start_date?: string;
  end_date?: string;
  contract_number?: number;
};

function dateField(value?: string | null): string | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  return raw.includes('T') ? raw.slice(0, 10) : raw.slice(0, 10);
}

function contractStart(contract: ContractLike): string | undefined {
  return dateField(contract.startDate ?? contract.start_date);
}

function contractEnd(contract: ContractLike): string | undefined {
  return dateField(contract.endDate ?? contract.end_date);
}

function contractNumber(contract: ContractLike): number {
  return Number(contract.contractNumber ?? contract.contract_number ?? 0);
}

/**
 * Fechas que se muestran en Personal / reportes.
 * Fuente de verdad: ficha OpsFlow (registro en unidad o edición).
 * Las fechas del ATS (hireDate del paquete) son referenciales y no deben
 * sustituir el inicio/fin de contrato que definió el operador.
 * El historial de contratos solo se usa si la ficha no tiene esas fechas.
 */
export function getLaborRelationshipDisplayDates(
  worker: Pick<Resource, 'startDate' | 'endDate' | 'contractHistory'>,
  history?: ContractHistory[]
): { start?: string; end?: string } {
  const sourceHistory = history ?? worker.contractHistory ?? [];
  const sorted = [...sourceHistory].sort((a, b) => contractNumber(a) - contractNumber(b));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return {
    start: dateField(worker.startDate) || (first ? contractStart(first) : undefined),
    end: dateField(worker.endDate) || (last ? contractEnd(last) : undefined),
  };
}
