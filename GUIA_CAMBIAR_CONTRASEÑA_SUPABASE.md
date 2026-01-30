# Guía: Actualizar Contraseña en Supabase Auth

## Objetivo
Sincronizar tu contraseña en Supabase Auth para que coincida con la contraseña de la tabla `users`, permitiendo que puedas subir imágenes a Storage.

## Pasos Detallados

### Paso 1: Acceder a Supabase Dashboard
1. Ve a [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Inicia sesión con tu cuenta de Supabase
3. Selecciona tu proyecto: **OpsFlow** (o el nombre de tu proyecto)

### Paso 2: Ir a Authentication → Users
1. En el menú lateral izquierdo, busca la sección **"Authentication"**
2. Haz clic en **"Users"** (debería estar en la parte superior del menú de Authentication)

### Paso 3: Buscar tu Usuario
1. En la tabla de usuarios, busca tu email: **`aminano@opaloperu.com`**
2. Haz clic directamente en la fila de tu usuario (o en el email)

### Paso 4: Abrir el Panel de Usuario
1. Al hacer clic en tu usuario, se abrirá un panel a la derecha con los detalles del usuario
2. En este panel verás varias secciones:
   - **Email** (con estado "Enabled")
   - **Reset password**
   - **Send Magic Link**
   - **Danger zone**

### Paso 5: Resetear la Contraseña
1. En la sección **"Reset password"**, verás:
   - Descripción: "Send a password recovery email to the user"
   - Botón: **"Send password recovery"** (con icono de sobre)
2. Haz clic en **"Send password recovery"**

### Paso 6: Revisar tu Email
1. Abre tu bandeja de entrada del email: **`aminano@opaloperu.com`**
2. Busca un email de Supabase con el asunto: **"Reset Your Password"** o similar
3. **IMPORTANTE**: El enlace en el email puede apuntar a `localhost:3000`, pero esto es normal
4. Copia la URL completa del enlace de recuperación (incluye el `access_token` y otros parámetros)

### Paso 7: Usar el Enlace de Recuperación
**Opción A: Modificar el enlace (Recomendado)**
1. El enlace tendrá esta forma:
   ```
   http://localhost:3000/#access_token=...&expires_at=...&type=recovery
   ```
2. Reemplaza `localhost:3000` con tu dominio de producción:
   ```
   https://opalo-opsflow.bouasv.easypanel.host/#access_token=...&expires_at=...&type=recovery
   ```
3. Pega la URL modificada en tu navegador y presiona Enter
4. Esto te llevará a una página donde podrás establecer tu nueva contraseña

**Opción B: Usar directamente el token (Alternativa)**
1. Si el enlace no funciona, puedes extraer el `access_token` del enlace
2. Abre la consola del navegador (F12) en tu app
3. Ejecuta este código (reemplaza `TU_ACCESS_TOKEN` con el token del email):
   ```javascript
   const { supabase } = await import('./services/supabase');
   await supabase.auth.setSession({
     access_token: 'TU_ACCESS_TOKEN',
     refresh_token: 'TU_REFRESH_TOKEN'
   });
   ```

### Paso 8: Establecer la Nueva Contraseña
1. En la página de recuperación de contraseña, ingresa tu nueva contraseña
2. **IMPORTANTE**: Usa la misma contraseña que acabas de establecer en la app
3. Confirma la contraseña
4. Haz clic en "Reset Password" o "Cambiar Contraseña"

### Paso 9: Verificar en la App
1. Cierra sesión en la app (botón en la esquina superior derecha)
2. Vuelve a iniciar sesión con tu email y la nueva contraseña
3. La sesión de Supabase Auth se creará automáticamente
4. Ahora deberías poder subir imágenes sin problemas

## Verificación
Después de seguir estos pasos, deberías ver en la consola del navegador:
- `✅ Sesión de Supabase Auth creada correctamente`
- `✅ Sesión de Supabase Auth verificada: [tu-user-id]`

Y cuando intentes subir una imagen, deberías ver:
- `✅ Sesión de Supabase Auth verificada: [tu-user-id]`
- `☁️ Subiendo a Storage: ...`
- `✅ URL permanente obtenida: ...`

## Solución Alternativa: Usar Script con SERVICE_ROLE_KEY

Si tienes acceso a la `SERVICE_ROLE_KEY` de Supabase, puedes usar el script `database/reset_password.js`:

1. Obtén tu `SERVICE_ROLE_KEY`:
   - Supabase Dashboard → Settings → API
   - Copia la "service_role" key (NO la "anon" key)

2. Edita `database/reset_password.js`:
   - Reemplaza `SERVICE_ROLE_KEY` con tu clave real
   - Reemplaza `NEW_PASSWORD` con tu nueva contraseña

3. Ejecuta:
   ```bash
   node database/reset_password.js
   ```

4. Cierra sesión y vuelve a iniciar en la app

## Notas Importantes

- ⚠️ La contraseña debe ser la misma en ambos lugares (tabla `users` y Supabase Auth)
- ⚠️ Si cambias la contraseña en la app, también debes cambiarla en Supabase Auth
- ⚠️ El enlace de recuperación puede apuntar a `localhost`, pero puedes modificarlo manualmente
- ✅ Una vez sincronizadas las contraseñas, la sesión de Auth se creará automáticamente al iniciar sesión

## ¿Problemas?

Si después de seguir estos pasos sigues sin poder subir imágenes:

1. Verifica en la consola del navegador si hay errores
2. Verifica que la sesión de Auth se creó: busca `✅ Sesión de Supabase Auth verificada`
3. Intenta cerrar sesión y volver a iniciar
4. Si el problema persiste, contacta al administrador para usar el script con SERVICE_ROLE_KEY
