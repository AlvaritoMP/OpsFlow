# Crear Usuarios Faltantes en Supabase Auth - Instrucciones Manuales

## Usuarios que necesitan ser creados en Supabase Auth

Hay **3 usuarios** que existen en la tabla `users` pero NO en Supabase Auth:

1. **dhirakawaf@templex.com.pe** (David Hirakawa) - CLIENT
2. **rpinto@templex.com.pe** (Raul Pinto) - CLIENT  
3. **supervisorzonal1@opaloservicios.com** (Miguel Pachas) - OPERATIONS_SUPERVISOR

## Método 1: Desde Supabase Dashboard (Recomendado)

1. Ve a **Supabase Dashboard** → **Authentication** → **Users**
2. Haz clic en **"Add User"** o **"Invite User"**
3. Para cada usuario:
   - **Email**: Usa el email exacto de la lista
   - **Password**: Usa la misma contraseña que tienen en la tabla `users` (o una temporal que ellos puedan cambiar)
   - **Auto Confirm User**: ✅ Marca esta opción para que no necesiten confirmar email
   - **User Metadata**: Agrega:
     ```json
     {
       "name": "Nombre del Usuario",
       "role": "CLIENT" o "OPERATIONS_SUPERVISOR"
     }
     ```
4. Haz clic en **"Create User"**

## Método 2: Usando la API de Administración (Automático)

Si tienes acceso a la `SERVICE_ROLE_KEY` de Supabase:

1. Obtén tu `SERVICE_ROLE_KEY` de: **Supabase Dashboard** → **Settings** → **API** → **service_role key**
2. Abre el archivo `database/create_missing_auth_users.js`
3. Reemplaza:
   - `SUPABASE_URL` con tu URL de Supabase
   - `SERVICE_ROLE_KEY` con tu service_role key
4. Ejecuta: `node database/create_missing_auth_users.js`

⚠️ **IMPORTANTE**: La `SERVICE_ROLE_KEY` es muy sensible. NUNCA la compartas ni la subas a Git.

## Método 3: Usando curl (Línea de comandos)

Para cada usuario, ejecuta:

```bash
curl -X POST 'https://rlnfehtgspnkyeevduli.supabase.co/auth/v1/admin/users' \
  -H "Authorization: Bearer TU_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "apikey: TU_SERVICE_ROLE_KEY" \
  -d '{
    "email": "dhirakawaf@templex.com.pe",
    "password": "CONTRASEÑA_DEL_USUARIO",
    "email_confirm": true,
    "user_metadata": {
      "name": "David Hirakawa",
      "role": "CLIENT"
    }
  }'
```

Repite para los otros 2 usuarios cambiando el email, name y role.

## Verificación

Después de crear los usuarios, verifica que se crearon correctamente:

1. Ve a **Supabase Dashboard** → **Authentication** → **Users**
2. Busca los emails en la lista
3. O ejecuta el script `migrate_users_to_supabase_auth.sql` de nuevo y verifica que todos muestren "EXISTE EN AUTH"

## Nota sobre Contraseñas

Si no conoces las contraseñas de los usuarios:
- Puedes crear usuarios con contraseñas temporales
- Los usuarios pueden usar "Forgot Password" para restablecer su contraseña
- O puedes usar la API de administración para cambiar sus contraseñas después
