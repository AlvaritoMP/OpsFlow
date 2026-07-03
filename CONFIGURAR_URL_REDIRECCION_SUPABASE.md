# Configurar URL de Redirección en Supabase

## Problema
Los enlaces de recuperación de contraseña apuntan a `localhost:3000` en lugar de tu dominio de producción.

## Solución: Configurar URL de Redirección en Supabase

### Paso 1: Ir a Configuración de Auth
1. Ve a **Supabase Dashboard**
2. Selecciona tu proyecto
3. Ve a **Authentication** → **URL Configuration** (en el menú lateral izquierdo)

### Paso 2: Configurar Site URL
1. En la sección **"Site URL"**, ingresa tu dominio de producción:
   ```
   https://opalo-opsflow.bouasv.easypanel.host
   ```

### Paso 3: Configurar Redirect URLs
1. En la sección **"Redirect URLs"**, agrega:
   ```
   https://opalo-opsflow.bouasv.easypanel.host/**
   ```
   O más específicamente:
   ```
   https://opalo-opsflow.bouasv.easypanel.host/
   https://opalo-opsflow.bouasv.easypanel.host/#*
   ```

2. Haz clic en **"Add"** o **"Save"**

### Paso 4: Verificar
1. Después de guardar, solicita un nuevo enlace de recuperación de contraseña
2. El enlace debería apuntar a tu dominio de producción en lugar de `localhost:3000`

## Nota Importante
- La URL debe incluir el protocolo (`https://`)
- No debe terminar con `/` a menos que sea necesario
- El `**` permite cualquier ruta después del dominio

## Alternativa: Usar el Token Manualmente

Si no puedes cambiar la configuración de Supabase inmediatamente, puedes:

1. Copiar el `access_token` del enlace del email
2. Abrir la consola del navegador (F12) en tu app
3. Ejecutar:
   ```javascript
   const token = 'TU_ACCESS_TOKEN_AQUI';
   window.location.hash = `#access_token=${token}&type=recovery`;
   window.location.reload();
   ```

Esto activará el modal de recuperación de contraseña en la app.
