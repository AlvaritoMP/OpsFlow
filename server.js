import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const distPath = path.join(__dirname, 'dist');

/** Proxy OpsFlow → Onyx (evita ECONNRESET desde Supabase Edge / Deno). */
const OPALOSIS_API_BASE_URL = (
  process.env.OPALOSIS_API_BASE_URL ||
  'https://onyx.opaloperu.com/apiempleadoregistro/api/opsflow'
).replace(/\/$/, '');
const OPALOSIS_API_KEY = process.env.OPALOSIS_API_KEY || '';
const OPALOSIS_PROXY_SECRET = process.env.OPALOSIS_PROXY_SECRET || '';

const OPALOSIS_ALLOWED_PATHS = new Set([
  'tipo-documento',
  'estado-civil',
  'paises',
  'departamentos',
  'provincias',
  'distritos',
  'empleado-cargo',
  'lugar-trabajo',
  'opalos',
  'regimen-laboral',
  'modelo-contrato',
  'fondo-pension',
  'banco',
  'supervisores',
  'centro-costo',
  'registro-ingreso',
  'solicitudes-ingreso',
]);

console.log(`🔧 PORT from environment: ${process.env.PORT}`);
console.log(`🔧 Using PORT: ${PORT}`);
console.log(
  `🔗 Opalosis proxy: ${OPALOSIS_PROXY_SECRET && OPALOSIS_API_KEY ? 'ENABLED' : 'DISABLED (faltan secrets)'}`,
);

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.error(`❌ Error reading file ${filePath}:`, err.message);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const mimeType = getMimeType(filePath);
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
    console.log(`✅ Served: ${filePath} (${data.length} bytes)`);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Proxy autenticado:
 *   /api/opalosis-proxy/<ruta-opalosis>?query
 * Header requerido: X-OpsFlow-Proxy-Secret
 */
async function handleOpalosisProxy(req, res, urlPath, search) {
  if (!OPALOSIS_PROXY_SECRET || !OPALOSIS_API_KEY) {
    sendJson(res, 503, {
      error: 'Proxy Opalosis no configurado',
      detail: 'Faltan OPALOSIS_PROXY_SECRET y/o OPALOSIS_API_KEY en EasyPanel',
    });
    return;
  }

  const provided = req.headers['x-opsflow-proxy-secret'];
  if (!provided || provided !== OPALOSIS_PROXY_SECRET) {
    sendJson(res, 401, { error: 'Unauthorized proxy' });
    return;
  }

  const relative = urlPath.replace(/^\/api\/opalosis-proxy\/?/, '').replace(/^\//, '');
  if (!relative || relative.includes('..')) {
    sendJson(res, 400, { error: 'Ruta proxy inválida' });
    return;
  }

  if (relative === '__ping') {
    sendJson(res, 200, {
      ok: true,
      proxy: true,
      target: OPALOSIS_API_BASE_URL,
    });
    return;
  }

  const pathKey = relative.split('/')[0];
  if (!OPALOSIS_ALLOWED_PATHS.has(pathKey)) {
    sendJson(res, 403, { error: `Ruta no permitida: ${pathKey}` });
    return;
  }

  const targetUrl = `${OPALOSIS_API_BASE_URL}/${relative}${search || ''}`;
  const method = (req.method || 'GET').toUpperCase();
  let bodyBuffer = null;
  if (method !== 'GET' && method !== 'HEAD') {
    bodyBuffer = await readRequestBody(req);
  }

  console.log(`🔁 Opalosis proxy ${method} ${targetUrl}`);

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': OPALOSIS_API_KEY,
        Accept: 'application/json',
      },
      body: bodyBuffer && bodyBuffer.length ? bodyBuffer : undefined,
    });

    const text = await upstream.text();
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(text);
    console.log(`✅ Opalosis proxy ← HTTP ${upstream.status} (${text.length} bytes)`);
  } catch (err) {
    console.error('❌ Opalosis proxy upstream error:', err);
    sendJson(res, 502, {
      error: 'Error al contactar Opalosis desde EasyPanel',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

const server = http.createServer(async (req, res) => {
  console.log(`📥 Request: ${req.method} ${req.url}`);

  const rawUrl = req.url || '/';
  const qIndex = rawUrl.indexOf('?');
  const urlPath = (qIndex >= 0 ? rawUrl.slice(0, qIndex) : rawUrl).split('#')[0];
  const search = qIndex >= 0 ? rawUrl.slice(qIndex) : '';

  if (urlPath === '/api/opalosis-proxy' || urlPath.startsWith('/api/opalosis-proxy/')) {
    try {
      await handleOpalosisProxy(req, res, urlPath, search);
    } catch (err) {
      console.error('❌ Proxy handler error:', err);
      sendJson(res, 500, {
        error: 'Error interno del proxy',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  let spaPath = urlPath;
  if (spaPath === '/' || spaPath === '') {
    spaPath = '/index.html';
  }

  let filePath = path.join(distPath, spaPath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      console.log(`⚠️  File not found: ${filePath}, serving index.html`);
      filePath = path.join(distPath, 'index.html');
    } else {
      console.log(`✅ Serving: ${filePath}`);
    }

    serveFile(filePath, res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
  console.log(`📁 Sirviendo archivos desde: ${distPath}`);
  console.log(`🔁 Proxy Opalosis en /api/opalosis-proxy/*`);
  console.log(`✅ Servidor listo para recibir peticiones`);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  process.exit(1);
});

server.on('error', (err) => {
  console.error('❌ Error del servidor:', err);
  process.exit(1);
});
