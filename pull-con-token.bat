@echo off
echo ========================================
echo PULL CON TOKEN (si es necesario)
echo ========================================
echo.
echo Si Git te pide credenciales:
echo - Usuario: tu_usuario_de_github
echo - Password: PEGA_TU_PERSONAL_ACCESS_TOKEN
echo.
echo ========================================
echo.

cd /d "%~dp0"

echo Guardando cambios locales...
git stash push -m "Cambios locales antes de pull" 2>&1
echo.

echo Haciendo PULL de origin/main...
echo (Si te pide credenciales, usa el Personal Access Token)
git pull origin main
echo.

if %ERRORLEVEL% EQU 0 (
    echo Pull exitoso
    echo.
    echo Recuperando cambios locales...
    git stash pop 2>&1
    echo.
    echo Estado final:
    git status
) else (
    echo ERROR en pull
    echo Recuperando cambios locales...
    git stash pop 2>&1
)
echo.

pause
