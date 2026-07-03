# Pasos para Levantar la App

Si el servidor no inicia, sigue estos pasos en tu terminal:

## 1. Limpiar Procesos Node
```powershell
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
```

## 2. Verificar que el puerto 3000 esté libre
```powershell
netstat -ano | findstr :3000
```
Si muestra algo, el puerto está ocupado. Debes detener ese proceso.

## 3. Instalar Dependencias
```bash
npm install
```

## 4. Verificar que la dependencia de Google Maps esté instalada
```bash
npm list @vis.gl/react-google-maps
```

Si no está instalada:
```bash
npm install @vis.gl/react-google-maps --save
```

## 5. Verificar Errores de TypeScript
```bash
npx tsc --noEmit
```

## 6. Iniciar el Servidor
```bash
npm run dev
```

O usa el script de limpieza:
```bash
npm run dev:clean
```

## 7. Revisar la Salida

Deberías ver algo como:
```
VITE v6.x.x  ready in xxx ms

➜  Local:   http://localhost:3000/
➜  Network: use --host to expose
```

## Si hay Errores

Comparte el mensaje de error completo para poder ayudarte.
