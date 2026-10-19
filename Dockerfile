# Dockerfile para OpsFlow - Producción
FROM node:20-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json* ./

# Reintenta si el registro de npm corta la descarga (ECONNRESET).
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-factor 2 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm config set fetch-timeout 300000 \
 && n=0 \
 && until npm ci --no-audit --no-fund; do \
      n=$((n + 1)); \
      if [ "$n" -ge 5 ]; then exit 1; fi; \
      echo "npm ci falló (intento ${n}). Reintentando en 20s..."; \
      sleep 20; \
    done

# Copiar código fuente
COPY . .

# Construir la aplicación
RUN npm run build

# Ejecutar script de protección
RUN node scripts/protect-dist.js

# Exponer puerto 80
EXPOSE 80

# Variable de entorno para el puerto
ENV PORT=80
ENV NODE_ENV=production

# Iniciar servidor Node.js
CMD ["node", "server.js"]

