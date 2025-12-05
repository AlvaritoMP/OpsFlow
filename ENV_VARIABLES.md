# Variables de Entorno Requeridas

Esta aplicación requiere las siguientes variables de entorno para funcionar correctamente en producción:

## Variables Obligatorias

### Supabase
- `VITE_SUPABASE_URL`: URL de tu proyecto Supabase (ej: `https://xxxxx.supabase.co`)
- `VITE_SUPABASE_ANON_KEY`: Clave pública (anon) de Supabase
- `VITE_SUPABASE_SERVICE_ROLE_KEY`: Clave de servicio (service_role) de Supabase (solo para operaciones administrativas)

### Gemini API (Opcional)
- `GEMINI_API_KEY`: Clave de API de Google Gemini (solo si usas funcionalidades de IA)

## Cómo Configurar en EasyPanel

1. Ve a tu proyecto en EasyPanel
2. Navega a la sección "Environment Variables" o "Variables de Entorno"
3. Agrega cada variable con su valor correspondiente
4. Guarda los cambios
5. Redespliega la aplicación

## Nota Importante

Las variables que comienzan con `VITE_` son expuestas al cliente (frontend) y son visibles en el código del navegador. **NUNCA** uses la `SERVICE_ROLE_KEY` directamente en el frontend en producción. En este caso, se está usando temporalmente para funcionalidades administrativas, pero debería moverse a un backend seguro en el futuro.

