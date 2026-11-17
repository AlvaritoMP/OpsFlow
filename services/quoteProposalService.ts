import { supabase } from './supabase';
import { buildQuoteView, normalizeQuotePayload, QuoteProposalPayload } from '../utils/quoteProposal';

const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type QuoteStatus = 'draft' | 'issued' | 'void';

export type QuoteFieldKind = 'text' | 'number' | 'category';

export interface QuoteField {
  id: string;
  label: string;
  kind: QuoteFieldKind;
  options: string[];
  position: number;
}

export type QuoteTracking = Record<string, string | number>;

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
  tracking: QuoteTracking;
  createdAt: string;
  updatedAt: string;
}

export class QuoteStorageError extends Error {
  code: 'missing_table' | 'duplicate' | 'unknown' | 'missing_tracking';
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

const TRACKING_MIGRATION = 'Falta el seguimiento de propuestas. Ejecute migrations/MIGRATION_COMMERCIAL_QUOTE_TRACKING.sql en Supabase.';

export async function listQuoteFields(): Promise<QuoteField[]> {
  const { data, error } = await db
    .from('commercial_quote_fields')
    .select('id, label, kind, options, position, created_at')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    if (isMissingFields(error)) throw new QuoteStorageError('missing_tracking', TRACKING_MIGRATION);
    throw mapError(error);
  }
  return (data || []).map(mapField);
}

export async function createQuoteField(input: {
  label: string;
  kind: QuoteFieldKind;
  options: string[];
  position: number;
}): Promise<QuoteField> {
  const label = input.label.trim();
  if (!label) throw new Error('Indique el nombre de la columna.');
  const kind: QuoteFieldKind = input.kind === 'number' || input.kind === 'category' ? input.kind : 'text';
  const { data, error } = await db
    .from('commercial_quote_fields')
    .insert({
      label,
      kind,
      options: kind === 'category' ? cleanOptions(input.options) : [],
      position: Number.isFinite(input.position) ? input.position : 0,
      updated_at: new Date().toISOString(),
    })
    .select('id, label, kind, options, position')
    .single();
  if (error) {
    if (isMissingFields(error)) throw new QuoteStorageError('missing_tracking', TRACKING_MIGRATION);
    throw mapError(error);
  }
  return mapField(data);
}

export async function updateQuoteField(id: string, input: { label: string; options: string[] }): Promise<QuoteField> {
  const label = input.label.trim();
  if (!label) throw new Error('Indique el nombre de la columna.');
  const { data, error } = await db
    .from('commercial_quote_fields')
    .update({
      label,
      options: cleanOptions(input.options),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, label, kind, options, position')
    .single();
  if (error) {
    if (isMissingFields(error)) throw new QuoteStorageError('missing_tracking', TRACKING_MIGRATION);
    throw mapError(error);
  }
  return mapField(data);
}

export async function deleteQuoteField(id: string): Promise<void> {
  const { error } = await db.from('commercial_quote_fields').delete().eq('id', id);
  if (error) {
    if (isMissingFields(error)) throw new QuoteStorageError('missing_tracking', TRACKING_MIGRATION);
    throw mapError(error);
  }
}

export async function reorderQuoteFields(ids: string[]): Promise<void> {
  const results = await Promise.all(
    ids.map((id, position) =>
      db.from('commercial_quote_fields').update({ position, updated_at: new Date().toISOString() }).eq('id', id)
    )
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    if (isMissingFields(failed.error)) throw new QuoteStorageError('missing_tracking', TRACKING_MIGRATION);
    throw mapError(failed.error);
  }
}

export async function saveQuoteTracking(quoteId: string, fieldId: string, value: string | number | null): Promise<void> {
  const payload = value == null || value === '' ? null : value;
  const { error } = await db.rpc('set_quote_tracking', {
    p_quote_id: quoteId,
    p_field_id: fieldId,
    p_value: payload,
  });
  if (!error) return;
  if (!isMissingRpc(error)) {
    if (isMissingTrackingColumn(error)) throw new QuoteStorageError('missing_tracking', TRACKING_MIGRATION);
    throw mapError(error);
  }
  const { data, error: readError } = await db.from('commercial_quotes').select('tracking').eq('id', quoteId).single();
  if (readError) {
    if (isMissingTrackingColumn(readError)) throw new QuoteStorageError('missing_tracking', TRACKING_MIGRATION);
    throw mapError(readError);
  }
  const tracking = mapTracking(data?.tracking);
  if (payload == null) delete tracking[fieldId];
  else tracking[fieldId] = payload;
  const { error: writeError } = await db.from('commercial_quotes').update({ tracking }).eq('id', quoteId);
  if (writeError) {
    if (isMissingTrackingColumn(writeError)) throw new QuoteStorageError('missing_tracking', TRACKING_MIGRATION);
    throw mapError(writeError);
  }
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
    tracking: mapTracking(row.tracking),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapField(row: any): QuoteField {
  const kind: QuoteFieldKind = row?.kind === 'number' || row?.kind === 'category' ? row.kind : 'text';
  return {
    id: row.id,
    label: String(row.label || '').trim() || 'Columna',
    kind,
    options: kind === 'category' ? cleanOptions(row.options) : [],
    position: Number(row.position) || 0,
  };
}

function mapTracking(value: unknown): QuoteTracking {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const tracking: QuoteTracking = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) tracking[key] = raw;
    else if (typeof raw === 'string' && raw.trim()) tracking[key] = raw.trim();
  }
  return tracking;
}

function cleanOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const options: string[] = [];
  for (const item of value) {
    const label = String(item ?? '').trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase('es');
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(label);
    if (options.length >= 40) break;
  }
  return options;
}

function isMissingFields(error: any): boolean {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    /commercial_quote_fields/i.test(message)
  );
}

function isMissingTrackingColumn(error: any): boolean {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return /tracking/i.test(message) && /column|schema cache|could not find/i.test(message);
}

function isMissingRpc(error: any): boolean {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return error?.code === 'PGRST202' || (/set_quote_tracking/i.test(message) && /function|could not find|schema cache/i.test(message));
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
  // El aviso de tabla ausente iba primero y coincidía con el nombre del índice
  // commercial_quotes_code_key, así que un código repetido se veía como tabla faltante.
  if (error?.code === '23505' || /duplicate key/i.test(message)) {
    return new QuoteStorageError('duplicate', 'Ya existe una propuesta con ese código. Cámbielo e intente de nuevo.');
  }
  const missingTable =
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    /could not find the table ['"]?(?:public\.)?commercial_quotes/i.test(message) ||
    /relation ['"](?:public\.)?commercial_quotes['"] does not exist/i.test(message);
  if (missingTable) {
    return new QuoteStorageError(
      'missing_table',
      'Falta la tabla de propuestas. Ejecute migrations/MIGRATION_COMMERCIAL_QUOTES.sql en Supabase.'
    );
  }
  return new QuoteStorageError('unknown', error?.message || 'No se pudo guardar la propuesta.');
}
