@echo off
echo ========================================
echo VERIFICACION Y PULL DEL REPOSITORIO GIT
echo ========================================
echo.

cd /d "%~dp0"

echo [1/6] Verificando directorio...
cd
echo Directorio actual: %CD%
echo.

echo [2/6] Verificando remoto configurado...
git remote -v
echo.

echo [3/6] Verificando rama actual...
git branch --show-current
echo.

echo [4/6] Verificando estado local...
git status
echo.

echo [5/6] Obteniendo informacion del remoto...
git fetch origin
echo Codigo de salida: %ERRORLEVEL%
echo.

echo [6/6] Comparando commits locales vs remotos...
echo.
echo === ULTIMOS 5 COMMITS LOCALES ===
git log --oneline -5
echo.
echo === ULTIMOS 5 COMMITS REMOTOS (origin/main) ===
git log origin/main --oneline -5 2>&1
echo.

echo ========================================
echo Si todo esta bien, ahora haras el PULL:
echo ========================================
echo.
echo Presiona cualquier tecla para hacer PULL de origin/main...
pause >nul

echo.
echo Haciendo PULL de origin/main...
git pull origin main
echo.
echo Codigo de salida del pull: %ERRORLEVEL%
echo.

pause
