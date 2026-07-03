/**
 * Script de diagnóstico para problemas de login
 * 
 * INSTRUCCIONES:
 * 1. Abrir la consola del navegador (F12)
 * 2. Ir a la pestaña "Console"
 * 3. Copiar y pegar este código completo
 * 4. Ejecutar: diagnoseLogin('tu-email@ejemplo.com', 'tu-contraseña')
 * 
 * Este script verificará:
 * - Si el usuario existe en la tabla users
 * - Si tiene password_hash
 * - Si el password_hash coincide con la contraseña ingresada
 * - Si existe en Supabase Auth
 */

async function diagnoseLogin(email, password) {
  console.log('🔍 DIAGNÓSTICO DE LOGIN');
  console.log('========================');
  console.log('Email:', email);
  console.log('');
  
  try {
    // Importar dependencias (ajustar la ruta según tu estructura)
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    
    // Obtener las credenciales de Supabase desde window o variables de entorno
    // Ajustar según tu configuración
    const supabaseUrl = window.__SUPABASE_URL__ || import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = window.__SUPABASE_ANON_KEY__ || import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ No se encontraron las credenciales de Supabase');
      console.log('💡 Asegúrate de que las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY estén configuradas');
      return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const normalizedEmail = email.toLowerCase().trim();
    
    // 1. Verificar usuario en tabla users
    console.log('1️⃣ Verificando usuario en tabla users...');
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();
    
    if (dbError) {
      console.error('❌ Error al buscar usuario:', dbError.message);
      if (dbError.code === 'PGRST116') {
        console.error('   → Usuario no encontrado en la tabla users');
      }
      return;
    }
    
    if (!dbUser) {
      console.error('❌ Usuario no encontrado en la tabla users');
      return;
    }
    
    console.log('✅ Usuario encontrado en BD:');
    console.log('   ID:', dbUser.id);
    console.log('   Nombre:', dbUser.name);
    console.log('   Email:', dbUser.email);
    console.log('   Rol:', dbUser.role);
    console.log('   Tiene password_hash:', !!dbUser.password_hash);
    
    if (dbUser.password_hash) {
      console.log('   Longitud del hash:', dbUser.password_hash.length);
    } else {
      console.warn('⚠️ El usuario NO tiene password_hash');
      console.log('   → Esto significa que no puede iniciar sesión con contraseña');
      console.log('   → Necesitas resetear la contraseña');
    }
    
    console.log('');
    
    // 2. Verificar contraseña
    if (dbUser.password_hash && password) {
      console.log('2️⃣ Verificando contraseña...');
      
      // Función para hashear (mismo algoritmo que passwordHash.ts)
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      const isValid = passwordHash === dbUser.password_hash;
      
      if (isValid) {
        console.log('✅ Contraseña VÁLIDA');
      } else {
        console.error('❌ Contraseña INVÁLIDA');
        console.log('   Hash ingresado (primeros 20 chars):', passwordHash.substring(0, 20));
        console.log('   Hash en BD (primeros 20 chars):', dbUser.password_hash.substring(0, 20));
      }
      console.log('');
    }
    
    // 3. Verificar Supabase Auth
    console.log('3️⃣ Verificando Supabase Auth...');
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: password || 'dummy-password-to-check-existence',
      });
      
      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          console.warn('⚠️ Usuario no existe en Supabase Auth o credenciales incorrectas');
        } else {
          console.warn('⚠️ Error en Supabase Auth:', authError.message);
        }
      } else if (authData?.user) {
        console.log('✅ Usuario existe en Supabase Auth');
        console.log('   ID:', authData.user.id);
        console.log('   Email confirmado:', !!authData.user.email_confirmed_at);
      }
    } catch (authErr) {
      console.warn('⚠️ No se pudo verificar Supabase Auth:', authErr.message);
    }
    
    console.log('');
    console.log('📋 RESUMEN:');
    console.log('===========');
    console.log('Usuario en BD:', dbUser ? '✅ Sí' : '❌ No');
    console.log('Tiene password_hash:', dbUser?.password_hash ? '✅ Sí' : '❌ No');
    if (dbUser?.password_hash && password) {
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      console.log('Contraseña coincide:', passwordHash === dbUser.password_hash ? '✅ Sí' : '❌ No');
    }
    
    console.log('');
    console.log('💡 SOLUCIONES:');
    console.log('=============');
    if (!dbUser?.password_hash) {
      console.log('1. El usuario no tiene password_hash');
      console.log('   → Ejecuta: resetPassword("' + normalizedEmail + '", "NuevaContraseña123!")');
    } else if (password && dbUser.password_hash) {
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      if (passwordHash !== dbUser.password_hash) {
        console.log('1. La contraseña no coincide');
        console.log('   → Ejecuta: resetPassword("' + normalizedEmail + '", "TuNuevaContraseña")');
      }
    }
    
  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
  }
}

/**
 * Función para resetear contraseña
 */
async function resetPassword(email, newPassword) {
  console.log('🔐 RESETEANDO CONTRASEÑA');
  console.log('========================');
  console.log('Email:', email);
  console.log('');
  
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    const supabaseUrl = window.__SUPABASE_URL__ || import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = window.__SUPABASE_ANON_KEY__ || import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ No se encontraron las credenciales de Supabase');
      return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const normalizedEmail = email.toLowerCase().trim();
    
    // Verificar usuario
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('email', normalizedEmail)
      .single();
    
    if (fetchError || !user) {
      console.error('❌ Usuario no encontrado');
      return;
    }
    
    console.log('✅ Usuario encontrado:', user.name);
    
    // Generar hash
    const encoder = new TextEncoder();
    const data = encoder.encode(newPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('🔐 Hash generado');
    
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
      return;
    }
    
    console.log('✅ Contraseña actualizada correctamente');
    console.log('📝 El usuario ahora puede iniciar sesión con la nueva contraseña');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Exportar para uso
if (typeof window !== 'undefined') {
  window.diagnoseLogin = diagnoseLogin;
  window.resetPassword = resetPassword;
  console.log('✅ Funciones cargadas:');
  console.log('   - diagnoseLogin(email, password)');
  console.log('   - resetPassword(email, newPassword)');
  console.log('');
  console.log('💡 Ejemplo de uso:');
  console.log('   diagnoseLogin("tu-email@ejemplo.com", "tu-contraseña")');
  console.log('   resetPassword("tu-email@ejemplo.com", "NuevaContraseña123!")');
}
