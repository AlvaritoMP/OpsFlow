# Dockerfile multietapa para OpsFlow
# Este Dockerfile evita completamente la detección de Nixpacks

# ============================================
# Etapa 1: Build - Construir la aplicación
# ============================================
FROM node:20-alpine AS builder

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración de dependencias
COPY package.json package-lock.json* ./

# Instalar dependencias (incluyendo devDependencies para el build)
RUN npm ci

# Copiar el resto del código fuente
COPY . .

# Construir la aplicación
RUN npm run build

# Ejecutar script de protección post-build
RUN node scripts/protect-dist.js

# ============================================
# Etapa 2: Producción - Servir la aplicación
# ============================================
FROM node:20-alpine AS production

# Establecer directorio de trabajo
WORKDIR /app

# Copiar package.json para instalar dependencias
COPY package.json package-lock.json* ./

# Instalar vite y sus dependencias necesarias para preview
# Vite está en devDependencies pero lo necesitamos para servir en producción
RUN npm ci --include=dev && \
    npm cache clean --force

# Copiar los archivos compilados desde la etapa de build
COPY --from=builder /app/dist ./dist

# Copiar scripts necesarios si los hay
COPY --from=builder /app/scripts ./scripts

# Exponer el puerto 3000
EXPOSE 3000

# Variable de entorno para el puerto (puede ser sobrescrita por EasyPanel)
ENV PORT=3000

# Comando para iniciar vite preview en el puerto 3000
CMD ["sh", "-c", "vite preview --host 0.0.0.0 --port ${PORT:-3000}"]

