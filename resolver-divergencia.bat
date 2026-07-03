@echo off
echo ========================================
echo RESOLVER DIVERGENCIA DE RAMAS
echo ========================================
echo.
echo Tu rama local y remota han divergido:
echo - Tienes 1 commit local que no esta en remoto
echo - El remoto tiene 116 commits nuevos
echo.
echo Este script:
echo 1. Guardara tus cambios locales
echo 2. Resolvera el conflicto de package-lock.json
echo 3. Integrara los 116 commits remotos
echo 4. Restaurara tus cambios locales
echo.
pause

cd /d "%~dp0"

echo.
echo [1] Guardando cambios locales...
git stash push -m "Cambios locales antes de merge" 2>&1
echo.

echo [2] Resolviendo conflicto de package-lock.json...
git restore --staged package-lock.json 2>&1
git checkout --theirs package-lock.json 2>&1
git add package-lock.json 2>&1
echo.

echo [3] Integrando commits remotos (esto puede tardar)...
git pull origin main --no-edit 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR durante el merge
    echo Recuperando cambios locales...
    git stash pop 2>&1
    pause
    exit /b 1
)
echo.

echo [4] Recuperando cambios locales...
git stash pop 2>&1
echo.

echo [5] Estado final:
git status
echo.

echo ========================================
echo COMPLETADO
echo ========================================
echo.
echo Ahora tienes:
echo - Los 116 commits remotos integrados
echo - Tu commit local preservado
echo - Tus cambios locales restaurados
echo.
echo Si hay conflictos, resuelvelos manualmente
echo.
pause
