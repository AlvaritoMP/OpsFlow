import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function trimEnv(name, ...fallbacks) {
  for (const key of [name, ...fallbacks]) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

const DEFAULT_PUBLIC_BASE = 'https://opalo-opsflow.bouasv.easypanel.host';

function firstAbsoluteHttpUrl(...candidates) {
  for (const raw of candidates) {
    const value = String(raw || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(value)) continue;
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') continue;
      return `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '')}`;
    } catch {
      /* ignore invalid */
    }
  }
  return '';
}

/** URL pública absoluta de OpsFlow. Nunca relativa ni localhost. */
export function opsFlowPublicBase() {
  return (
    firstAbsoluteHttpUrl(
      process.env.APP_BASE_URL,
      process.env.OPS_FLOW_PUBLIC_URL,
      process.env.OPS_FLOW_URL,
      process.env.VITE_API_URL,
      DEFAULT_PUBLIC_BASE,
    ) || DEFAULT_PUBLIC_BASE
  );
}

/** Endpoint al que Mattermost hace POST al pulsar Continuar / el select. */
export function mattermostActionUrl() {
  return `${opsFlowPublicBase()}/api/webhooks/mattermost/action`;
}

export function mattermostDialogSubmitUrl() {
  return `${opsFlowPublicBase()}/api/webhooks/mattermost/dialog-submit`;
}

export function loadConfig() {
  const mattermostUrl = firstAbsoluteHttpUrl(
    process.env.MATTERMOST_URL,
    process.env.MATTERMOST_BASE_URL,
  );
  const publicUrl = opsFlowPublicBase();
  const supabaseUrl = trimEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceKey = trimEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = trimEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');

  return {
    mattermostUrl,
    botToken: trimEnv('MATTERMOST_BOT_TOKEN'),
    slashToken: trimEnv('MATTERMOST_SLASH_TOKEN', 'MATTERMOST_COMMAND_TOKEN'),
    outgoingToken: trimEnv('MATTERMOST_OUTGOING_TOKEN', 'MATTERMOST_WEBHOOK_TOKEN'),
    teamName: trimEnv('MATTERMOST_TEAM_NAME', 'MATTERMOST_TEAM'),
    publicUrl,
    supabaseUrl,
    supabaseKey: serviceKey || anonKey,
    hasServiceRole: Boolean(serviceKey),
    stateSecret: trimEnv('MATTERMOST_STATE_SECRET') || trimEnv('MATTERMOST_SLASH_TOKEN', 'MATTERMOST_COMMAND_TOKEN') || trimEnv('MATTERMOST_BOT_TOKEN'),
    pollIntervalMs: Number(trimEnv('MATTERMOST_THREAD_POLL_MS') || '20000') || 20000,
  };
}

let cachedAdmin = null;
let cachedKey = '';

export function getSupabaseAdmin() {
  const cfg = loadConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o ANON) en el servidor');
  }
  if (cachedAdmin && cachedKey === cfg.supabaseKey) return cachedAdmin;
  cachedKey = cfg.supabaseKey;
  cachedAdmin = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

export function configStatus() {
  const cfg = loadConfig();
  return {
    mattermostUrl: Boolean(cfg.mattermostUrl),
    botToken: Boolean(cfg.botToken),
    slashToken: Boolean(cfg.slashToken),
    supabase: Boolean(cfg.supabaseUrl && cfg.supabaseKey),
    serviceRole: cfg.hasServiceRole,
    publicUrl: Boolean(cfg.publicUrl),
    publicUrlValue: cfg.publicUrl || null,
    actionUrl: mattermostActionUrl(),
    dialogSubmitUrl: mattermostDialogSubmitUrl(),
  };
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (!left.length || !right.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function signState(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret || 'opsflow').update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyState(state, secret, maxAgeMs = 15 * 60 * 1000) {
  const raw = String(state || '');
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return { ok: false, error: 'Estado del formulario inválido.' };
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret || 'opsflow').update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return { ok: false, error: 'Estado del formulario no es auténtico.' };
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'Estado del formulario corrupto.' };
  }
  if (payload.ts && Date.now() - Number(payload.ts) > maxAgeMs) {
    return { ok: false, error: 'El formulario expiró. Ejecute /falta de nuevo.' };
  }
  return { ok: true, payload };
}

export function publicBaseFromRequest(_req) {
  return opsFlowPublicBase();
}
