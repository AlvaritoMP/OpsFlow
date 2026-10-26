#Requires -Version 5.1
<#
.SYNOPSIS
  Despliega la Edge Function billing-opalosis-os.

.DESCRIPTION
  Registra la orden de servicio en https://apiopalosis.opaloperu.com
  cuando OpsFlow emite una liquidación.
  Secretos: OPALOSIS_OS_API_KEY (si no existe, se reutiliza OPALOSIS_API_KEY).
#>
param(
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN,
  [string]$ProjectRef = 'rlnfehtgspnkyeevduli'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$FunctionName = 'billing-opalosis-os'

if ([string]::IsNullOrWhiteSpace($AccessToken)) {
  throw 'Defina SUPABASE_ACCESS_TOKEN antes de desplegar.'
}

$env:SUPABASE_ACCESS_TOKEN = $AccessToken
Push-Location $ProjectRoot
try {
  if ($env:OPALOSIS_OS_API_BASE_URL) {
    npx supabase secrets set "OPALOSIS_OS_API_BASE_URL=$env:OPALOSIS_OS_API_BASE_URL" --project-ref $ProjectRef
  }
  if ($env:OPALOSIS_OS_API_KEY) {
    npx supabase secrets set "OPALOSIS_OS_API_KEY=$env:OPALOSIS_OS_API_KEY" --project-ref $ProjectRef
  } elseif ($env:OPALOSIS_API_KEY) {
    npx supabase secrets set "OPALOSIS_OS_API_KEY=$env:OPALOSIS_API_KEY" --project-ref $ProjectRef
  } else {
    Write-Host 'Sin OPALOSIS_OS_API_KEY. La función usará OPALOSIS_API_KEY si ya está en Supabase.' -ForegroundColor Yellow
  }
  npx supabase functions deploy $FunctionName --project-ref $ProjectRef
} finally {
  Pop-Location
}

Write-Host "Función lista: https://$ProjectRef.supabase.co/functions/v1/$FunctionName" -ForegroundColor Green
