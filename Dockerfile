# Dockerfile para OpsFlow - Producción
FROM node:20-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json* ./

# Un ECONNRESET debe cortar pronto. Timeout de 5 min y espera mínima de 20 s,
# repetidos hasta 5 veces, convierten un corte de red en media hora: npm ci
# borra node_modules y vuelve a empezar.
RUN npm config set fetch-retries 2 \
 && npm config set fetch-retry-factor 2 \
 && npm config set fetch-retry-mintimeout 2000 \
 && npm config set fetch-retry-maxtimeout 10000 \
 && npm config set fetch-timeout 60000 \
 && npm ci --no-audit --no-fund \
 || (echo "npm ci falló. Reintentando una vez..." && sleep 5 && npm ci --no-audit --no-fund)

# Frontend. Un cambio en server.js no vuelve a ejecutar esta compilación.
COPY index.html index.css index.tsx vite.config.ts tsconfig.json tailwind.config.js postcss.config.cjs metadata.json ./
COPY App.tsx constants.ts types.ts ./
COPY components ./components
COPY services ./services
COPY hooks ./hooks
COPY utils ./utils
COPY types ./types
COPY assets ./assets
COPY data ./data
COPY scripts/protect-dist.js ./scripts/protect-dist.js

RUN npm run build

COPY server.js ./
COPY server ./server

# Exponer puerto 80
EXPOSE 80

# Variable de entorno para el puerto
ENV PORT=80
ENV NODE_ENV=production

# Iniciar servidor Node.js
CMD ["node", "server.js"]

