// ============================================
// SCRIPT PARA CREAR USUARIOS FALTANTES EN SUPABASE AUTH
// ============================================
// Este script crea los usuarios que existen en la tabla users
// pero no en Supabase Auth (auth.users).
//
// IMPORTANTE: Este script requiere la SERVICE_ROLE_KEY de Supabase
// que solo debe usarse en el servidor, NUNCA en el cliente.
//
// USO:
// 1. Obtén tu SERVICE_ROLE_KEY de Supabase Dashboard → Settings → API
// 2. Reemplaza SUPABASE_URL y SERVICE_ROLE_KEY en este script
// 3. Ejecuta: node database/create_missing_auth_users.js
//
// O usa este script como referencia para crear los usuarios manualmente
// desde Supabase Dashboard → Authentication → Users → Add User

const SUPABASE_URL = 'https://rlnfehtgspnkyeevduli.supabase.co'; // Reemplaza con tu URL
const SERVICE_ROLE_KEY = 'TU_SERVICE_ROLE_KEY_AQUI'; // ⚠️ NUNCA compartas esta clave

// Usuarios que necesitan ser creados en Auth
const usersToCreate = [
  {
    email: 'dhirakawaf@templex.com.pe',
    password: 'TEMPORAL123', // ⚠️ El usuario debe cambiar esta contraseña
    name: 'David Hirakawa',
    role: 'CLIENT'
  },
  {
    email: 'rpinto@templex.com.pe',
    password: 'TEMPORAL123', // ⚠️ El usuario debe cambiar esta contraseña
    name: 'Raul Pinto',
    role: 'CLIENT'
  },
  {
    email: 'supervisorzonal1@opaloservicios.com',
    password: 'TEMPORAL123', // ⚠️ El usuario debe cambiar esta contraseña
    name: 'Miguel Pachas',
    role: 'OPERATIONS_SUPERVISOR'
  }
];

async function createUserInAuth(user) {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        email_confirm: true, // Confirmar email automáticamente
        user_metadata: {
          name: user.name,
          role: user.role
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.message?.includes('already registered') || data.message?.includes('User already registered')) {
        console.log(`✅ Usuario ${user.email} ya existe en Auth`);
        return { success: true, alreadyExists: true };
      }
      throw new Error(data.message || `Error ${response.status}`);
    }

    console.log(`✅ Usuario ${user.email} creado exitosamente en Auth`);
    return { success: true, user: data };
  } catch (error) {
    console.error(`❌ Error al crear usuario ${user.email}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 Iniciando creación de usuarios en Supabase Auth...\n');

  if (SERVICE_ROLE_KEY === 'TU_SERVICE_ROLE_KEY_AQUI') {
    console.error('❌ ERROR: Debes reemplazar SERVICE_ROLE_KEY con tu clave real');
    console.error('   Obtén tu SERVICE_ROLE_KEY de: Supabase Dashboard → Settings → API');
    process.exit(1);
  }

  const results = [];

  for (const user of usersToCreate) {
    console.log(`📝 Creando usuario: ${user.email}...`);
    const result = await createUserInAuth(user);
    results.push({ email: user.email, ...result });
    
    // Esperar un poco entre requests para no sobrecargar la API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n📊 Resumen:');
  console.log('='.repeat(50));
  results.forEach(result => {
    if (result.success) {
      if (result.alreadyExists) {
        console.log(`✅ ${result.email} - Ya existía`);
      } else {
        console.log(`✅ ${result.email} - Creado exitosamente`);
      }
    } else {
      console.log(`❌ ${result.email} - Error: ${result.error}`);
    }
  });
  console.log('='.repeat(50));
}

main().catch(console.error);
