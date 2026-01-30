// ============================================
// SCRIPT PARA CAMBIAR CONTRASEÑA EN SUPABASE AUTH
// ============================================
// Este script cambia la contraseña de un usuario en Supabase Auth
// para que coincida con la contraseña de la tabla users.
//
// IMPORTANTE: Este script requiere la SERVICE_ROLE_KEY de Supabase
// que solo debe usarse en el servidor, NUNCA en el cliente.
//
// USO:
// 1. Obtén tu SERVICE_ROLE_KEY de Supabase Dashboard → Settings → API
// 2. Reemplaza SERVICE_ROLE_KEY y NEW_PASSWORD en este script
// 3. Ejecuta: node database/reset_password.js

const SUPABASE_URL = 'https://rlnfehtgspnkyeevduli.supabase.co';
const SERVICE_ROLE_KEY = 'TU_SERVICE_ROLE_KEY_AQUI'; // ⚠️ Reemplaza con tu SERVICE_ROLE_KEY
const USER_EMAIL = 'aminano@opaloperu.com'; // Tu email
const NEW_PASSWORD = 'TU_CONTRASEÑA_ACTUAL_DE_LA_APP'; // ⚠️ La contraseña que usas en la app

async function resetPassword() {
  if (SERVICE_ROLE_KEY === 'TU_SERVICE_ROLE_KEY_AQUI') {
    console.error('❌ ERROR: Debes reemplazar SERVICE_ROLE_KEY con tu clave real');
    console.error('   Obtén tu SERVICE_ROLE_KEY de: Supabase Dashboard → Settings → API');
    process.exit(1);
  }

  if (NEW_PASSWORD === 'TU_CONTRASEÑA_ACTUAL_DE_LA_APP') {
    console.error('❌ ERROR: Debes reemplazar NEW_PASSWORD con tu contraseña actual de la app');
    process.exit(1);
  }

  try {
    console.log(`🔐 Cambiando contraseña para: ${USER_EMAIL}...`);

    // Primero, obtener el user ID por email
    const getUserResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(USER_EMAIL)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY
      }
    });

    const users = await getUserResponse.json();

    if (!getUserResponse.ok || !users.users || users.users.length === 0) {
      throw new Error(`Usuario no encontrado: ${USER_EMAIL}`);
    }

    const userId = users.users[0].id;
    console.log(`✅ Usuario encontrado. ID: ${userId}`);

    // Cambiar la contraseña
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
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
    console.log(`✅ Usuario: ${data.email || USER_EMAIL}`);
    console.log('\n📝 Próximos pasos:');
    console.log('   1. Cierra sesión en la app');
    console.log('   2. Vuelve a iniciar sesión con tu email y contraseña');
    console.log('   3. La sesión de Supabase Auth se creará automáticamente');
    console.log('   4. Podrás subir imágenes sin problemas');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

resetPassword();
