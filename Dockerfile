# Dockerfile para OpsFlow - Producción con Vite Preview
FROM node:20-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json* ./

# Instalar todas las dependencias (necesitamos vite para preview)
RUN npm ci

# Copiar código fuente
COPY . .

# Construir la aplicación
RUN npm run build

# Ejecutar script de protección
RUN node scripts/protect-dist.js

# Verificar que dist existe
RUN ls -la dist/ || (echo "ERROR: dist directory not found" && exit 1)

# Exponer puerto (EasyPanel puede usar cualquier puerto)
EXPOSE 3000

# Variable de entorno para el puerto
ENV PORT=3000
ENV NODE_ENV=production

# Healthcheck para verificar que el servidor está corriendo
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-3000}', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Iniciar servidor Node.js simple
CMD ["node", "server.js"]

