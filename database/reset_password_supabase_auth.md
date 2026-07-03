# Cambiar Contraseña en Supabase Auth - Guía Rápida

## Opción 1: Usando Supabase Dashboard (Requiere Email)

1. En el panel derecho, haz clic en **"Send password recovery"**
2. Revisa tu email y sigue el enlace para restablecer la contraseña
3. Establece la misma contraseña que usas en la app

## Opción 2: Usando la API de Administración (Cambio Directo)

Si tienes acceso a la `SERVICE_ROLE_KEY`, puedes cambiar la contraseña directamente:

### Usando curl:

```bash
curl -X PUT 'https://rlnfehtgspnkyeevduli.supabase.co/auth/v1/admin/users/d6be0f28-db96-4a8f-9831-2c25e0af25ad' \
  -H "Authorization: Bearer TU_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "apikey: TU_SERVICE_ROLE_KEY" \
  -d '{
    "password": "TU_CONTRASEÑA_ACTUAL_DE_LA_APP"
  }'
```

Reemplaza:
- `TU_SERVICE_ROLE_KEY` con tu service_role key de Supabase
- `TU_CONTRASEÑA_ACTUAL_DE_LA_APP` con la contraseña que usas actualmente en la app

### O usando el script de Node.js:

Crea un archivo `reset_password.js`:

```javascript
const SUPABASE_URL = 'https://rlnfehtgspnkyeevduli.supabase.co';
const SERVICE_ROLE_KEY = 'TU_SERVICE_ROLE_KEY';
const USER_ID = 'd6be0f28-db96-4a8f-9831-2c25e0af25ad'; // Tu user ID
const NEW_PASSWORD = 'TU_CONTRASEÑA_ACTUAL_DE_LA_APP';

async function resetPassword() {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${USER_ID}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY
      },
      body: JSON.stringify({
        password: NEW_PASSWORD
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Error ${response.status}`);
    }

    console.log('✅ Contraseña actualizada exitosamente');
    console.log('Usuario:', data.email);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

resetPassword();
```

Ejecuta: `node reset_password.js`

## Opción 3: Verificar Contraseña Actual

Si no estás seguro de cuál es tu contraseña actual en la app, puedes verificar en la consola del navegador cuando inicias sesión. La contraseña que ingresas en el login es la que debe estar en Supabase Auth.

## Después de Cambiar la Contraseña

1. Cierra sesión en la app
2. Vuelve a iniciar sesión con tu email y contraseña
3. La sesión de Supabase Auth se creará automáticamente
4. Podrás subir imágenes sin problemas
