# Script Simple para Iniciar el Servidor
# Haz doble clic en este archivo o ejecútalo desde PowerShell

Write-Host "=== LIMPIANDO PROCESOS ===" -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
Write-Host "✅ Procesos detenidos" -ForegroundColor Green

Write-Host ""
Write-Host "=== INICIANDO SERVIDOR ===" -ForegroundColor Cyan
Write-Host "Si ves errores, cópialos y compártelos" -ForegroundColor Yellow
Write-Host ""

# Cambiar al directorio del script
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Iniciar servidor (esto mostrará la salida completa)
npm run dev
