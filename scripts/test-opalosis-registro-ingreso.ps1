#Requires -Version 5.1
<#
.SYNOPSIS
  Prueba directa del endpoint Opalosis registro-ingreso (sin pasar por Supabase).

.EXAMPLE
  .\scripts\test-opalosis-registro-ingreso.ps1

.EXAMPLE
  $env:OPALOSIS_API_KEY = "tu-key"
  .\scripts\test-opalosis-registro-ingreso.ps1 -Documento "87654321"
#>
param(
  [string]$BaseUrl = 'https://onyx.opaloperu.com/apiempleadoregistro',
  [string]$ApiKey = $env:OPALOSIS_API_KEY,
  [string]$Documento = '12345678',
  [string]$ApellidoPaterno = 'Perez',
  [string]$ApellidoMaterno = 'Gomez',
  [string]$Nombres = 'Juan Carlos',
  [string]$Sexo = 'M',
  [string]$FechaIngreso = $(Get-Date -Format 'yyyy-MM-dd')
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  $ApiKey = 'OpaloPeru2026123456SAC'
  Write-Host 'Usando API Key de pruebas por defecto.' -ForegroundColor Yellow
}

$endpoint = "$($BaseUrl.TrimEnd('/'))/api/opsflow/registro-ingreso"
$body = @{
  TipoDocumentoId = 1
  Documento       = $Documento
  ApellidoPaterno = $ApellidoPaterno
  ApellidoMaterno = $ApellidoMaterno
  Nombres         = $Nombres
  Sexo            = $Sexo
  FechaIngreso    = $FechaIngreso
} | ConvertTo-Json

Write-Host "POST $endpoint" -ForegroundColor Cyan
Write-Host $body

$headers = @{
  'Content-Type' = 'application/json'
  'X-Api-Key'    = $ApiKey
}

$response = Invoke-RestMethod -Uri $endpoint -Method Post -Headers $headers -Body $body
Write-Host "`nRespuesta:" -ForegroundColor Green
$response | ConvertTo-Json -Depth 5

if ($response.Resultado -eq $true) {
  Write-Host "`nOK — IngresoId: $($response.IngresoId), Cod: $($response.IngresoCod)" -ForegroundColor Green
} else {
  Write-Host "`nFallo — $($response.MensajeError)" -ForegroundColor Red
  exit 1
}
