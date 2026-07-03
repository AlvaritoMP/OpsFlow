/**
 * Script SIMPLE para diagnosticar y resetear contraseña
 * 
 * INSTRUCCIONES:
 * 1. Abrir la aplicación OpsFlow en el navegador
 * 2. Abrir la consola (F12)
 * 3. Copiar y pegar TODO este código
 * 4. Ejecutar: fixUserPassword('aminano@opaloperu.com', 'tu-contraseña-actual', 'NuevaContraseña123!')
 * 
 * Si solo quieres diagnosticar sin cambiar la contraseña:
 * Ejecutar: diagnoseOnly('aminano@opaloperu.com', 'tu-contraseña-actual')
 */

// Función para obtener supabase desde el módulo
async function getSupabase() {
  try {
    // Intentar importar desde el módulo
    const module = await import('../services/supabase.js');
    return module.supabase;
  } catch (e) {
    console.error('Error al importar supabase:', e);
    throw new Error('No se pudo obtener el cliente de Supabase. Asegúrate de estar en la aplicación OpsFlow.');
  }
}

// Función para hashear contraseña (mismo algoritmo que passwordHash.ts)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Función para diagnosticar solo
async function diagnoseOnly(email, currentPassword) {
  console.log('🔍 DIAGNÓSTICO DE USUARIO');
  console.log('========================');
  console.log('Email:', email);
  console.log('');
  
  const supabase = await getSupabase();
  const normalizedEmail = email.toLowerCase().trim();
  
  // Buscar usuario
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', normalizedEmail)
    .single();
  
  if (error || !user) {
    console.error('❌ Usuario no encontrado:', error?.message);
    return;
  }
  
  console.log('✅ Usuario encontrado:');
  console.log('   ID:', user.id);
  console.log('   Nombre:', user.name);
  console.log('   Email:', user.email);
  console.log('   Rol:', user.role);
  console.log('   Tiene password_hash:', !!user.password_hash);
  
  if (user.password_hash) {
    console.log('   Longitud del hash:', user.password_hash.length);
    console.log('   Hash (primeros 30):', user.password_hash.substring(0, 30) + '...');
    
    // Verificar si tiene espacios o caracteres extra
    const trimmedHash = user.password_hash.trim();
    if (trimmedHash !== user.password_hash) {
      console.warn('⚠️ ⚠️ ⚠️ PROBLEMA DETECTADO: El hash tiene espacios ⚠️ ⚠️ ⚠️');
      console.warn('   Hash original (longitud):', user.password_hash.length);
      console.warn('   Hash sin espacios (longitud):', trimmedHash.length);
      console.warn('   → Esto puede causar que la verificación falle');
    }
    
    // Verificar formato hexadecimal
    const hexPattern = /^[0-9a-f]+$/i;
    if (!hexPattern.test(user.password_hash)) {
      console.warn('⚠️ El hash contiene caracteres no hexadecimales');
    }
    
    // Verificar contraseña
    if (currentPassword) {
      console.log('');
      console.log('🔐 Verificando contraseña...');
      const passwordHash = await hashPassword(currentPassword);
      const hashMatches = passwordHash === user.password_hash;
      const trimmedMatches = passwordHash === trimmedHash;
      
      console.log('   Hash de contraseña ingresada (primeros 30):', passwordHash.substring(0, 30) + '...');
      console.log('   Hash en BD (primeros 30):', user.password_hash.substring(0, 30) + '...');
      console.log('');
      
      if (hashMatches) {
        console.log('✅ ✅ ✅ CONTRASEÑA VÁLIDA ✅ ✅ ✅');
      } else if (trimmedMatches) {
        console.warn('⚠️ ⚠️ ⚠️ PROBLEMA: El hash tiene espacios extra ⚠️ ⚠️ ⚠️');
        console.warn('   → La contraseña es correcta PERO el hash en BD tiene espacios');
        console.warn('   → Necesitas limpiar el hash en la base de datos');
      } else {
        console.error('❌ ❌ ❌ CONTRASEÑA INVÁLIDA ❌ ❌ ❌');
        console.error('   → La contraseña ingresada no coincide con el hash');
      }
    }
  } else {
    console.warn('⚠️ El usuario NO tiene password_hash');
  }
}

// Función principal para diagnosticar y resetear
async function fixUserPassword(email, currentPassword, newPassword) {
  console.log('🔧 DIAGNÓSTICO Y RESETEO DE CONTRASEÑA');
  console.log('=====================================');
  console.log('Email:', email);
  console.log('');
  
  const supabase = await getSupabase();
  const normalizedEmail = email.toLowerCase().trim();
  
  // 1. Diagnosticar primero
  await diagnoseOnly(email, currentPassword);
  console.log('');
  console.log('=====================================');
  console.log('');
  
  // 2. Resetear contraseña
  console.log('🔐 Reseteando contraseña...');
  
  // Buscar usuario
  const { data: user, error: fetchError } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('email', normalizedEmail)
    .single();
  
  if (fetchError || !user) {
    console.error('❌ Usuario no encontrado:', fetchError?.message);
    return;
  }
  
  // Generar nuevo hash
  const passwordHash = await hashPassword(newPassword);
  console.log('✅ Hash generado (primeros 30):', passwordHash.substring(0, 30) + '...');
  
  // Actualizar (asegurarse de que no tenga espacios)
  const cleanHash = passwordHash.trim();
  const { error: updateError } = await supabase
    .from('users')
    .update({ 
      password_hash: cleanHash,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  
  if (updateError) {
    console.error('❌ Error al actualizar:', updateError.message);
    return;
  }
  
  console.log('✅ ✅ ✅ CONTRASEÑA ACTUALIZADA ✅ ✅ ✅');
  console.log('');
  console.log('📝 Ahora puedes iniciar sesión con:');
  console.log('   Email:', normalizedEmail);
  console.log('   Contraseña:', newPassword);
  console.log('');
  console.log('⚠️ NOTA: Si el usuario también existe en Supabase Auth,');
  console.log('   puede necesitar resetear la contraseña allí también.');
}

// Exportar funciones
if (typeof window !== 'undefined') {
  window.diagnoseOnly = diagnoseOnly;
  window.fixUserPassword = fixUserPassword;
  console.log('✅ Funciones cargadas:');
  console.log('   - diagnoseOnly(email, currentPassword)');
  console.log('   - fixUserPassword(email, currentPassword, newPassword)');
  console.log('');
  console.log('💡 Ejemplo de uso:');
  console.log('   diagnoseOnly("aminano@opaloperu.com", "tu-contraseña-actual")');
  console.log('   fixUserPassword("aminano@opaloperu.com", "contraseña-actual", "NuevaContraseña123!")');
}
