@echo off
echo === LIMPIANDO PROCESOS ===
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo === INICIANDO SERVIDOR ===
echo.

cd /d "%~dp0"
npm run dev

pause
