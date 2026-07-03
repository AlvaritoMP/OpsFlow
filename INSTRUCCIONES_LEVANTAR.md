# Instrucciones para Levantar la App

He ejecutado los comandos necesarios. El servidor debería estar iniciando.

## Si el servidor no levanta

Abre una **nueva terminal PowerShell** y ejecuta estos comandos **uno por uno**:

### Opción 1: Usar el script de limpieza (RECOMENDADO)
```powershell
cd c:\Users\alvaro\.cursor\OpsFlow
npm run dev:clean
```

Este script:
1. Detiene todos los procesos Node
2. Inicia el servidor de desarrollo

### Opción 2: Manual
```powershell
# 1. Ir al directorio
cd c:\Users\alvaro\.cursor\OpsFlow

# 2. Detener procesos Node
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force

# 3. Instalar dependencias (si es necesario)
npm install

# 4. Iniciar servidor
npm run dev
```

## Qué deberías ver

Cuando el servidor inicie correctamente, verás algo como:

```
  VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

## Verificar si el servidor está corriendo

En otra terminal, ejecuta:
```powershell
netstat -ano | findstr :3000
```

Si muestra una línea, el servidor está activo.

## Si ves errores

Copia y pega el mensaje de error completo aquí para poder ayudarte.
