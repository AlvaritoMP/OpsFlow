# ✅ Solución al Error de PowerShell

El error es porque PowerShell tiene la ejecución de scripts deshabilitada.

## Opción 1: Usar el archivo .bat (MÁS FÁCIL) ✅

1. Ve a: `c:\Users\alvaro\.cursor\OpsFlow`
2. Haz **doble clic** en `iniciar-servidor.bat`
3. El servidor debería iniciar automáticamente

## Opción 2: Habilitar PowerShell temporalmente

Abre PowerShell como **Administrador** y ejecuta:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
```

Luego ejecuta:
```powershell
cd c:\Users\alvaro\.cursor\OpsFlow
npm run dev
```

## Opción 3: Usar CMD en lugar de PowerShell

1. Presiona **Win + R**
2. Escribe: `cmd` y presiona Enter
3. Ejecuta:

```cmd
cd c:\Users\alvaro\.cursor\OpsFlow
npm run dev
```

---

**Recomendación:** Usa la **Opción 1** (el archivo .bat) - es la más fácil y no requiere cambiar configuraciones.
