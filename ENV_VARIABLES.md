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

### `VITE_SUPABASE_SERVICE_ROLE_KEY`
- **Descripción**: La clave de servicio (privada) de tu proyecto de Supabase. **IMPORTANTE**: Esta clave debe mantenerse segura y nunca exponerse en el frontend. Solo se usa para operaciones administrativas.
- **Ejemplo**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Dónde obtenerla**: En el dashboard de Supabase, ve a Settings > API > Project API keys > service_role secret
- **Advertencia**: Esta clave tiene acceso completo a tu base de datos. No la compartas públicamente.

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
   
   - **Key**: `VITE_SUPABASE_SERVICE_ROLE_KEY`
   - **Value**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (tu clave de servicio)
   
   - **Key**: `GEMINI_API_KEY` (opcional)
   - **Value**: `AIzaSy...` (si usas funcionalidades de IA)
   
   - **Key**: `VITE_API_URL` (opcional)
   - **Value**: `https://opalo-opsflow.bouasv.easypanel.host/`

4. Guarda los cambios
5. Redespliega la aplicación para que las variables de entorno surtan efecto

## Notas Importantes

- Las variables que comienzan con `VITE_` son expuestas al frontend durante el build
- `VITE_SUPABASE_SERVICE_ROLE_KEY` se usa solo en el servidor para operaciones administrativas
- Asegúrate de no exponer `VITE_SUPABASE_SERVICE_ROLE_KEY` en el código del frontend
- Después de agregar o modificar variables de entorno, siempre redespliega la aplicación
