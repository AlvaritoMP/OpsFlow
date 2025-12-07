# Edge Function: update-user-password

Esta Edge Function permite a los administradores cambiar la contraseña de otros usuarios directamente, sin enviar emails.

## Despliegue

### 1. Instalar Supabase CLI

```bash
npm install -g supabase
```

### 2. Iniciar sesión

```bash
supabase login
```

### 3. Vincular proyecto

```bash
supabase link --project-ref tu-project-ref
```

Para obtener tu `project-ref`:
- Ve a tu proyecto en Supabase Dashboard
- En la URL verás: `https://app.supabase.com/project/[project-ref]`
- O ve a Settings > General y copia el "Reference ID"

### 4. Configurar variables de entorno

En el dashboard de Supabase:
1. Ve a **Project Settings** > **Edge Functions**
2. Agrega las siguientes variables de entorno:
   - `SUPABASE_URL`: Tu URL de Supabase (ej: `https://rlnfehtgspnkyeevduli.supabase.co`)
   - `SUPABASE_ANON_KEY`: Tu anon key (puedes encontrarla en Settings > API)
   - `SUPABASE_SERVICE_ROLE_KEY`: Tu service role key (⚠️ NUNCA la expongas en el frontend)

### 5. Desplegar la función

```bash
supabase functions deploy update-user-password
```

## Uso

La función se invoca automáticamente desde el frontend cuando un administrador intenta cambiar la contraseña de otro usuario.

## Seguridad

- ✅ Solo los usuarios con rol `ADMIN` pueden usar esta función
- ✅ La función valida la autenticación del usuario antes de proceder
- ✅ La `SERVICE_ROLE_KEY` nunca se expone en el frontend
- ✅ Se valida la longitud mínima de la contraseña (6 caracteres)

## Troubleshooting

Si la función no funciona:

1. Verifica que las variables de entorno estén configuradas correctamente
2. Verifica que la función esté desplegada: `supabase functions list`
3. Revisa los logs: `supabase functions logs update-user-password`
4. Asegúrate de que el usuario que intenta cambiar la contraseña tenga rol `ADMIN` en la tabla `users`

