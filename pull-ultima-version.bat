@echo off
echo ========================================
echo PULL DE LA ULTIMA VERSION DEL REPOSITORIO
echo ========================================
echo.

cd /d "%~dp0"

echo [PASO 1] Verificando remoto actual...
git remote -v
echo.

echo [PASO 2] Probando conexion con SSH...
git ls-remote --heads origin 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: No se puede conectar con SSH
    echo Cambiando a HTTPS...
    git remote set-url origin https://github.com/AlvaritoMP/OpsFlow.git
    echo Remoto cambiado a HTTPS
    echo.
    echo Verificando nueva configuracion...
    git remote -v
    echo.
    echo Probando conexion con HTTPS...
    git ls-remote --heads origin 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ERROR: Tampoco se puede conectar con HTTPS
        echo Verifica tu conexion a internet
        pause
        exit /b 1
    )
) else (
    echo Conexion SSH OK
)
echo.

echo [PASO 3] Obteniendo informacion del remoto...
git fetch origin
if %ERRORLEVEL% NEQ 0 (
    echo ERROR al hacer fetch
    pause
    exit /b 1
)
echo Fetch completado
echo.

echo [PASO 4] Comparando versiones...
echo.
echo === ULTIMOS 5 COMMITS LOCALES ===
git log --oneline -5
echo.
echo === ULTIMOS 5 COMMITS REMOTOS ===
git log origin/main --oneline -5 2>&1
echo.

echo [PASO 5] Guardando cambios locales temporalmente...
git stash push -m "Cambios locales antes de pull" 2>&1
echo.

echo [PASO 6] Haciendo PULL de origin/main...
git pull origin main
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR al hacer pull
    echo.
    echo Recuperando cambios locales...
    git stash pop 2>&1
    pause
    exit /b 1
)
echo Pull completado exitosamente
echo.

echo [PASO 7] Recuperando cambios locales...
git stash pop 2>&1
echo.

echo [PASO 8] Estado final del repositorio...
git status
echo.

echo ========================================
echo COMPLETADO
echo ========================================
echo.
echo Ahora tienes la ultima version del repositorio
echo Tus cambios locales estan preservados
echo.
pause
