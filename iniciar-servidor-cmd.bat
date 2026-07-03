@echo off
echo ========================================
echo INICIAR SERVIDOR DE DESARROLLO
echo ========================================
echo.

cd /d "%~dp0"

echo [1] Deteniendo procesos Node existentes...
taskkill /F /IM node.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Procesos Node detenidos
) else (
    echo No habia procesos Node ejecutandose
)
echo.

echo [2] Limpiando puerto 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo.

echo [3] Iniciando servidor de desarrollo...
echo.
echo El servidor se iniciara en esta ventana.
echo Abre tu navegador en: http://localhost:3000
echo.
echo Presiona Ctrl+C para detener el servidor.
echo.

npm run dev

pause
