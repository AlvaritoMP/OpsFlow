@echo off
echo ========================================
echo VERIFICAR SI EL TOKEN FUNCIONA
echo ========================================
echo.

cd /d "%~dp0"

echo Este script probara la conexion con GitHub
echo Si tu token esta guardado y funciona, deberia conectarse
echo Si no funciona, te pedira credenciales nuevamente
echo.

pause

echo.
echo [PASO 1] Probando conexion con GitHub...
echo Si aparece un prompt, es que las credenciales no estan guardadas
echo o el token expiro
echo.
git ls-remote --heads origin 2>&1

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo EXITO: La conexion funciona
    echo ========================================
    echo.
    echo Tu token esta funcionando correctamente
    echo Puedes hacer pull normalmente
) else (
    echo.
    echo ========================================
    echo ERROR: No se pudo conectar
    echo ========================================
    echo.
    echo Posibles causas:
    echo 1. El token expiro
    echo 2. Las credenciales no estan guardadas
    echo 3. El token fue revocado
    echo.
    echo SOLUCION:
    echo 1. Ve a: https://github.com/settings/tokens
    echo 2. Verifica si tienes tokens activos
    echo 3. Si no hay tokens o expiraron, crea uno nuevo
    echo 4. Ejecuta limpiar-y-restaurar-credenciales.bat primero
    echo 5. Luego ejecuta pull-con-token.bat e ingresa el nuevo token
)

echo.
pause
