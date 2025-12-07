# 🚀 Desplegar Edge Function - Guía Completa

## Opción 1: Desde el Dashboard de Supabase (RECOMENDADO - Más Fácil)

### Paso 1: Acceder al Dashboard
1. Ve a https://app.supabase.com
2. Inicia sesión y selecciona tu proyecto

### Paso 2: Crear la Edge Function
1. En el menú lateral, ve a **Edge Functions**
2. Haz clic en **Create a new function**
3. Nombre: `update-user-password`
4. Haz clic en **Create function**

### Paso 3: Copiar el Código
1. Copia todo el contenido del archivo `supabase/functions/update-user-password/index.ts`
2. Pégalo en el editor de código del dashboard
3. Haz clic en **Deploy**

### Paso 4: Configurar Variables de Entorno
1. En la página de Edge Functions, haz clic en **Settings** (icono de engranaje)
2. Ve a **Secrets**
3. Agrega las siguientes variables:
   - `SUPABASE_URL`: `https://rlnfehtgspnkyeevduli.supabase.co`
   - `SUPABASE_ANON_KEY`: Tu anon key (Settings > API > anon public)
   - `SUPABASE_SERVICE_ROLE_KEY`: Tu service role key (Settings > API > service_role secret) ⚠️ **NUNCA la expongas**

### Paso 5: Verificar
1. La función debería aparecer como "Active" en la lista
2. Prueba cambiando una contraseña desde la app

---

## Opción 2: Usando Supabase CLI

### Paso 1: Instalar Supabase CLI en Windows

**Opción A: Usando Scoop (Recomendado)**
```powershell
# Instalar Scoop si no lo tienes
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# Instalar Supabase CLI
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Opción B: Descargar Binario**
1. Ve a https://github.com/supabase/cli/releases
2. Descarga `supabase_windows_amd64.zip`
3. Extrae y agrega a PATH

### Paso 2: Iniciar Sesión
```bash
supabase login
```
Esto abrirá tu navegador para autenticarte.

### Paso 3: Vincular Proyecto
```bash
supabase link --project-ref rlnfehtgspnkyeevduli
```

### Paso 4: Configurar Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto o configura las variables en el dashboard:

```env
SUPABASE_URL=https://rlnfehtgspnkyeevduli.supabase.co
SUPABASE_ANON_KEY=tu_anon_key_aqui
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui
```

**⚠️ IMPORTANTE:** Agrega `.env` a `.gitignore` para no subir las keys al repositorio.

### Paso 5: Desplegar la Función
```bash
supabase functions deploy update-user-password
```

---

## Opción 3: Usando npx (Sin Instalación Global)

Si no puedes instalar Supabase CLI, puedes usar npx:

```bash
npx supabase login
npx supabase link --project-ref rlnfehtgspnkyeevduli
npx supabase functions deploy update-user-password
```

---

## Verificación

Después de desplegar, verifica que funciona:

1. **Desde el Dashboard:**
   - Ve a Edge Functions
   - Deberías ver `update-user-password` como "Active"
   - Haz clic en la función para ver logs

2. **Desde la App:**
   - Inicia sesión como administrador
   - Intenta cambiar la contraseña de otro usuario
   - Debería funcionar sin enviar emails

---

## Troubleshooting

### Error: "Function not found"
- Verifica que la función esté desplegada
- Verifica el nombre de la función: debe ser exactamente `update-user-password`

### Error: "Missing required environment variables"
- Verifica que las 3 variables de entorno estén configuradas en el dashboard
- Verifica que los valores sean correctos

### Error: "Only administrators can change passwords"
- Verifica que el usuario que intenta cambiar la contraseña tenga rol `ADMIN` en la tabla `users`

### Error: "Unauthorized"
- Verifica que el usuario esté autenticado
- Verifica que el token de autenticación sea válido

---

## Estructura de Archivos

```
supabase/
└── functions/
    └── update-user-password/
        ├── index.ts          # Código de la función
        └── README.md         # Documentación
```

---

## Notas de Seguridad

✅ **CORRECTO:**
- La `SERVICE_ROLE_KEY` está solo en las variables de entorno del servidor
- La función valida que solo los administradores puedan usarla
- Todas las operaciones se registran en auditoría

❌ **INCORRECTO:**
- Exponer `SERVICE_ROLE_KEY` en el frontend
- Permitir que usuarios no administradores cambien contraseñas
- Saltarse la validación de permisos

