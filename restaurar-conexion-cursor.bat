@echo off
echo ========================================
echo RESTAURAR CONEXION DE CURSOR CON GITHUB
echo ========================================
echo.

cd /d "%~dp0"

echo [1] Verificando configuracion de Git...
echo.
git config --list | findstr /i "user credential remote"
echo.

echo [2] Verificando remoto configurado...
echo.
git remote -v
echo.

echo [3] Configurando Git para usar Windows Credential Manager...
echo.
git config --global credential.helper manager-core
echo Configurado
echo.

echo [4] Asegurando que el remoto sea HTTPS...
echo.
git remote set-url origin https://github.com/AlvaritoMP/OpsFlow.git
git remote -v
echo.

echo [5] Limpiando credenciales antiguas de GitHub...
echo.
cmdkey /delete:git:https://github.com 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Credencial eliminada
) else (
    echo No habia credencial guardada
)
echo.

echo ========================================
echo CONFIGURACION COMPLETADA
echo ========================================
echo.
echo PROXIMOS PASOS:
echo.
echo 1. Abre Cursor
echo 2. Ve a: View -^> Command Palette (Ctrl+Shift+P)
echo 3. Busca: "Git: Pull"
echo 4. O usa la terminal integrada de Cursor:
echo    git pull origin main
echo.
echo Cuando Git pida credenciales:
echo - Usuario: tu_usuario_de_github
echo - Password: PEGA_TU_PERSONAL_ACCESS_TOKEN
echo.
echo Si no tienes token:
echo - Ve a: https://github.com/settings/tokens
echo - Generate new token (classic)
echo - Scope: repo
echo - Copia el token
echo.
pause
