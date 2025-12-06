import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const distPath = path.join(__dirname, 'dist');

console.log(`🔧 PORT from environment: ${process.env.PORT}`);
console.log(`🔧 Using PORT: ${PORT}`);

// Función para obtener el tipo MIME
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

// Función para servir archivos estáticos
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
      'Cache-Control': 'no-cache'
    });
    res.end(data);
    console.log(`✅ Served: ${filePath} (${data.length} bytes)`);
  });
}

// Crear servidor
const server = http.createServer((req, res) => {
  console.log(`📥 Request: ${req.method} ${req.url}`);
  
  // Limpiar la URL (remover query strings y fragmentos)
  let urlPath = req.url.split('?')[0].split('#')[0];
  
  // Si es la raíz, servir index.html
  if (urlPath === '/' || urlPath === '') {
    urlPath = '/index.html';
  }
  
  let filePath = path.join(distPath, urlPath);

  // Verificar si el archivo existe
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Si no existe, intentar servir index.html (para SPA routing)
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
  console.log(`✅ Servidor listo para recibir peticiones`);
});

// Manejar errores no capturados
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

