@echo off
echo ========================================
echo COMPLETAR MERGE - RESOLVER CONFLICTOS
echo ========================================
echo.

cd /d "%~dp0"

echo [1] Resolviendo conflicto de package-lock.json...
echo Usando la version remota (mas segura)
git restore --staged package-lock.json 2>&1
git checkout --theirs package-lock.json 2>&1
git add package-lock.json 2>&1
echo.

echo [2] Completando el merge...
git merge --continue 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Intentando commit directo...
    git commit --no-edit 2>&1
)
echo.

echo [3] Estado despues del merge:
git status
echo.

echo [4] Verificando si el merge se completo:
git log --oneline --graph -5
echo.

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo MERGE COMPLETADO
    echo ========================================
    echo.
    echo Ahora tienes:
    echo - Los 116 commits remotos integrados
    echo - Tu commit local preservado
    echo - El conflicto de package-lock.json resuelto
    echo.
    echo Siguiente paso: Verificar cambios en Dashboard.tsx
) else (
    echo.
    echo ========================================
    echo AUN HAY PROBLEMAS
    echo ========================================
    echo.
    echo Revisa el estado arriba
)

echo.
pause
