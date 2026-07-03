@echo off
echo ========================================
echo VERIFICAR SI EL MERGE FUE EXITOSO
echo ========================================
echo.

cd /d "%~dp0"

echo [1] Estado actual del repositorio:
echo.
git status
echo.

echo [2] Verificando si hay conflictos:
echo.
git diff --check
if %ERRORLEVEL% EQU 0 (
    echo No hay marcadores de conflicto
) else (
    echo HAY CONFLICTOS - Necesitan resolverse
)
echo.

echo [3] Comparando HEAD local vs remoto:
echo.
for /f "tokens=*" %%a in ('git rev-parse HEAD') do set LOCAL_HASH=%%a
for /f "tokens=*" %%a in ('git rev-parse origin/main 2^>nul') do set REMOTE_HASH=%%a
echo Local HEAD:  %LOCAL_HASH%
echo Remote HEAD: %REMOTE_HASH%
echo.

echo [4] Ultimos 3 commits locales:
echo.
git log --oneline -3
echo.

echo [5] Ultimo commit remoto:
echo.
git log origin/main --oneline -1
echo.

echo [6] Verificando si estan sincronizados:
echo.
git log HEAD..origin/main --oneline 2>&1 | findstr /C:"." >nul
if %ERRORLEVEL% EQU 0 (
    echo AUN HAY COMMITS REMOTOS QUE NO TIENES
) else (
    echo Ya tienes todos los commits remotos
)
echo.

echo [7] Cambios en Dashboard.tsx:
echo.
git diff components/Dashboard.tsx | findstr /C:"+" /C:"-" | findstr /V "^+++" | findstr /V "^---" | findstr /V "^@@" | findstr /C:"." >nul
if %ERRORLEVEL% EQU 0 (
    echo Hay cambios en Dashboard.tsx
) else (
    echo No hay cambios pendientes en Dashboard.tsx
)
echo.

pause
