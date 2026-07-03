@echo off
echo ========================================
echo OBTENER VERSION REMOTA COMPLETA
echo ========================================
echo.
echo ADVERTENCIA: Esto eliminara TODOS los cambios locales
echo y dejara tu PC con exactamente la version remota.
echo.
echo Presiona Ctrl+C para cancelar, o cualquier tecla para continuar...
pause >nul

cd /d "%~dp0"

echo.
echo [1] Descartando todos los cambios locales...
git reset --hard origin/main 2>&1
echo.

echo [2] Eliminando archivos no rastreados...
git clean -fd 2>&1
echo.

echo [3] Verificando estado final...
git status
echo.

echo [4] Verificando ultimo commit...
git log --oneline -3
echo.

echo ========================================
echo COMPLETADO
echo ========================================
echo.
echo Ahora tienes exactamente la version remota.
echo Todos los cambios locales fueron descartados.
echo.
pause
