@echo off
echo ========================================
echo LIMPIAR PUERTO Y LEVANTAR APP
echo ========================================
echo.

cd /d "%~dp0"

echo [1] Deteniendo todos los procesos Node...
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
    echo Proceso en puerto 3000 detenido (PID: %%a)
)
timeout /t 2 /nobreak >nul
echo.

echo [3] Verificando que el puerto este libre...
netstat -ano | findstr :3000 >nul
if %ERRORLEVEL% EQU 0 (
    echo ADVERTENCIA: Puerto 3000 aun ocupado
) else (
    echo Puerto 3000 libre
)
echo.

echo [4] Verificando dependencias...
if exist node_modules (
    echo Dependencias instaladas
) else (
    echo Instalando dependencias...
    npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR al instalar dependencias
        pause
        exit /b 1
    )
)
echo.

echo [5] Iniciando servidor de desarrollo...
echo.
echo El servidor se iniciara en segundo plano.
echo Abre tu navegador en: http://localhost:3000
echo.
echo Presiona Ctrl+C en esta ventana para detener el servidor.
echo.
start /B npm run dev
echo.

echo Esperando 10 segundos para que el servidor inicie...
timeout /t 10 /nobreak >nul
echo.

echo [6] Verificando si el servidor esta corriendo...
netstat -ano | findstr :3000 >nul
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo ✅ SERVIDOR CORRIENDO
    echo ========================================
    echo.
    echo Abre tu navegador en: http://localhost:3000
    echo.
    netstat -ano | findstr :3000
) else (
    echo.
    echo ========================================
    echo ❌ SERVIDOR NO DETECTADO
    echo ========================================
    echo.
    echo El servidor puede estar iniciando todavia.
    echo Espera unos segundos mas y verifica en: http://localhost:3000
    echo.
    echo Si no funciona, ejecuta manualmente:
    echo   npm run dev
)
echo.
pause
