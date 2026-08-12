import { supabase } from './supabase';
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

async function invokePublicFicha(
  action: 'open' | 'save',
  dni: string,
  extra?: Record<string, unknown>,
): Promise<PublicComplementaryFichaPayload> {
  const normalized = normalizeDni(dni);
  const { data, error } = await supabase.functions.invoke('public-complementary-ficha', {
    body: {
      action,
      dni: normalized,
      sessionToken: readPublicFichaSessionToken(normalized),
      ...extra,
    },
  });

  const bodyError =
    data && typeof data === 'object' && 'error' in data
      ? String((data as { error: unknown }).error)
      : '';
  if (bodyError) {
    throw new Error(bodyError);
  }
  if (error) {
    throw new Error(error.message || 'No se pudo contactar el servicio de ficha');
  }
  if (!data) {
    throw new Error('No se recibió respuesta del servicio de ficha');
  }

  const payload = data as PublicComplementaryFichaPayload;
  writePublicFichaSessionToken(normalized, payload.sessionToken);
  return payload;
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
