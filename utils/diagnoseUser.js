/**
 * Script de diagnóstico específico para el usuario aminano@opaloperu.com
 * 
 * INSTRUCCIONES:
 * 1. Abrir la consola del navegador (F12)
 * 2. Ir a la pestaña "Console"
 * 3. Copiar y pegar este código completo
 * 4. Ejecutar: diagnoseUser('aminano@opaloperu.com', 'tu-contraseña-actual')
 */

async function diagnoseUser(email, password) {
  console.log('🔍 DIAGNÓSTICO ESPECÍFICO DE USUARIO');
  console.log('====================================');
  console.log('Email:', email);
  console.log('');
  
  try {
    // Importar supabase (ajustar según tu configuración)
    // Si estás en el navegador y ya tienes supabase cargado, puedes usar:
    // const { supabase } = await import('./services/supabase');
    
    // O usar directamente desde window si está disponible
    let supabase;
    if (window.supabase) {
      supabase = window.supabase;
    } else {
      // Intentar importar
      const supabaseModule = await import('../services/supabase.js');
      supabase = supabaseModule.supabase;
    }
    
    if (!supabase) {
      console.error('❌ No se pudo obtener el cliente de Supabase');
      console.log('💡 Asegúrate de estar en la aplicación OpsFlow');
      return;
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    console.log('Email normalizado:', normalizedEmail);
    console.log('');
    
    // 1. Buscar usuario en BD
    console.log('1️⃣ Buscando usuario en tabla users...');
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();
    
    if (dbError) {
      console.error('❌ Error:', dbError.message);
      if (dbError.code === 'PGRST116') {
        console.error('   → Usuario no encontrado');
      }
      return;
    }
    
    if (!dbUser) {
      console.error('❌ Usuario no encontrado');
      return;
    }
    
    console.log('✅ Usuario encontrado:');
    console.log('   ID:', dbUser.id);
    console.log('   Nombre:', dbUser.name);
    console.log('   Email:', dbUser.email);
    console.log('   Rol:', dbUser.role);
    console.log('   Password hash existe:', !!dbUser.password_hash);
    
    if (dbUser.password_hash) {
      console.log('   Longitud del hash:', dbUser.password_hash.length);
      console.log('   Primeros 20 caracteres del hash:', dbUser.password_hash.substring(0, 20));
      console.log('   Últimos 20 caracteres del hash:', dbUser.password_hash.substring(dbUser.password_hash.length - 20));
    }
    console.log('');
    
    // 2. Verificar contraseña
    if (dbUser.password_hash && password) {
      console.log('2️⃣ Verificando contraseña...');
      console.log('   Contraseña ingresada (longitud):', password.length);
      
      // Función para hashear (mismo algoritmo que passwordHash.ts)
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      console.log('   Hash generado de la contraseña ingresada:');
      console.log('   Primeros 20:', passwordHash.substring(0, 20));
      console.log('   Últimos 20:', passwordHash.substring(passwordHash.length - 20));
      console.log('');
      
      console.log('   Hash en la base de datos:');
      console.log('   Primeros 20:', dbUser.password_hash.substring(0, 20));
      console.log('   Últimos 20:', dbUser.password_hash.substring(dbUser.password_hash.length - 20));
      console.log('');
      
      const isValid = passwordHash === dbUser.password_hash;
      
      if (isValid) {
        console.log('✅ ✅ ✅ CONTRASEÑA VÁLIDA ✅ ✅ ✅');
        console.log('   → El hash coincide perfectamente');
      } else {
        console.error('❌ ❌ ❌ CONTRASEÑA INVÁLIDA ❌ ❌ ❌');
        console.log('   → Los hashes NO coinciden');
        console.log('');
        console.log('🔍 ANÁLISIS:');
        console.log('   Hash ingresado completo:', passwordHash);
        console.log('   Hash en BD completo:', dbUser.password_hash);
        console.log('');
        console.log('💡 POSIBLES CAUSAS:');
        console.log('   1. La contraseña ingresada es incorrecta');
        console.log('   2. El hash en BD fue generado con un algoritmo diferente');
        console.log('   3. El hash en BD tiene espacios o caracteres extra');
        console.log('   4. El hash fue generado con una versión diferente del código');
      }
      console.log('');
    } else if (!dbUser.password_hash) {
      console.warn('⚠️ El usuario NO tiene password_hash');
    } else if (!password) {
      console.warn('⚠️ No se proporcionó contraseña para verificar');
    }
    
    // 3. Verificar formato del hash
    if (dbUser.password_hash) {
      console.log('3️⃣ Verificando formato del hash...');
      const hashLength = dbUser.password_hash.length;
      const expectedLength = 64; // SHA-256 produce 64 caracteres hex
      
      if (hashLength === expectedLength) {
        console.log('✅ Longitud correcta (64 caracteres)');
      } else {
        console.warn('⚠️ Longitud inesperada:', hashLength, '(esperado: 64)');
      }
      
      // Verificar que solo contiene caracteres hexadecimales
      const hexPattern = /^[0-9a-f]+$/i;
      if (hexPattern.test(dbUser.password_hash)) {
        console.log('✅ Formato hexadecimal válido');
      } else {
        console.error('❌ El hash contiene caracteres no hexadecimales');
        console.log('   Hash:', dbUser.password_hash);
      }
      console.log('');
    }
    
    // 4. Intentar login con Supabase Auth
    console.log('4️⃣ Intentando login con Supabase Auth...');
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: password || 'dummy',
      });
      
      if (authError) {
        console.warn('⚠️ Supabase Auth error:', authError.message);
      } else {
        console.log('✅ Supabase Auth exitoso');
        console.log('   User ID:', authData.user?.id);
      }
    } catch (authErr) {
      console.warn('⚠️ Error en Supabase Auth:', authErr.message);
    }
    
    console.log('');
    console.log('📋 RESUMEN FINAL:');
    console.log('================');
    console.log('Usuario en BD:', '✅ Sí');
    console.log('Tiene password_hash:', dbUser.password_hash ? '✅ Sí' : '❌ No');
    if (dbUser.password_hash && password) {
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const matches = passwordHash === dbUser.password_hash;
      console.log('Contraseña coincide:', matches ? '✅ SÍ' : '❌ NO');
      
      if (!matches) {
        console.log('');
        console.log('🔧 SOLUCIÓN:');
        console.log('===========');
        console.log('Ejecuta este comando para resetear la contraseña:');
        console.log(`resetUserPassword('${normalizedEmail}', 'TuNuevaContraseña123!')`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
    console.error('Stack:', error.stack);
  }
}

/**
 * Función para resetear la contraseña de este usuario específico
 */
async function resetUserPassword(email, newPassword) {
  console.log('🔐 RESETEANDO CONTRASEÑA');
  console.log('========================');
  console.log('Email:', email);
  console.log('');
  
  try {
    let supabase;
    if (window.supabase) {
      supabase = window.supabase;
    } else {
      const supabaseModule = await import('../services/supabase.js');
      supabase = supabaseModule.supabase;
    }
    
    if (!supabase) {
      console.error('❌ No se pudo obtener el cliente de Supabase');
      return;
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Verificar usuario
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('email', normalizedEmail)
      .single();
    
    if (fetchError || !user) {
      console.error('❌ Usuario no encontrado:', fetchError?.message);
      return;
    }
    
    console.log('✅ Usuario encontrado:', user.name);
    console.log('🔐 Generando nuevo hash...');
    
    // Generar hash usando el mismo algoritmo
    const encoder = new TextEncoder();
    const data = encoder.encode(newPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('✅ Hash generado (primeros 20):', passwordHash.substring(0, 20) + '...');
    
    // Actualizar
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);
    
    if (updateError) {
      console.error('❌ Error al actualizar:', updateError.message);
      console.error('   Código:', updateError.code);
      return;
    }
    
    console.log('✅ ✅ ✅ CONTRASEÑA ACTUALIZADA CORRECTAMENTE ✅ ✅ ✅');
    console.log('');
    console.log('📝 Ahora puedes iniciar sesión con:');
    console.log('   Email:', normalizedEmail);
    console.log('   Contraseña:', newPassword);
    console.log('');
    console.log('⚠️ NOTA: Si el usuario también existe en Supabase Auth,');
    console.log('   puede necesitar resetear la contraseña allí también.');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
  }
}

// Exportar para uso
if (typeof window !== 'undefined') {
  window.diagnoseUser = diagnoseUser;
  window.resetUserPassword = resetUserPassword;
  console.log('✅ Funciones cargadas:');
  console.log('   - diagnoseUser(email, password)');
  console.log('   - resetUserPassword(email, newPassword)');
  console.log('');
  console.log('💡 Ejemplo de uso:');
  console.log('   diagnoseUser("aminano@opaloperu.com", "tu-contraseña")');
  console.log('   resetUserPassword("aminano@opaloperu.com", "NuevaContraseña123!")');
}
