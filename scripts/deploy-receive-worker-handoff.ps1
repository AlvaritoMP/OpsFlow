#Requires -Version 5.1
<#
.SYNOPSIS
  Despliega la Edge Function receive-worker-handoff en Supabase OpsFlow.

.DESCRIPTION
  Configura secrets, vincula el proyecto y despliega la función de ingesta ATS.
  Requiere Supabase Personal Access Token y Service Role Key del proyecto OpsFlow.

.PARAMETER AccessToken
  Supabase Personal Access Token (sbp_...). Si no se pasa, usa $env:SUPABASE_ACCESS_TOKEN
  o solicita entrada segura.

.PARAMETER ServiceRoleKey
  Service role key del proyecto. Si no se pasa, usa $env:SUPABASE_SERVICE_ROLE_KEY
  o solicita entrada segura.

.PARAMETER IngestSecret
  Secret compartido con Opalo ATS. Si no se pasa, se genera uno aleatorio.

.PARAMETER SkipTest
  No ejecutar POST de prueba tras el despliegue.

.PARAMETER ProjectRef
  Ref del proyecto Supabase OpsFlow (default: rlnfehtgspnkyeevduli).
#>
param(
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN,
  [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY,
  [string]$IngestSecret = $env:OPSFLOW_HANDOFF_INGEST_SECRET,
  [switch]$SkipTest,
  [string]$ProjectRef = 'rlnfehtgspnkyeevduli'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$SupabaseUrl = "https://$ProjectRef.supabase.co"
$FunctionName = 'receive-worker-handoff'
$EndpointUrl = "$SupabaseUrl/functions/v1/$FunctionName"
$SamplePayload = Join-Path $ProjectRoot 'scripts\sample-worker-handoff-payload.json'

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Ensure-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "No se encontró '$Name' en PATH."
  }
}

function Get-SecureInput([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function New-IngestSecret {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

Write-Host '========================================' -ForegroundColor Green
Write-Host ' Deploy receive-worker-handoff (OpsFlow) ' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green

Ensure-Command 'node'
Ensure-Command 'npm'

$FunctionPath = Join-Path $ProjectRoot "supabase\functions\$FunctionName\index.ts"
if (-not (Test-Path $FunctionPath)) {
  throw "No se encontró $FunctionPath"
}

if ([string]::IsNullOrWhiteSpace($AccessToken)) {
  $AccessToken = Get-SecureInput 'Supabase Personal Access Token (sbp_...)'
}
if ([string]::IsNullOrWhiteSpace($AccessToken)) {
  throw 'Se requiere Supabase Access Token. Obtener en: https://supabase.com/dashboard/account/tokens'
}

if ([string]::IsNullOrWhiteSpace($ServiceRoleKey)) {
  $ServiceRoleKey = Get-SecureInput 'Service Role Key del proyecto OpsFlow'
}
if ([string]::IsNullOrWhiteSpace($ServiceRoleKey)) {
  throw 'Se requiere SUPABASE_SERVICE_ROLE_KEY del proyecto OpsFlow.'
}

if ([string]::IsNullOrWhiteSpace($IngestSecret)) {
  $IngestSecret = New-IngestSecret
  Write-Host 'Generado nuevo OPSFLOW_HANDOFF_INGEST_SECRET.' -ForegroundColor Yellow
} else {
  Write-Host 'Usando OPSFLOW_HANDOFF_INGEST_SECRET existente.' -ForegroundColor Yellow
}

Set-Location $ProjectRoot

Write-Step 'Iniciando sesión en Supabase CLI'
npx supabase login --token $AccessToken | Out-Host

Write-Step "Vinculando proyecto $ProjectRef"
npx supabase link --project-ref $ProjectRef --yes | Out-Host

Write-Step 'Configurando secrets de Edge Functions'
npx supabase secrets set `
  "OPSFLOW_HANDOFF_INGEST_SECRET=$IngestSecret" `
  "SUPABASE_URL=$SupabaseUrl" `
  "SUPABASE_SERVICE_ROLE_KEY=$ServiceRoleKey" | Out-Host

Write-Step "Desplegando función $FunctionName"
npx supabase functions deploy $FunctionName --project-ref $ProjectRef --no-verify-jwt | Out-Host

Write-Step 'Verificando endpoint'
Start-Sleep -Seconds 3
try {
  $probe = Invoke-WebRequest -Uri $EndpointUrl -Method POST -ContentType 'application/json' -Body '{}' -UseBasicParsing -TimeoutSec 30
  Write-Host "POST sin auth respondió $($probe.StatusCode) (esperado 401)" -ForegroundColor Yellow
} catch {
  if ($_.Exception.Response) {
    $code = [int]$_.Exception.Response.StatusCode
    if ($code -eq 401) {
      Write-Host 'Endpoint activo: 401 Unauthorized sin token (correcto).' -ForegroundColor Green
    } elseif ($code -eq 404) {
      throw 'La función sigue respondiendo 404. Revisa el despliegue en Supabase Dashboard.'
    } else {
      Write-Host "Endpoint respondió HTTP $code" -ForegroundColor Yellow
    }
  } else {
    throw $_
  }
}

if (-not $SkipTest) {
  if (-not (Test-Path $SamplePayload)) {
    Write-Host "No se encontró $SamplePayload; omitiendo POST de prueba." -ForegroundColor Yellow
  } else {
    Write-Step 'POST de prueba con payload de ejemplo'
    $testPackageId = [guid]::NewGuid().ToString()
    $payloadRaw = Get-Content $SamplePayload -Raw | ConvertFrom-Json
    $payloadRaw.sourcePackageId = $testPackageId
    $payloadJson = $payloadRaw | ConvertTo-Json -Depth 20 -Compress

    $headers = @{
      Authorization = "Bearer $IngestSecret"
      'Content-Type' = 'application/json'
    }

    try {
      $response = Invoke-RestMethod -Uri $EndpointUrl -Method POST -Headers $headers -Body $payloadJson -TimeoutSec 60
      Write-Host 'POST de prueba OK:' -ForegroundColor Green
      $response | ConvertTo-Json -Depth 5 | Write-Host
    } catch {
      if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        throw "POST de prueba falló: $body"
      }
      throw
    }
  }
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host ' DESPLIEGUE COMPLETADO' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host "Endpoint: $EndpointUrl"
Write-Host "Secret (compartir con Opalo ATS): $IngestSecret" -ForegroundColor Yellow
Write-Host "`nGuarda el secret en un gestor seguro. No lo subas al repositorio." -ForegroundColor Yellow
Write-Host 'Tras commit + redeploy del frontend, verifica menú Recepción ATS en OpsFlow.' -ForegroundColor White
