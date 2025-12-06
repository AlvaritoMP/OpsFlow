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

# Exponer puerto 3000
EXPOSE 3000

# Iniciar vite preview
CMD ["npm", "start"]

