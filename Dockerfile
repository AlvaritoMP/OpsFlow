# Dockerfile para OpsFlow - Producción
FROM node:20-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json* ./

# Instalar dependencias
RUN npm ci

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

