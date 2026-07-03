@echo off
echo ========================================
echo COMPLETAR PULL DE LA ULTIMA VERSION
echo ========================================
echo.
echo Este script completara el pull de la ultima version
echo Si Git pide credenciales, necesitaras:
echo   - Usuario: tu_usuario_de_github
echo   - Password: tu_Personal_Access_Token
echo.
echo Si no tienes token, ve a: https://github.com/settings/tokens
echo.
pause

cd /d "%~dp0"

echo.
echo [1] Verificando estado...
git status
echo.

echo [2] Haciendo PULL de origin/main...
echo (Si pide credenciales, ingresa usuario y token)
git pull origin main
echo.

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo EXITO: Pull completado
    echo ========================================
    echo.
    echo Recuperando cambios locales guardados...
    git stash pop 2>&1
    echo.
    echo Estado final:
    git status
    echo.
    echo ========================================
    echo COMPLETADO
    echo ========================================
    echo.
    echo Ahora tienes la ultima version del repositorio
    echo Tus cambios locales estan preservados
) else (
    echo.
    echo ========================================
    echo ERROR: No se pudo hacer pull
    echo ========================================
    echo.
    echo Posibles causas:
    echo 1. Credenciales incorrectas
    echo 2. Token expirado o invalido
    echo 3. Problema de conexion
    echo.
    echo SOLUCION:
    echo 1. Verifica tu token en: https://github.com/settings/tokens
    echo 2. Crea un nuevo token si es necesario
    echo 3. Ejecuta este script nuevamente
    echo.
    echo Recuperando cambios locales...
    git stash pop 2>&1
)

echo.
pause
