# Configuración de Email Signups en Supabase

## Problema
Si ves el error: **"El registro de usuarios por email está deshabilitado en Supabase"**, necesitas habilitar el registro por email en tu proyecto de Supabase.

## Solución: Habilitar Email Signups

### Paso 1: Acceder a la Configuración de Autenticación

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. En el menú lateral izquierdo, haz clic en **Authentication**
3. Luego haz clic en **Settings** (Configuración)

### Paso 2: Habilitar Email Signups

1. En la sección **Email Auth**, busca la opción **"Enable email signups"**
2. **Activa** el toggle (debe estar en verde/activado)
3. Si no está activado, haz clic en el toggle para activarlo

### Paso 3: Configurar Confirmación de Email (Opcional)

Tienes dos opciones:

#### Opción A: Sin Confirmación de Email (Recomendado para desarrollo)
- Desactiva **"Enable email confirmations"**
- Los usuarios podrán iniciar sesión inmediatamente después de ser creados
- **Ventaja**: Más rápido para desarrollo y pruebas
- **Desventaja**: Menos seguro (cualquiera con el email puede iniciar sesión)

#### Opción B: Con Confirmación de Email (Recomendado para producción)
- Activa **"Enable email confirmations"**
- Los usuarios recibirán un email de confirmación antes de poder iniciar sesión
- **Ventaja**: Más seguro, verifica que el email es válido
- **Desventaja**: Requiere que el usuario confirme su email

### Paso 4: Guardar Cambios

1. Haz clic en **"Save"** o **"Guardar"** en la parte inferior de la página
2. Espera a que se confirme que los cambios se guardaron

### Paso 5: Verificar

1. Intenta crear un usuario desde la aplicación
2. Si todo está configurado correctamente, el usuario se creará sin errores

## Verificación Visual

En Supabase Dashboard, deberías ver:

```
Authentication > Settings > Email Auth

✅ Enable email signups          [ON/OFF toggle - debe estar ON]
   ☐ Enable email confirmations  [Opcional - según tu preferencia]
```

## Notas Importantes

- **"Enable email signups"** debe estar **ACTIVADO** para que los administradores puedan crear usuarios
- Si está desactivado, verás el error: "Email signups are disabled"
- Los cambios se aplican inmediatamente después de guardar
- No necesitas redesplegar la aplicación, los cambios son en Supabase

## Solución Alternativa: Edge Functions

Si prefieres mantener "Enable email signups" desactivado por seguridad, puedes implementar una Supabase Edge Function que use la `SERVICE_ROLE_KEY` para crear usuarios. Esto es más seguro pero requiere más configuración.

Para más información sobre Edge Functions:
- Documentación: https://supabase.com/docs/guides/functions
- Ejemplo en `ENV_VARIABLES.md` en la sección "Operaciones Administrativas Seguras"

