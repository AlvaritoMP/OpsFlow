import { loadConfig } from './config.js';

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function mattermostFetch(path, { method = 'GET', body, headers = {}, asBuffer = false } = {}) {
  const cfg = loadConfig();
  if (!cfg.mattermostUrl || !cfg.botToken) {
    throw new Error('Faltan MATTERMOST_URL o MATTERMOST_BOT_TOKEN');
  }
  const url = `${cfg.mattermostUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const reqHeaders = {
    Authorization: `Bearer ${cfg.botToken}`,
    Accept: asBuffer ? '*/*' : 'application/json',
    ...headers,
  };
  let payload = body;
  if (body && typeof body === 'object' && !Buffer.isBuffer(body) && !headers['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers: reqHeaders, body: payload });
  if (asBuffer) {
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Mattermost ${method} ${path} → HTTP ${res.status}: ${errBody.slice(0, 300)}`);
    }
    const mime = res.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await res.arrayBuffer());
    return { buffer: buf, mime, status: res.status };
  }
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const msg = data.message || data.error || data.detailed_error || JSON.stringify(data).slice(0, 300);
    throw new Error(`Mattermost ${method} ${path} → HTTP ${res.status}: ${msg}`);
  }
  return data;
}

export async function openDialog({ triggerId, url, dialog }) {
  return mattermostFetch('/api/v4/actions/dialogs/open', {
    method: 'POST',
    body: {
      trigger_id: triggerId,
      url,
      dialog,
    },
  });
}

export async function createPost(post) {
  return mattermostFetch('/api/v4/posts', { method: 'POST', body: post });
}

export async function createEphemeralPost(userId, post) {
  return mattermostFetch('/api/v4/posts/ephemeral', {
    method: 'POST',
    body: { user_id: userId, post },
  });
}

export async function getPost(postId) {
  return mattermostFetch(`/api/v4/posts/${encodeURIComponent(postId)}`);
}

export async function getPostThread(postId) {
  return mattermostFetch(`/api/v4/posts/${encodeURIComponent(postId)}/thread`);
}

export async function getFileInfo(fileId) {
  return mattermostFetch(`/api/v4/files/${encodeURIComponent(fileId)}/info`);
}

export async function downloadFile(fileId) {
  return mattermostFetch(`/api/v4/files/${encodeURIComponent(fileId)}`, { asBuffer: true });
}

export async function getTeam(teamId) {
  return mattermostFetch(`/api/v4/teams/${encodeURIComponent(teamId)}`);
}

export function buildPermalink(teamName, postId) {
  const cfg = loadConfig();
  if (!cfg.mattermostUrl || !teamName || !postId) return '';
  return `${cfg.mattermostUrl}/${teamName}/pl/${postId}`;
}
