@echo off
echo ========================================
echo VERIFICACION DEL ESTADO DE GIT
echo ========================================
echo.

cd /d "%~dp0"

echo [1] Estado actual del repositorio:
echo.
git status
echo.

echo [2] Ultimos 5 commits locales:
echo.
git log --oneline -5
echo.

echo [3] Intentando obtener informacion del remoto...
echo.
git fetch origin 2>&1
echo Codigo de salida: %ERRORLEVEL%
echo.

echo [4] Ultimos 5 commits remotos (origin/main):
echo.
git log origin/main --oneline -5 2>&1
echo.

echo [5] Comparando commits locales vs remotos:
echo.
git log HEAD..origin/main --oneline 2>&1
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Hay commits remotos que no tienes localmente
) else (
    echo.
    echo No hay commits remotos nuevos (o no se pudo comparar)
)
echo.

echo [6] Comparando commits locales que no estan en remoto:
echo.
git log origin/main..HEAD --oneline 2>&1
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Hay commits locales que no estan en el remoto
) else (
    echo.
    echo No hay commits locales nuevos (o no se pudo comparar)
)
echo.

echo [7] Cambios guardados en stash:
echo.
git stash list
echo.

echo [8] Verificando si HEAD y origin/main estan sincronizados:
echo.
for /f "tokens=*" %%a in ('git rev-parse HEAD') do set LOCAL_HASH=%%a
for /f "tokens=*" %%a in ('git rev-parse origin/main 2^>nul') do set REMOTE_HASH=%%a
echo Local HEAD:  %LOCAL_HASH%
echo Remote HEAD: %REMOTE_HASH%
if "%LOCAL_HASH%"=="%REMOTE_HASH%" (
    echo.
    echo ESTAN SINCRONIZADOS - Tienes la ultima version
) else (
    echo.
    echo NO ESTAN SINCRONIZADOS - Necesitas hacer pull
)
echo.

pause
