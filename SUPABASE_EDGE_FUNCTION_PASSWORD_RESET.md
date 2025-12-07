# Supabase Edge Function para Cambiar Contraseñas

## ✅ Solución Implementada

La Edge Function ya está creada en `supabase/functions/update-user-password/index.ts`. Solo necesitas desplegarla.

## 🚀 Despliegue Rápido

### Paso 1: Instalar Supabase CLI

```bash
npm install -g supabase
```

### Paso 2: Iniciar sesión

```bash
supabase login
```

### Paso 3: Vincular tu proyecto

```bash
supabase link --project-ref tu-project-ref
```

**Para obtener tu `project-ref`:**
- Ve a tu proyecto en Supabase Dashboard
- En la URL verás: `https://app.supabase.com/project/[project-ref]`
- O ve a **Settings** > **General** y copia el "Reference ID"

### Paso 4: Configurar Variables de Entorno

En el dashboard de Supabase:
1. Ve a **Project Settings** > **Edge Functions**
2. Agrega las siguientes variables de entorno:
   - `SUPABASE_URL`: Tu URL de Supabase (ej: `https://rlnfehtgspnkyeevduli.supabase.co`)
   - `SUPABASE_ANON_KEY`: Tu anon key (Settings > API)
   - `SUPABASE_SERVICE_ROLE_KEY`: Tu service role key (⚠️ NUNCA la expongas en el frontend)

### Paso 5: Desplegar la Función

```bash
supabase functions deploy update-user-password
```

## 📝 Código de la Función

La función ya está implementada en `supabase/functions/update-user-password/index.ts`. El código:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Obtener el token de autorización del header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Crear cliente de Supabase con anon key para verificar el usuario
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    })

    // Verificar que el usuario esté autenticado
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    // Verificar que el usuario sea administrador
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (dbError || !dbUser || dbUser.role !== 'ADMIN') {
      throw new Error('Only administrators can change passwords')
    }

    // Obtener los parámetros del request
    const { userId, newPassword } = await req.json()

    if (!userId || !newPassword) {
      throw new Error('userId and newPassword are required')
    }

    if (newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters')
    }

    // Crear cliente con SERVICE_ROLE_KEY para operaciones administrativas
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Actualizar la contraseña del usuario
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    )

    if (updateError) {
      throw updateError
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Password updated successfully',
        userId: updatedUser.user.id 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
```

### Paso 3: Desplegar la Función

```bash
supabase functions deploy update-user-password
```

### Paso 4: Configurar Variables de Entorno

En el dashboard de Supabase:
1. Ve a **Project Settings** > **Edge Functions**
2. Agrega las variables de entorno:
   - `SUPABASE_URL`: Tu URL de Supabase
   - `SUPABASE_ANON_KEY`: Tu anon key
   - `SUPABASE_SERVICE_ROLE_KEY`: Tu service role key (⚠️ NUNCA la expongas en el frontend)

### Paso 5: Actualizar el Código del Frontend

Actualiza `services/authService.ts`:

```typescript
// Cambiar contraseña de un usuario (solo para administradores)
async updatePassword(userId: string, newPassword: string) {
  try {
    // Verificar que el usuario actual es admin
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      throw new Error('No hay usuario autenticado');
    }

    const dbUser = await usersService.getById(currentUser.id);
    if (!dbUser || dbUser.role !== 'ADMIN') {
      throw new Error('Solo los administradores pueden cambiar contraseñas');
    }

    // Si es el mismo usuario, puede cambiar su propia contraseña directamente
    if (currentUser.id === userId) {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      
      await auditService.log({
        actionType: 'UPDATE',
        entityType: 'USER',
        entityId: userId,
        entityName: dbUser.name,
        description: `Contraseña actualizada por el propio usuario`,
      });
      return;
    }

    // Para otros usuarios, usar la Edge Function
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rlnfehtgspnkyeevduli.supabase.co';
    const { data, error } = await supabase.functions.invoke('update-user-password', {
      body: { userId, newPassword },
    });

    if (error) throw error;
    if (!data.success) {
      throw new Error(data.error || 'Error al cambiar la contraseña');
    }

    // Registrar en auditoría
    const targetUser = await usersService.getById(userId);
    if (targetUser) {
      await auditService.log({
        actionType: 'UPDATE',
        entityType: 'USER',
        entityId: userId,
        entityName: targetUser.name,
        description: `Contraseña actualizada por administrador`,
      });
    }
  } catch (error: any) {
    console.error('Error al cambiar contraseña:', error);
    throw new Error(error.message || 'Error al cambiar la contraseña');
  }
}
```

## Solución Temporal Actual

Mientras implementas la Edge Function, la aplicación actual:
- ✅ Permite a los usuarios cambiar su propia contraseña directamente
- ✅ Envía un email de reset de contraseña cuando un administrador intenta cambiar la contraseña de otro usuario

## Notas de Seguridad

1. **NUNCA** expongas la `SERVICE_ROLE_KEY` en el frontend
2. La Edge Function valida que solo los administradores puedan cambiar contraseñas
3. La Edge Function valida la longitud mínima de la contraseña
4. Todas las operaciones se registran en la auditoría

## Referencias

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Admin API](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)

