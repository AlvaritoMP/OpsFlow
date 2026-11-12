import { supabase } from './supabase';
import { buildQuoteView, normalizeQuotePayload, QuoteProposalPayload } from '../utils/quoteProposal';

const db = supabase as unknown as {
  from: (table: string) => any;
};

export type QuoteStatus = 'draft' | 'issued' | 'void';

export type QuoteVersionAction = 'issued' | 'reopened' | 'void';

export interface QuoteVersion {
  id: string;
  quoteId: string;
  versionNo: number;
  action: QuoteVersionAction;
  actorName?: string;
  summary: string;
  laborTotal?: number;
  grandTotal?: number;
  totalWithIgv?: number;
  createdAt: string;
}

export interface QuoteActor {
  id: string;
  name: string;
}

export interface QuoteRecord {
  id: string;
  code: string;
  clientName: string;
  serviceName: string;
  status: QuoteStatus;
  payload: QuoteProposalPayload;
  laborTotal: number;
  operationalTotal: number;
  adminTotal: number;
  profitTotal: number;
  grandTotal: number;
  totalWithIgv: number;
  createdByName?: string;
  updatedByName?: string;
  issuedAt?: string;
  issuedByName?: string;
  createdAt: string;
  updatedAt: string;
}

export class QuoteStorageError extends Error {
  code: 'missing_table' | 'duplicate' | 'unknown';
  constructor(code: QuoteStorageError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export async function listQuotes(): Promise<QuoteRecord[]> {
  const { data, error } = await db.from('commercial_quotes').select('*').order('updated_at', { ascending: false }).limit(300);
  if (error) throw mapError(error);
  return (data || []).map(mapRecord);
}

export async function saveQuote(input: {
  id?: string;
  code: string;
  clientName: string;
  payload: QuoteProposalPayload;
  actor: QuoteActor;
}): Promise<QuoteRecord> {
  const payload = normalizeQuotePayload(input.payload);
  const view = buildQuoteView(payload);
  const now = new Date().toISOString();
  const row = {
    code: input.code.trim(),
    client_name: input.clientName.trim(),
    service_name: payload.model.serviceLabel.trim() || 'Servicio',
    payload,
    labor_total: roundMoney(view.computed.laborTotal),
    grand_total: roundMoney(view.computed.grandTotal),
    total_with_igv: roundMoney(view.computed.totalWithIgv),
    updated_by: input.actor.id || null,
    updated_by_name: input.actor.name,
    updated_at: now,
  };
  if (!row.code) throw new Error('Indique el código de la propuesta.');
  if (!row.client_name) throw new Error('Indique el cliente.');
  const query = input.id
    ? db.from('commercial_quotes').update(row).eq('id', input.id).select('*').single()
    : db
        .from('commercial_quotes')
        .insert({
          ...row,
          status: 'draft',
          created_by: input.actor.id || null,
          created_by_name: input.actor.name,
        })
        .select('*')
        .single();
  const { data, error } = await query;
  if (error) throw mapError(error);
  return mapRecord(data);
}

export async function setQuoteStatus(id: string, status: QuoteStatus, actor: QuoteActor): Promise<QuoteRecord> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    updated_by: actor.id || null,
    updated_by_name: actor.name,
    updated_at: now,
  };
  if (status === 'issued') {
    patch.issued_at = now;
    patch.issued_by_name = actor.name;
  }
  if (status === 'draft') {
    patch.issued_at = null;
    patch.issued_by_name = null;
  }
  const { data, error } = await db.from('commercial_quotes').update(patch).eq('id', id).select('*').single();
  if (error) throw mapError(error);
  return mapRecord(data);
}

export async function listQuoteVersions(quoteId: string): Promise<QuoteVersion[]> {
  const { data, error } = await db
    .from('commercial_quote_versions')
    .select('id, quote_id, version_no, action, actor_name, summary, labor_total, grand_total, total_with_igv, created_at')
    .eq('quote_id', quoteId)
    .order('version_no', { ascending: false });
  if (error) {
    if (isMissingVersions(error)) return [];
    throw mapError(error);
  }
  return (data || []).map(mapVersion);
}

