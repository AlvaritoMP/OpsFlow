#!/bin/bash
set -e

echo "🚀 Iniciando aplicación..."
echo "📁 Directorio actual: $(pwd)"

# CRÍTICO: Ejecutar el script de protección ANTES de iniciar Caddy
# Esto garantiza que el index.html compilado esté correcto incluso si se sobrescribió
echo "🔧 Ejecutando script de protección..."
node scripts/protect-dist.js

# Iniciar Caddy
echo "🌐 Iniciando servidor Caddy..."
exec caddy run --config /assets/Caddyfile --adapter caddyfile 2>&1

