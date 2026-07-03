@echo off
echo ========================================
echo LIMPIAR Y RESTAURAR CREDENCIALES DE GIT
echo ========================================
echo.

cd /d "%~dp0"

echo [PASO 1] Verificando credenciales guardadas de GitHub...
echo.
echo Buscando credenciales en Windows Credential Manager...
cmdkey /list | findstr /i "github"
echo.

echo [PASO 2] Limpiando credenciales antiguas de Git/GitHub...
echo.
echo Eliminando credenciales de git:https://github.com...
cmdkey /delete:git:https://github.com 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Credencial eliminada
) else (
    echo No se encontro credencial guardada (esto es normal)
)
echo.

echo Eliminando credenciales generic de github.com...
cmdkey /delete:github.com 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Credencial eliminada
) else (
    echo No se encontro credencial guardada
)
echo.

echo [PASO 3] Limpiando configuracion de Git...
git config --global --unset credential.helper
echo Limpiado
echo.

echo [PASO 4] Configurando Git para usar Windows Credential Manager...
git config --global credential.helper manager-core
echo Configurado
echo.

echo [PASO 5] Verificando remoto...
git remote -v
echo.

echo ========================================
echo CREDENCIALES LIMPIADAS
echo ========================================
echo.
echo Las credenciales antiguas han sido eliminadas.
echo.
echo PROXIMOS PASOS:
echo.
echo 1. Si tu token aun es valido:
echo    - Ejecuta pull-con-token.bat o pull-ultima-version.bat
echo    - Cuando Git pida credenciales, ingresa:
echo      Usuario: tu_usuario_de_github
echo      Password: PEGA_TU_TOKEN
echo.
echo 2. Si el token expiro o no lo recuerdas:
echo    - Ve a: https://github.com/settings/tokens
echo    - Crea un nuevo token (Generate new token -^> classic)
echo    - Scope: repo
echo    - Copia el token
echo    - Usalo cuando Git pida credenciales
echo.
echo 3. Verificar si hay tokens existentes:
echo    - Ve a: https://github.com/settings/tokens
echo    - Revisa si tienes tokens activos
echo    - Si hay uno activo, puedes revocarlo y crear uno nuevo
echo.
pause