export async function recordQuoteVersion(input: {
  quoteId: string;
  action: QuoteVersionAction;
  actor: QuoteActor;
  summary: string;
  laborTotal?: number;
  grandTotal?: number;
  totalWithIgv?: number;
  payload?: QuoteProposalPayload | null;
}): Promise<void> {
  const { data: last, error: readError } = await db
    .from('commercial_quote_versions')
    .select('version_no')
    .eq('quote_id', input.quoteId)
    .order('version_no', { ascending: false })
    .limit(1);
  if (readError) {
    if (isMissingVersions(readError)) throw missingVersionsError();
    throw mapError(readError);
  }
  const versionNo = (Number(last?.[0]?.version_no) || 0) + 1;
  const { error } = await db.from('commercial_quote_versions').insert({
    quote_id: input.quoteId,
    version_no: versionNo,
    action: input.action,
    actor_id: input.actor.id || null,
    actor_name: input.actor.name,
    summary: input.summary,
    labor_total: input.laborTotal == null ? null : roundMoney(input.laborTotal),
    grand_total: input.grandTotal == null ? null : roundMoney(input.grandTotal),
    total_with_igv: input.totalWithIgv == null ? null : roundMoney(input.totalWithIgv),
    payload: input.action === 'issued' ? input.payload || null : null,
  });
  if (error) {
    if (isMissingVersions(error)) throw missingVersionsError();
    throw mapError(error);
  }
}

export async function deleteQuote(id: string): Promise<void> {
  const { error } = await db.from('commercial_quotes').delete().eq('id', id);
  if (error) throw mapError(error);
}

function mapRecord(row: any): QuoteRecord {
  const payload = normalizeQuotePayload(row.payload);
  let computed: ReturnType<typeof buildQuoteView>['computed'] | null = null;
  try {
    computed = buildQuoteView(payload).computed;
  } catch {
    computed = null;
  }
  return {
    id: row.id,
    code: row.code,
    clientName: row.client_name,
    serviceName: row.service_name,
    status: row.status,
    payload,
    laborTotal: computed?.laborTotal ?? (Number(row.labor_total) || 0),
    operationalTotal: computed?.operationalTotal ?? 0,
    adminTotal: computed?.adminTotal ?? 0,
    profitTotal: computed?.profitAmount ?? 0,
    grandTotal: computed?.grandTotal ?? (Number(row.grand_total) || 0),
    totalWithIgv: computed?.totalWithIgv ?? (Number(row.total_with_igv) || 0),
    createdByName: row.created_by_name || undefined,
    updatedByName: row.updated_by_name || undefined,
    issuedAt: row.issued_at || undefined,
    issuedByName: row.issued_by_name || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row: any): QuoteVersion {
  const action = row.action === 'reopened' || row.action === 'void' ? row.action : 'issued';
  return {
    id: row.id,
    quoteId: row.quote_id,
    versionNo: Number(row.version_no) || 0,
    action,
    actorName: row.actor_name || undefined,
    summary: String(row.summary || ''),
    laborTotal: row.labor_total == null ? undefined : Number(row.labor_total),
    grandTotal: row.grand_total == null ? undefined : Number(row.grand_total),
    totalWithIgv: row.total_with_igv == null ? undefined : Number(row.total_with_igv),
    createdAt: row.created_at,
  };
}

function isMissingVersions(error: any): boolean {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return error?.code === '42P01' || /commercial_quote_versions|schema cache|does not exist/i.test(message);
}

function missingVersionsError(): Error {
  return new QuoteStorageError(
    'missing_table',
    'Falta el historial de propuestas. Ejecute migrations/MIGRATION_COMMERCIAL_QUOTE_VERSIONS.sql en Supabase.'
  );
}

function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function mapError(error: any): Error {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  if (error?.code === '42P01' || /commercial_quotes|schema cache|does not exist/i.test(message)) {
    return new QuoteStorageError(
      'missing_table',
      'Falta la tabla de propuestas. Ejecute migrations/MIGRATION_COMMERCIAL_QUOTES.sql en Supabase.'
    );
  }
  if (error?.code === '23505' || /duplicate key/i.test(message)) {
    return new QuoteStorageError('duplicate', 'Ya existe una propuesta con ese código. Cámbielo e intente de nuevo.');
  }
  return new QuoteStorageError('unknown', error?.message || 'No se pudo guardar la propuesta.');
}
