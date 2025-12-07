# Script de Despliegue de Edge Function para Windows PowerShell
# Este script ayuda a desplegar la Edge Function usando el dashboard de Supabase

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Despliegue de Edge Function" -ForegroundColor Cyan
Write-Host "  update-user-password" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que el archivo de la función existe
$functionPath = "supabase\functions\update-user-password\index.ts"
if (-not (Test-Path $functionPath)) {
    Write-Host "❌ Error: No se encontró el archivo de la función en $functionPath" -ForegroundColor Red
    Write-Host "Asegúrate de que el archivo existe antes de continuar." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Archivo de función encontrado: $functionPath" -ForegroundColor Green
Write-Host ""

# Mostrar el contenido del archivo
Write-Host "📄 Contenido de la función:" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Gray
Get-Content $functionPath
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Instrucciones
Write-Host "📋 INSTRUCCIONES PARA DESPLEGAR:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Abre tu navegador y ve a: https://app.supabase.com" -ForegroundColor White
Write-Host "2. Selecciona tu proyecto" -ForegroundColor White
Write-Host "3. Ve a 'Edge Functions' en el menú lateral" -ForegroundColor White
Write-Host "4. Haz clic en 'Create a new function'" -ForegroundColor White
Write-Host "5. Nombre: update-user-password" -ForegroundColor White
Write-Host "6. Copia el código mostrado arriba y pégalo en el editor" -ForegroundColor White
Write-Host "7. Haz clic en 'Deploy'" -ForegroundColor White
Write-Host ""
Write-Host "8. Configura las variables de entorno:" -ForegroundColor Yellow
Write-Host "   - Ve a Settings > Edge Functions > Secrets" -ForegroundColor White
Write-Host "   - Agrega:" -ForegroundColor White
Write-Host "     * SUPABASE_URL = https://rlnfehtgspnkyeevduli.supabase.co" -ForegroundColor Cyan
Write-Host "     * SUPABASE_ANON_KEY = (tu anon key)" -ForegroundColor Cyan
Write-Host "     * SUPABASE_SERVICE_ROLE_KEY = (tu service role key)" -ForegroundColor Cyan
Write-Host ""
Write-Host "9. Verifica que la función esté 'Active'" -ForegroundColor White
Write-Host ""

# Preguntar si quiere abrir el dashboard
$openDashboard = Read-Host "¿Quieres abrir el dashboard de Supabase ahora? (S/N)"
if ($openDashboard -eq "S" -or $openDashboard -eq "s") {
    Start-Process "https://app.supabase.com/project/rlnfehtgspnkyeevduli/functions"
    Write-Host "✅ Dashboard abierto en el navegador" -ForegroundColor Green
}

Write-Host ""
Write-Host "✨ ¡Listo! Sigue las instrucciones arriba para completar el despliegue." -ForegroundColor Green

