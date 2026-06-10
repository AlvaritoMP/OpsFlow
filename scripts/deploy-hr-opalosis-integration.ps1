#Requires -Version 5.1
<#
.SYNOPSIS
  Despliega la Edge Function hr-opalosis-integration en Supabase OpsFlow.

.DESCRIPTION
  Integración outbound OpsFlow → Opalosis (ingresos RRHH).
  Sin OPALOSIS_API_BASE_URL / OPALOSIS_API_KEY la función opera en modo simulación.

.PARAMETER AccessToken
  Supabase Personal Access Token (sbp_...).

.PARAMETER ServiceRoleKey
  Service role key del proyecto OpsFlow.

.PARAMETER SkipTest
  No ejecutar POST de prueba tras el despliegue.

.PARAMETER ProjectRef
  Ref del proyecto Supabase OpsFlow (default: rlnfehtgspnkyeevduli).
#>
param(
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN,
  [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY,
  [switch]$SkipTest,
  [string]$ProjectRef = 'rlnfehtgspnkyeevduli'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$SupabaseUrl = "https://$ProjectRef.supabase.co"
$FunctionName = 'hr-opalosis-integration'
$EndpointUrl = "$SupabaseUrl/functions/v1/$FunctionName"

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Ensure-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "No se encontró '$Name' en PATH."
  }
}

Write-Host '===========================================' -ForegroundColor Green
Write-Host ' Deploy hr-opalosis-integration (OpsFlow) ' -ForegroundColor Green
Write-Host '===========================================' -ForegroundColor Green

Ensure-Command 'node'
Ensure-Command 'npm'

$FunctionPath = Join-Path $ProjectRoot "supabase\functions\$FunctionName\index.ts"
if (-not (Test-Path $FunctionPath)) {
  throw "No se encontró $FunctionPath"
}

if ([string]::IsNullOrWhiteSpace($AccessToken)) {
  $AccessToken = Read-Host 'Supabase Access Token (sbp_...)'
}

if ([string]::IsNullOrWhiteSpace($ServiceRoleKey)) {
  $secure = Read-Host 'Service Role Key' -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $ServiceRoleKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

$env:SUPABASE_ACCESS_TOKEN = $AccessToken

Write-Step 'Vinculando proyecto Supabase'
Push-Location $ProjectRoot
try {
  npx supabase link --project-ref $ProjectRef 2>$null
} catch {
  Write-Host 'Link puede requerir confirmación previa; continuando...' -ForegroundColor Yellow
}

Write-Step 'Configurando secrets (modo simulación si no hay URL Opalosis)'
if ($env:OPALOSIS_API_BASE_URL) {
  npx supabase secrets set "OPALOSIS_API_BASE_URL=$env:OPALOSIS_API_BASE_URL"
}
if ($env:OPALOSIS_API_KEY) {
  npx supabase secrets set "OPALOSIS_API_KEY=$env:OPALOSIS_API_KEY"
}
if ($env:OPALOSIS_USE_MOCK) {
  npx supabase secrets set "OPALOSIS_USE_MOCK=$env:OPALOSIS_USE_MOCK"
}

Write-Step 'Desplegando Edge Function'
npx supabase functions deploy $FunctionName --project-ref $ProjectRef

Pop-Location

Write-Host "`nDespliegue completado." -ForegroundColor Green
Write-Host "Endpoint: $EndpointUrl" -ForegroundColor Yellow
Write-Host "`nIMPORTANTE: Ejecute la migración SQL antes de usar la UI:" -ForegroundColor Yellow
Write-Host "  database/migrations/MIGRATION_HR_OPALOSIS_INTEGRATION.sql" -ForegroundColor White

if (-not $SkipTest) {
  Write-Step 'Prueba de fetch-unidades (modo simulación)'
  $body = '{"action":"fetch-unidades"}'
  $headers = @{
    'Authorization' = "Bearer $ServiceRoleKey"
    'Content-Type'  = 'application/json'
  }
  try {
    $response = Invoke-RestMethod -Uri $EndpointUrl -Method Post -Headers $headers -Body $body
    Write-Host 'Respuesta OK:' -ForegroundColor Green
    $response | ConvertTo-Json -Depth 5
  } catch {
    Write-Host "Prueba fallida (¿migración SQL ejecutada?): $_" -ForegroundColor Red
  }
}

Write-Host "`nDocumentación: HR_OPALOSIS_INTEGRATION.md" -ForegroundColor Cyan
