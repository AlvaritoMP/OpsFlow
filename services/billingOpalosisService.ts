import { supabase } from './supabase';
import type { OpalosisRegistration } from '../utils/clientBillingCalc';

export interface RegisterBillingOsInput {
  billingId: string;
  opsflowCalculoId?: number;
  pesCode: string;
  osStartDate: string;
  osEndDate: string;
  documentoMaker: string;
  documentKind: string;
  workGroup: string;
  businessLine: string;
  opaloCompany: string;
  positionLabel: string;
  signedTotal: number;
  unitName: string;
  periodMonth: string;
}

function messageFrom(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, unknown>;
  const error = String(record.error || '').trim();
  const detail = String(record.detail || '').trim();
  if (error && detail && !error.includes(detail)) return `${error} ${detail}`.slice(0, 700);
  return error;
}

export async function registerBillingServiceOrder(input: RegisterBillingOsInput): Promise<OpalosisRegistration> {
  const { data, error } = await supabase.functions.invoke('billing-opalosis-os', {
    body: { action: 'register-os', ...input },
  });
  const fromBody = messageFrom(data);
  if (error || data?.ok === false) {
    let detail = fromBody;
    const context = error?.context as Response | undefined;
    if (!detail && context && typeof context.json === 'function') {
      try {
        detail = messageFrom(await context.clone().json());
      } catch {
        try {
          detail = (await context.clone().text()).trim().slice(0, 600);
        } catch {
          detail = '';
        }
      }
    }
    throw new Error(detail || error?.message || 'OpaloSis no registró la orden. La liquidación sigue en borrador.');
  }
  const registration = data?.registration as OpalosisRegistration | undefined;
  if (!registration?.ordenServicioId || !registration.numeroOrdenServicio) {
    throw new Error('OpaloSis no devolvió el número de la orden. La liquidación sigue en borrador.');
  }
  return registration;
}
