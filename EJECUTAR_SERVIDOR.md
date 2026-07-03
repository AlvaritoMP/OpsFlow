# Cómo Ejecutar el Servidor

## Problema Actual
El servidor no está levantando. Sigue estos pasos:

## Opción 1: Usar el Script de Diagnóstico (RECOMENDADO)

1. Abre PowerShell en el directorio del proyecto
2. Ejecuta el script de diagnóstico:

```powershell
cd c:\Users\alvaro\.cursor\OpsFlow
.\diagnosticar-servidor.ps1
```

Este script:
- ✅ Verifica que Node.js y npm estén instalados
- ✅ Detiene procesos Node que puedan estar interfiriendo
- ✅ Verifica que las dependencias estén instaladas
- ✅ Intenta iniciar el servidor y muestra cualquier error

## Opción 2: Ejecutar Manualmente

Abre PowerShell y ejecuta estos comandos **uno por uno**, copiando cada salida:

```powershell
# 1. Ir al directorio
cd c:\Users\alvaro\.cursor\OpsFlow

# 2. Detener procesos Node
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force

# 3. Instalar dependencias (si es necesario)
npm install

# 4. Iniciar servidor (IMPORTANTE: copia toda la salida que aparezca)
npm run dev
```

## ¿Qué Esperar?

Cuando el servidor inicie correctamente, deberías ver algo como:

```
  VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

## Si Ves Errores

**COPIA Y PEGA TODA LA SALIDA** que aparezca, especialmente:
- Cualquier mensaje de error en rojo
- Mensajes de "Error:", "Failed:", "Cannot find module"
- Cualquier stack trace completo

## Verificar si el Servidor está Corriendo

En otra terminal PowerShell, ejecuta:

```powershell
netstat -ano | findstr :3000
```

Si muestra una línea con "LISTENING", el servidor está corriendo.

Si no muestra nada, el servidor no está corriendo.
