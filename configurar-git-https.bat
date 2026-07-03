@echo off
echo ========================================
echo CONFIGURACION DE GIT PARA GITHUB HTTPS
echo ========================================
echo.

cd /d "%~dp0"

echo [PASO 1] Verificando configuracion actual...
git remote -v
echo.

echo [PASO 2] Limpiando credenciales antiguas...
git config --global --unset credential.helper
echo.

echo [PASO 3] Configurando Git para usar credenciales de Windows...
git config --global credential.helper manager-core
echo Credential helper configurado
echo.

echo [PASO 4] Configurando remoto a HTTPS...
git remote set-url origin https://github.com/AlvaritoMP/OpsFlow.git
echo Remoto configurado
echo.

echo [PASO 5] Verificando configuracion...
git remote -v
echo.

echo ========================================
echo IMPORTANTE: Personal Access Token
echo ========================================
echo.
echo Para que Git funcione con GitHub, necesitas un Personal Access Token
echo.
echo PASOS:
echo 1. Ve a: https://github.com/settings/tokens
echo 2. Click en "Generate new token" -^> "Generate new token (classic)"
echo 3. Nombre: "OpsFlow Development"
echo 4. Selecciona el scope: "repo" (todos los permisos de repo)
echo 5. Click en "Generate token"
echo 6. COPIA EL TOKEN (solo lo veras una vez)
echo.
echo Cuando hagas pull/push, Git te pedira credenciales:
echo - Usuario: tu_usuario_de_github
echo - Contrasena: PEGA_AQUI_EL_TOKEN (NO tu contrasena)
echo.
echo Presiona cualquier tecla para continuar...
pause >nul

echo.
echo [PASO 6] Probando conexion...
echo Esto te pedira credenciales. Usa el token como contrasena.
git ls-remote --heads origin 2>&1
if %ERRORLEVEL% EQU 0 (
    echo.
    echo EXITO: Conexion funcionando
) else (
    echo.
    echo AUN NO FUNCIONA: Sigue las instrucciones del Personal Access Token
)
echo.

pause
