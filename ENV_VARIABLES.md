# Variables de Entorno Requeridas

Esta aplicación requiere las siguientes variables de entorno para funcionar correctamente:

## Variables de Supabase

### `VITE_SUPABASE_URL`
- **Descripción**: La URL de tu proyecto de Supabase
- **Ejemplo**: `https://rlnfehtgspnkyeevduli.supabase.co`
- **Dónde obtenerla**: En el dashboard de Supabase, ve a Settings > API > Project URL

### `VITE_SUPABASE_ANON_KEY`
- **Descripción**: La clave anónima (pública) de tu proyecto de Supabase
- **Ejemplo**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Dónde obtenerla**: En el dashboard de Supabase, ve a Settings > API > Project API keys > anon public


## Variables Opcionales

### `GEMINI_API_KEY`
- **Descripción**: Clave API de Google Gemini (opcional, solo si usas funcionalidades de IA)
- **Ejemplo**: `AIzaSy...`
- **Dónde obtenerla**: En Google AI Studio

### `VITE_API_URL`
- **Descripción**: URL base de la API (opcional)
- **Ejemplo**: `https://opalo-opsflow.bouasv.easypanel.host/`

## Cómo Configurar en EasyPanel

1. Ve a tu proyecto en EasyPanel
2. Navega a la sección **"Environment Variables"** o **"Variables de Entorno"**
3. Agrega cada variable con su valor correspondiente:
   - **Key**: `VITE_SUPABASE_URL`
   - **Value**: `https://rlnfehtgspnkyeevduli.supabase.co`
   
   - **Key**: `VITE_SUPABASE_ANON_KEY`
   - **Value**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (tu clave anónima)
   
   - **Key**: `GEMINI_API_KEY` (opcional)
   - **Value**: `AIzaSy...` (si usas funcionalidades de IA)
   
   - **Key**: `VITE_API_URL` (opcional)
   - **Value**: `https://opalo-opsflow.bouasv.easypanel.host/`

4. Guarda los cambios
5. Redespliega la aplicación para que las variables de entorno surtan efecto

## Notas Importantes

- Las variables que comienzan con `VITE_` son expuestas al frontend durante el build
- **NUNCA** expongas la `SERVICE_ROLE_KEY` en el frontend. Esta clave tiene acceso completo a tu base de datos.
- La aplicación solo usa la clave anónima (`VITE_SUPABASE_ANON_KEY`), que respeta las políticas Row Level Security (RLS) de Supabase.
- Para operaciones administrativas (crear usuarios, cambiar contraseñas de otros usuarios, etc.), debes implementar Supabase Edge Functions que usen la `SERVICE_ROLE_KEY` en el servidor.
- Después de agregar o modificar variables de entorno, siempre redespliega la aplicación

## Configuración de Supabase para Crear Usuarios

Para que los administradores puedan crear nuevos usuarios desde la aplicación, necesitas configurar Supabase:

### 1. Habilitar Registro de Usuarios por Email

**IMPORTANTE**: Para que los administradores puedan crear usuarios, debes habilitar el registro por email en Supabase.

1. Ve a tu proyecto en Supabase Dashboard
2. Navega a **Authentication > Settings > Email Auth**
3. **Habilita** "Enable email signups" (debe estar activado)
4. **Opcional**: Desactiva "Enable email confirmations" O configura "Auto Confirm" para permitir registro sin confirmación de email
5. Guarda los cambios

**Nota**: 
- Si "Enable email signups" está deshabilitado, verás el error "Email signups are disabled" al intentar crear usuarios.
- Si prefieres mantener la confirmación de email, los usuarios creados recibirán un email de confirmación antes de poder iniciar sesión.
- Si desactivas la confirmación de email, los usuarios podrán iniciar sesión inmediatamente después de ser creados.

### 2. Configurar Políticas RLS (Row Level Security)

Asegúrate de que las políticas RLS en la tabla `users` permitan a los administradores crear usuarios:

```sql
-- Política para permitir a administradores crear usuarios
CREATE POLICY "Admins can create users"
ON users
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'ADMIN'
  )
);

-- Política para permitir a usuarios crear su propio registro
CREATE POLICY "Users can create their own record"
ON users
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());
```

### 3. Verificar Función de Rol

Asegúrate de tener una función en Supabase que devuelva el rol del usuario actual:

```sql
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS text AS $$
  SELECT role::text
  FROM users
  WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;
```

## Sistema de Autenticación

La aplicación usa un sistema de autenticación simple basado en la tabla `users` con passwords hasheados (SHA-256). 

**IMPORTANTE**: Este sistema es adecuado para apps internas con pocos usuarios. No usa Supabase Auth.

### Características:
- Passwords almacenados como hash SHA-256 en la columna `password_hash`
- Sesiones almacenadas en `localStorage` (expiran después de 30 días)
- Solo administradores pueden crear usuarios y cambiar contraseñas de otros
- Los usuarios pueden cambiar su propia contraseña

### Migración:
Si migras desde Supabase Auth, ejecuta el script `database/add_password_hash.sql` en Supabase para agregar la columna `password_hash` a la tabla `users`.
