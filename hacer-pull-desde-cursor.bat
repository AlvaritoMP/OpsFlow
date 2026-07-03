@echo off
echo ========================================
echo HACER PULL DESDE CURSOR - RESOLVER CONFLICTOS
echo ========================================
echo.
echo Cursor ya se conecto al repositorio!
echo.
echo El problema es que hay cambios locales en Dashboard.tsx
echo que bloquean el pull.
echo.
echo Este script:
echo 1. Guardara tus cambios locales
echo 2. Hara el pull de la ultima version
echo 3. Restaurara tus cambios locales
echo.
pause

cd /d "%~dp0"

echo.
echo [1] Guardando cambios locales en Dashboard.tsx...
git stash push -m "Cambios locales Dashboard antes de pull" 2>&1
echo.

echo [2] Haciendo PULL de origin/main...
git pull origin main 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR durante el pull
    echo Recuperando cambios locales...
    git stash pop 2>&1
    pause
    exit /b 1
)
echo.

echo [3] Recuperando cambios locales...
git stash pop 2>&1
echo.

echo [4] Estado final:
git status
echo.

echo ========================================
echo PULL COMPLETADO
echo ========================================
echo.
echo Ahora tienes:
echo - La ultima version del repositorio
echo - Tus cambios locales en Dashboard.tsx restaurados
echo.
echo Si hay conflictos en Dashboard.tsx, resuelvelos manualmente
echo.
pause
