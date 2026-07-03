# Script de Diagnóstico para el Servidor
# Ejecuta este script en PowerShell para diagnosticar problemas

Write-Host "=== DIAGNÓSTICO DEL SERVIDOR ===" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar Node.js
Write-Host "1. Verificando Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Node.js instalado: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "   ❌ Node.js NO está instalado o no está en PATH" -ForegroundColor Red
    exit 1
}

# 2. Verificar npm
Write-Host "2. Verificando npm..." -ForegroundColor Yellow
$npmVersion = npm --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ npm instalado: $npmVersion" -ForegroundColor Green
} else {
    Write-Host "   ❌ npm NO está instalado" -ForegroundColor Red
    exit 1
}

# 3. Verificar directorio
Write-Host "3. Verificando directorio..." -ForegroundColor Yellow
if (Test-Path "package.json") {
    Write-Host "   ✅ package.json encontrado" -ForegroundColor Green
    $currentDir = Get-Location
    Write-Host "   📁 Directorio actual: $currentDir" -ForegroundColor Cyan
} else {
    Write-Host "   ❌ package.json NO encontrado. ¿Estás en el directorio correcto?" -ForegroundColor Red
    exit 1
}

# 4. Detener procesos Node existentes
Write-Host "4. Deteniendo procesos Node existentes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "   ⚠️  Encontrados $($nodeProcesses.Count) proceso(s) Node" -ForegroundColor Yellow
    $nodeProcesses | Stop-Process -Force
    Start-Sleep -Seconds 2
    Write-Host "   ✅ Procesos detenidos" -ForegroundColor Green
} else {
    Write-Host "   ✅ No hay procesos Node ejecutándose" -ForegroundColor Green
}

# 5. Verificar puerto 3000
Write-Host "5. Verificando puerto 3000..." -ForegroundColor Yellow
$port3000 = netstat -ano | findstr :3000
if ($port3000) {
    Write-Host "   ⚠️  Puerto 3000 está ocupado:" -ForegroundColor Yellow
    Write-Host "   $port3000" -ForegroundColor Yellow
    Write-Host "   💡 Intentaremos usar otro puerto si es necesario" -ForegroundColor Cyan
} else {
    Write-Host "   ✅ Puerto 3000 está libre" -ForegroundColor Green
}

# 6. Verificar node_modules
Write-Host "6. Verificando dependencias..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "   ✅ node_modules existe" -ForegroundColor Green
    
    # Verificar Vite específicamente
    if (Test-Path "node_modules\vite") {
        Write-Host "   ✅ Vite instalado" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Vite NO está instalado" -ForegroundColor Red
        Write-Host "   📦 Instalando dependencias..." -ForegroundColor Yellow
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "   ❌ Error al instalar dependencias" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "   ❌ node_modules NO existe" -ForegroundColor Red
    Write-Host "   📦 Instalando dependencias..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ❌ Error al instalar dependencias" -ForegroundColor Red
        exit 1
    }
}

# 7. Verificar errores de TypeScript
Write-Host "7. Verificando errores de TypeScript..." -ForegroundColor Yellow
$tscOutput = npx tsc --noEmit 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Sin errores de TypeScript" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Hay errores de TypeScript:" -ForegroundColor Yellow
    Write-Host $tscOutput -ForegroundColor Yellow
    Write-Host "   💡 Continuando de todas formas..." -ForegroundColor Cyan
}

# 8. Intentar iniciar el servidor
Write-Host ""
Write-Host "=== INICIANDO SERVIDOR ===" -ForegroundColor Cyan
Write-Host "Presiona Ctrl+C para detener el servidor" -ForegroundColor Yellow
Write-Host ""

# Intentar iniciar con output completo
npm run dev
