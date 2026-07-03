# Script para verificar y subir cambios a Git
Write-Host "=== Verificación y Actualización Git ===" -ForegroundColor Cyan

# 1. Verificar remoto
Write-Host "`n1. Verificando remoto..." -ForegroundColor Yellow
$remoteUrl = git remote get-url origin 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Configurando remoto..." -ForegroundColor Yellow
    git remote add origin git@github.com:AlvaritoMP/OpsFlow.git
} else {
    Write-Host "Remoto actual: $remoteUrl" -ForegroundColor Green
    git remote set-url origin git@github.com:AlvaritoMP/OpsFlow.git
    Write-Host "Remoto configurado a: git@github.com:AlvaritoMP/OpsFlow.git" -ForegroundColor Green
}

# 2. Verificar rama actual
Write-Host "`n2. Verificando rama actual..." -ForegroundColor Yellow
$currentBranch = git branch --show-current
Write-Host "Rama actual: $currentBranch" -ForegroundColor Green

# 3. Hacer fetch
Write-Host "`n3. Haciendo fetch del remoto..." -ForegroundColor Yellow
git fetch origin
if ($LASTEXITCODE -eq 0) {
    Write-Host "Fetch completado" -ForegroundColor Green
} else {
    Write-Host "Error en fetch" -ForegroundColor Red
}

# 4. Hacer pull
Write-Host "`n4. Haciendo pull de la última versión..." -ForegroundColor Yellow
if ($currentBranch -eq "main") {
    git pull origin main
} elseif ($currentBranch -eq "master") {
    git pull origin master
} else {
    git pull origin $currentBranch
}
if ($LASTEXITCODE -eq 0) {
    Write-Host "Pull completado" -ForegroundColor Green
} else {
    Write-Host "Error en pull o no hay cambios remotos" -ForegroundColor Yellow
}

# 5. Verificar estado
Write-Host "`n5. Estado actual del repositorio:" -ForegroundColor Yellow
git status

# 6. Agregar archivos
Write-Host "`n6. Agregando archivos..." -ForegroundColor Yellow
git add .
$status = git status --short
if ($status) {
    Write-Host "Archivos a commitear:" -ForegroundColor Green
    Write-Host $status
} else {
    Write-Host "No hay cambios para commitear" -ForegroundColor Yellow
    exit 0
}

# 7. Hacer commit
Write-Host "`n7. Haciendo commit..." -ForegroundColor Yellow
git commit -m "feat: Migración a Google Maps - Implementación completa con geocodificación y componente de mapa interactivo"
if ($LASTEXITCODE -eq 0) {
    Write-Host "Commit realizado" -ForegroundColor Green
} else {
    Write-Host "Error en commit" -ForegroundColor Red
    exit 1
}

# 8. Hacer push
Write-Host "`n8. Haciendo push..." -ForegroundColor Yellow
if ($currentBranch -eq "main") {
    git push origin main
} elseif ($currentBranch -eq "master") {
    git push origin master
} else {
    git push -u origin $currentBranch
}
if ($LASTEXITCODE -eq 0) {
    Write-Host "Push completado exitosamente!" -ForegroundColor Green
} else {
    Write-Host "Error en push" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Proceso Completado ===" -ForegroundColor Cyan
