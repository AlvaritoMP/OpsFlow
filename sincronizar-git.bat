@echo off
echo === SINCRONIZANDO CON GIT ==="
echo.

cd /d "%~dp0"

echo 1. Verificando estado actual...
git status
echo.

echo 2. Guardando cambios locales...
git add .
git commit -m "Cambios locales antes de sincronizar"
echo.

echo 3. Obteniendo ultima version del repositorio...
git fetch origin
echo.

echo 4. Comparando versiones...
echo --- Commits locales (ultimos 5) ---
git log --oneline -5
echo.
echo --- Commits remotos (ultimos 5) ---
git log origin/main --oneline -5
echo.

echo 5. Haciendo pull de origin/main...
git pull origin main
echo.

echo === COMPLETADO ===
echo.
pause
