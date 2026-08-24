import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';
import type { WorkerSnapshotComplementary } from '../types';

export const PUBLIC_COMPLEMENTARY_FICHA_PATH = '/ficha';
export const PUBLIC_COMPLEMENTARY_FICHA_MAX_OPENS = 3;

export interface PublicComplementaryFichaPayload {
  dni: string;
  complementary: WorkerSnapshotComplementary;
  openCount: number;
  maxOpens: number;
  remainingOpens: number;
  canEdit: boolean;
  locked: boolean;
  sessionToken: string | null;
}

function sessionStorageKey(dni: string): string {
  return `opsflow.publicFicha.session.${dni}`;
}

export function readPublicFichaSessionToken(dni: string): string | undefined {
  try {
    return sessionStorage.getItem(sessionStorageKey(dni)) || undefined;
  } catch {
    return undefined;
  }
}

export function writePublicFichaSessionToken(dni: string, token: string | null): void {
  try {
    const key = sessionStorageKey(dni);
    if (token) sessionStorage.setItem(key, token);
    else sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function isPublicComplementaryFichaPath(location: Location = window.location): boolean {
  const path = (location.pathname || '/').replace(/\/+$/, '') || '/';
  const hash = (location.hash || '').replace(/^#/, '').split('?')[0];
  return (
    path === '/ficha' ||
    path === '/ficha-complementaria' ||
    hash === '/ficha' ||
    hash === '/ficha-complementaria'
  );
}

export function getPublicComplementaryFichaUrl(): string {
  if (typeof window === 'undefined') return PUBLIC_COMPLEMENTARY_FICHA_PATH;
  return `${window.location.origin}${PUBLIC_COMPLEMENTARY_FICHA_PATH}`;
}

function normalizeDni(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8);
}

function payloadFromUnknown(data: unknown): PublicComplementaryFichaPayload {
  if (!data || typeof data !== 'object') {
    throw new Error('No se recibió respuesta del servicio de ficha');
  }
  const record = data as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error.trim()) {
    throw new Error(record.error);
  }
  if (typeof record.dni !== 'string') {
    throw new Error('No se recibió respuesta del servicio de ficha');
  }
  return {
    dni: record.dni,
    complementary: (record.complementary && typeof record.complementary === 'object'
      ? record.complementary
      : {}) as WorkerSnapshotComplementary,
    openCount: Number(record.openCount ?? record.open_count) || 0,
    maxOpens: Number(record.maxOpens ?? record.max_opens) || PUBLIC_COMPLEMENTARY_FICHA_MAX_OPENS,
    remainingOpens: Number(record.remainingOpens ?? record.remaining_opens) || 0,
    canEdit: true,
    locked: false,
    sessionToken:
      typeof record.sessionToken === 'string'
        ? record.sessionToken
        : typeof record.session_token === 'string'
          ? record.session_token
          : null,
  };
}

function isMissingRpc(status: number, bodyText: string): boolean {
  if (status === 404) return true;
  return /could not find the function|schema cache|does not exist|42883/i.test(bodyText);
}

async function invokeViaRpc(
  action: 'open' | 'save',
  dni: string,
  extra?: Record<string, unknown>,
): Promise<PublicComplementaryFichaPayload> {
  const fn =
    action === 'open' ? 'open_public_complementary_ficha' : 'save_public_complementary_ficha';
  const args =
    action === 'open'
      ? { p_dni: dni, p_session_token: extra?.sessionToken ?? null }
      : {
          p_dni: dni,
          p_session_token: extra?.sessionToken ?? null,
          p_complementary: extra?.complementary ?? {},
        };

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(args),
  });

  const text = await response.text();
  if (!response.ok) {
    const err = new Error(text || `HTTP ${response.status}`);
    (err as Error & { status?: number; missingRpc?: boolean }).status = response.status;
    (err as Error & { missingRpc?: boolean }).missingRpc = isMissingRpc(response.status, text);
    throw err;
  }

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('No se recibió respuesta del servicio de ficha');
    }
  }
  return payloadFromUnknown(data);
}

async function invokeViaEdgeFunction(
  action: 'open' | 'save',
  dni: string,
  extra?: Record<string, unknown>,
): Promise<PublicComplementaryFichaPayload> {
  const { data, error } = await supabase.functions.invoke('public-complementary-ficha', {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: {
      action,
      dni,
      sessionToken: extra?.sessionToken,
      complementary: extra?.complementary,
    },
  });

  if (data) {
    return payloadFromUnknown(data);
  }
  if (error) {
    const message = error.message || 'No se pudo contactar el servicio de ficha';
    if (/Failed to send a request to the Edge Function|FunctionsFetchError|Failed to fetch/i.test(message)) {
      throw new Error(
        'No se pudo abrir la ficha. Revisa tu conexión e intenta de nuevo.',
      );
    }
    throw new Error(message);
  }
  throw new Error('No se recibió respuesta del servicio de ficha');
}

function isNetworkish(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /Failed to fetch|NetworkError|FunctionsFetchError|Failed to send a request to the Edge Function|ERR_FAILED|Load failed/i.test(
    error.message,
  );
}

function friendlyFichaError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (
      message &&
      !isNetworkish(error) &&
      !/HTTP \d+/.test(message) &&
      !message.startsWith('{') &&
      !message.startsWith('<')
    ) {
      return error;
    }
  }
  return new Error(fallback);
}

async function invokePublicFicha(
  action: 'open' | 'save',
  dni: string,
  extra?: Record<string, unknown>,
): Promise<PublicComplementaryFichaPayload> {
  const normalized = normalizeDni(dni);
  const sessionToken = readPublicFichaSessionToken(normalized);
  const payloadExtra = { sessionToken, ...extra };
  const fallback =
    action === 'save'
      ? 'No se pudo guardar la ficha. Revisa tu conexión e intenta de nuevo.'
      : 'No se pudo abrir la ficha. Revisa tu conexión e intenta de nuevo.';

  try {
    const payload = await invokeViaRpc(action, normalized, payloadExtra);
    writePublicFichaSessionToken(normalized, payload.sessionToken);
    return payload;
  } catch (rpcError) {
    const shouldFallback =
      Boolean((rpcError as { missingRpc?: boolean }).missingRpc) || isNetworkish(rpcError);
    if (!shouldFallback) {
      throw friendlyFichaError(rpcError, fallback);
    }
    try {
      const payload = await invokeViaEdgeFunction(action, normalized, payloadExtra);
      writePublicFichaSessionToken(normalized, payload.sessionToken);
      return payload;
    } catch (edgeError) {
      throw friendlyFichaError(edgeError, fallback);
    }
  }
}

export const publicComplementaryFichaService = {
  normalizeDni,

  async open(dni: string): Promise<PublicComplementaryFichaPayload> {
    return invokePublicFicha('open', dni);
  },

  async save(
    dni: string,
    complementary: WorkerSnapshotComplementary,
  ): Promise<PublicComplementaryFichaPayload> {
    return invokePublicFicha('save', dni, { complementary });
  },
};
