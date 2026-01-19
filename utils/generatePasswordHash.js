/**
 * Utilidad para generar hash de contraseña desde la consola del navegador
 * 
 * USO:
 * 1. Abrir la consola del navegador (F12)
 * 2. Copiar y pegar este código
 * 3. Ejecutar: generateHash('TuNuevaContraseña123!')
 */

async function generateHash(password) {
  console.log('🔐 Generando hash para contraseña...');
  console.log('Contraseña (longitud):', password.length);
  
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('');
    console.log('✅ Hash generado:');
    console.log('================');
    console.log(hashHex);
    console.log('');
    console.log('📋 Longitud:', hashHex.length, 'caracteres (esperado: 64)');
    console.log('');
    console.log('💡 Para usar en SQL:');
    console.log("UPDATE users SET password_hash = '" + hashHex + "' WHERE email = 'aminano@opaloperu.com' AND role = 'SUPER_ADMIN';");
    console.log('');
    
    return hashHex;
  } catch (error) {
    console.error('❌ Error al generar hash:', error);
    throw error;
  }
}

// Exportar para uso
if (typeof window !== 'undefined') {
  window.generateHash = generateHash;
  console.log('✅ Función cargada: generateHash(password)');
  console.log('');
  console.log('💡 Ejemplo de uso:');
  console.log('   generateHash("NuevaContraseña123!")');
}
