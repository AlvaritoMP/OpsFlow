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

## Operaciones Administrativas Seguras

Si necesitas realizar operaciones administrativas (como crear usuarios o cambiar contraseñas), debes implementarlas usando Supabase Edge Functions:

1. **Crear una Edge Function** en Supabase que use la `SERVICE_ROLE_KEY` en el servidor
2. **Llamar a la Edge Function** desde tu frontend usando la clave anónima
3. **Validar permisos** en la Edge Function antes de realizar operaciones administrativas

Documentación: https://supabase.com/docs/guides/functions

Ejemplo de Edge Function:
```typescript
// supabase/functions/create-user/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  // Validar que el usuario que hace la petición es admin
  // ... validación ...
  
  // Realizar operación administrativa
  // ... crear usuario ...
})
```
