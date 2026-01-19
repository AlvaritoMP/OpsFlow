/**
 * Utilidad para resetear la contraseña de un usuario desde la consola del navegador
 * 
 * USO:
 * 1. Abrir la consola del navegador (F12)
 * 2. Copiar y pegar este código
 * 3. Ejecutar: await resetUserPassword('email@ejemplo.com', 'NuevaContraseña123!')
 */

import { hashPassword } from './passwordHash';
import { supabase } from '../services/supabase';

export async function resetUserPassword(email: string, newPassword: string): Promise<void> {
  try {
    console.log('🔐 Reseteando contraseña para:', email);
    
    // Normalizar email
    const normalizedEmail = email.toLowerCase().trim();
    
    // Verificar que el usuario existe
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email, name, role, password_hash')
      .eq('email', normalizedEmail)
      .single();
    
    if (fetchError || !user) {
      throw new Error(`Usuario no encontrado: ${normalizedEmail}`);
    }
    
    console.log('✅ Usuario encontrado:', {
      id: user.id,
      name: user.name,
      role: user.role,
      hasPasswordHash: !!user.password_hash,
    });
    
    // Generar nuevo hash
    console.log('🔐 Generando hash de nueva contraseña...');
    const passwordHash = await hashPassword(newPassword);
    console.log('✅ Hash generado:', passwordHash.substring(0, 20) + '...');
    
    // Actualizar contraseña
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);
    
    if (updateError) {
      throw new Error(`Error al actualizar contraseña: ${updateError.message}`);
    }
    
    console.log('✅ Contraseña actualizada correctamente');
    console.log('📝 El usuario ahora puede iniciar sesión con la nueva contraseña');
    
    // NOTA: Si el usuario también existe en Supabase Auth, necesitará
    // usar "Olvidé mi contraseña" o actualizar desde el dashboard de Supabase
    console.warn('⚠️ Si el usuario también existe en Supabase Auth, puede necesitar resetear la contraseña allí también');
    
  } catch (error: any) {
    console.error('❌ Error al resetear contraseña:', error);
    throw error;
  }
}

/**
 * Función helper para usar desde la consola del navegador
 * Copiar y pegar esto en la consola:
 */
export const resetPasswordHelper = `
// Función para resetear contraseña desde la consola
async function resetPassword(email, newPassword) {
  try {
    const { hashPassword } = await import('./utils/passwordHash');
    const { supabase } = await import('./services/supabase');
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Verificar usuario
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('email', normalizedEmail)
      .single();
    
    if (fetchError || !user) {
      throw new Error('Usuario no encontrado');
    }
    
    // Generar hash
    const passwordHash = await hashPassword(newPassword);
    
    // Actualizar
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', user.id);
    
    if (updateError) {
      throw new Error(updateError.message);
    }
    
    console.log('✅ Contraseña actualizada');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Uso: resetPassword('email@ejemplo.com', 'NuevaContraseña123!')
`;
