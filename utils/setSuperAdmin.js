/**
 * Script para establecer el usuario aminano@opaloperu.com como SUPER_ADMIN
 * 
 * INSTRUCCIONES:
 * 1. Abrir la aplicación OpsFlow en el navegador
 * 2. Abrir la consola (F12)
 * 3. Copiar y pegar TODO este código
 * 4. Ejecutar: setSuperAdmin()
 */

async function setSuperAdmin() {
  console.log('🔧 ESTABLECIENDO SUPER ADMIN');
  console.log('===========================');
  console.log('Email: aminano@opaloperu.com');
  console.log('');
  
  try {
    // Intentar importar supabase
    let supabase;
    try {
      const module = await import('../services/supabase.js');
      supabase = module.supabase;
    } catch (e) {
      console.error('❌ Error al importar supabase:', e);
      console.log('💡 Asegúrate de estar en la aplicación OpsFlow');
      return;
    }
    
    const email = 'aminano@opaloperu.com';
    
    // 1. Verificar usuario actual
    console.log('1️⃣ Verificando usuario actual...');
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email, name, role')
      .eq('email', email)
      .single();
    
    if (fetchError || !user) {
      console.error('❌ Usuario no encontrado:', fetchError?.message);
      return;
    }
    
    console.log('✅ Usuario encontrado:');
    console.log('   ID:', user.id);
    console.log('   Nombre:', user.name);
    console.log('   Email:', user.email);
    console.log('   Rol actual:', user.role);
    console.log('');
    
    if (user.role === 'SUPER_ADMIN') {
      console.log('✅ El usuario ya es SUPER_ADMIN');
      return;
    }
    
    // 2. Actualizar rol
    console.log('2️⃣ Actualizando rol a SUPER_ADMIN...');
    const { error: updateError } = await supabase
      .from('users')
      .update({
        role: 'SUPER_ADMIN',
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .eq('email', email);
    
    if (updateError) {
      console.error('❌ Error al actualizar:', updateError.message);
      console.error('   Código:', updateError.code);
      console.error('   Detalles:', updateError.details);
      console.log('');
      console.log('💡 Si el error es de permisos (RLS), ejecuta el script SQL directamente en Supabase');
      return;
    }
    
    // 3. Verificar actualización
    console.log('3️⃣ Verificando actualización...');
    await new Promise(resolve => setTimeout(resolve, 500)); // Esperar un momento
    
    const { data: updatedUser, error: verifyError } = await supabase
      .from('users')
      .select('id, email, name, role')
      .eq('id', user.id)
      .single();
    
    if (verifyError || !updatedUser) {
      console.warn('⚠️ No se pudo verificar la actualización:', verifyError?.message);
    } else {
      console.log('✅ Usuario actualizado:');
      console.log('   Rol:', updatedUser.role);
      if (updatedUser.role === 'SUPER_ADMIN') {
        console.log('   ✅ ✅ ✅ USUARIO ESTABLECIDO COMO SUPER_ADMIN ✅ ✅ ✅');
      } else {
        console.warn('   ⚠️ El rol no se actualizó correctamente');
      }
    }
    
    console.log('');
    console.log('📝 Ahora puedes:');
    console.log('   1. Recargar la página');
    console.log('   2. Intentar iniciar sesión de nuevo');
    console.log('   3. Usar el sistema de recuperación de Super Admin si es necesario');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
  }
}

// Exportar para uso
if (typeof window !== 'undefined') {
  window.setSuperAdmin = setSuperAdmin;
  console.log('✅ Función cargada: setSuperAdmin()');
  console.log('');
  console.log('💡 Ejemplo de uso:');
  console.log('   setSuperAdmin()');
}
