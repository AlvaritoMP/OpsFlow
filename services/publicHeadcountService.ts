import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

export const PUBLIC_HEADCOUNT_PATH = '/headcount-publico';

export interface HeadcountShiftCounts {
  Day: number;
  Afternoon: number;
  Night: number;
  unassigned: number;
}

export interface HeadcountPreventivoCounts {
  Day: number;
  Afternoon: number;
  Night: number;
}

export interface PublicHeadcountReten {
  details: string[];
  names: string[];
  count: number;
}

export interface PublicHeadcountRow {
  unitId: string;
  unitName: string;
  clientName: string;
  positionId: string;
  positionName: string;
  rq: number;
  requiredByShift: HeadcountShiftCounts;
  activos: number;
  porCubrir: number;
  vacantByShift: HeadcountShiftCounts;
  turnover: number;
  preventivo: HeadcountPreventivoCounts;
  isFirstInUnit: boolean;
  unitRowSpan: number;
  reten: PublicHeadcountReten | null;
}

export interface PublicHeadcountPositionSummary {
  positionName: string;
  rq: number;
  activos: number;
  porCubrir: number;
  requiredByShift: HeadcountShiftCounts;
  vacantByShift: HeadcountShiftCounts;
}

export interface PublicHeadcountUnitSummary {
  unitId: string;
  unitName: string;
  clientName: string;
  rq: number;
  activos: number;
  porCubrir: number;
  turnover: number;
  requiredByShift: HeadcountShiftCounts;
  vacantByShift: HeadcountShiftCounts;
  reten: PublicHeadcountReten | null;
}

export interface PublicHeadcountBoard {
  available: true;
  readOnly: true;
  limaDate: string;
  limaTime: string;
  windowLabel: string;
  rows: PublicHeadcountRow[];
  positionSummary: PublicHeadcountPositionSummary[];
  unitSummary: PublicHeadcountUnitSummary[];
  totals: {
    rq: number;
    activos: number;
    porCubrir: number;
    turnover: number;
    shiftReq: HeadcountShiftCounts;
    shiftVacant: HeadcountShiftCounts;
    preventivo: HeadcountPreventivoCounts;
    coverage: number;
  };
  dayStatus: {
    descanso: number;
    falta: number;
    vacaciones: number;
    retenesHoy: number;
  };
}

export interface PublicHeadcountClosed {
  available: false;
  code: 'outside_window' | 'invalid_token' | 'unavailable';
  message: string;
  windowLabel: string;
  limaTime?: string;
}

export type PublicHeadcountViewResult = PublicHeadcountBoard | PublicHeadcountClosed;

export function isPublicHeadcountPath(location: Location = window.location): boolean {
  const path = (location.pathname || '/').replace(/\/+$/, '') || '/';
  return path === PUBLIC_HEADCOUNT_PATH || path === '/headcount-public';
}

export function readPublicHeadcountToken(location: Location = window.location): string {
  return new URLSearchParams(location.search).get('t')?.trim() || '';
}

export function publicHeadcountUrl(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}${PUBLIC_HEADCOUNT_PATH}?t=${encodeURIComponent(token)}`;
}

export async function fetchPublicHeadcount(token: string): Promise<PublicHeadcountViewResult> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/public-headcount`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ action: 'view', token }),
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('No se pudo leer el cuadro de headcount');
    }
  }

  if (!response.ok) {
    const record = (data && typeof data === 'object' ? data : {}) as { message?: string; code?: string };
    if (record.code === 'invalid_token') {
      return {
        available: false,
        code: 'invalid_token',
        message: record.message || 'Este enlace no es válido.',
        windowLabel: '8:00 a.m. – 6:00 p.m.',
      };
    }
    if (response.status === 404) {
      throw new Error('El enlace público aún no está publicado. Aplica la migración y despliega la función public-headcount.');
    }
    if (record.code === 'outside_window') {
      return {
        available: false,
        code: 'outside_window',
        message: record.message || 'El cuadro está disponible de 8:00 a.m. a 6:00 p.m. (hora de Perú).',
        windowLabel: '8:00 a.m. – 6:00 p.m.',
        limaTime: typeof (record as { limaTime?: string }).limaTime === 'string'
          ? (record as { limaTime?: string }).limaTime
          : undefined,
      };
    }
    throw new Error(record.message || text || `HTTP ${response.status}`);
  }

  const record = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (record.available === false) {
    return {
      available: false,
      code: record.code === 'outside_window' ? 'outside_window' : 'unavailable',
      message: typeof record.message === 'string'
        ? record.message
        : 'El cuadro no está disponible en este momento.',
      windowLabel: typeof record.windowLabel === 'string' ? record.windowLabel : '8:00 a.m. – 6:00 p.m.',
      limaTime: typeof record.limaTime === 'string' ? record.limaTime : undefined,
    };
  }
  if (record.available !== true || !Array.isArray(record.rows)) {
    throw new Error('No se recibió el cuadro de headcount');
  }
  return record as unknown as PublicHeadcountBoard;
}

async function messageFromInvokeError(error: { message?: string; context?: Response }): Promise<string> {
  const context = error.context;
  if (context && typeof context.clone === 'function') {
    try {
      const body = await context.clone().json() as { message?: string };
      if (body?.message) return body.message;
    } catch {
      /* el cuerpo no es JSON */
    }
  }
  const message = error.message || 'No se pudo generar el enlace público';
  if (/Failed to send a request to the Edge Function|FunctionsFetchError|Failed to fetch|404/i.test(message)) {
    return 'El enlace público aún no está publicado. Aplica la migración y despliega la función public-headcount.';
  }
  return message;
}

async function invokeAuthenticated(action: 'link' | 'rotate'): Promise<string> {
  const { data, error } = await supabase.functions.invoke('public-headcount', {
    body: { action },
  });
  if (data && typeof data === 'object') {
    const record = data as { token?: string; message?: string };
    if (typeof record.token === 'string' && record.token) return record.token;
    if (typeof record.message === 'string' && record.message) throw new Error(record.message);
  }
  if (error) throw new Error(await messageFromInvokeError(error));
  throw new Error('No se pudo generar el enlace público');
}

export const publicHeadcountService = {
  isPath: isPublicHeadcountPath,
  readToken: readPublicHeadcountToken,
  urlFor: publicHeadcountUrl,
  fetchBoard: fetchPublicHeadcount,
  async copyLink(): Promise<string> {
    const token = await invokeAuthenticated('link');
    return publicHeadcountUrl(token);
  },
  async rotateLink(): Promise<string> {
    const token = await invokeAuthenticated('rotate');
    return publicHeadcountUrl(token);
  },
};
