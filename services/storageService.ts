import { supabase } from './supabase';

export const storageService = {
  /**
   * Sube un archivo a Supabase Storage
   * @param bucket Nombre del bucket (ej: 'night-supervision-photos')
   * @param file Archivo a subir
   * @param path Ruta donde guardar el archivo (ej: 'calls/2024-01-15/photo-123.jpg')
   * @returns URL pública del archivo subido
   */
  async uploadFile(bucket: string, file: File, path: string): Promise<string> {
    try {
      // Verificar autenticación primero
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      
      if (authError || !session) {
        console.error('⚠️ Usuario no autenticado con Supabase Auth:', authError);
        console.log('📋 Estado de autenticación:', {
          hasSession: !!session,
          authError: authError?.message,
          sessionUser: session?.user?.id
        });
        
        // Verificar si hay una sesión local pero no de Supabase Auth
        const { authService } = await import('./authService');
        const localSession = authService.getSession();
        const currentUser = await authService.getCurrentUser();
        
        if (localSession && currentUser) {
          console.log('🔍 Usuario tiene sesión local pero no Supabase Auth.');
          console.log('💡 Intentando crear cuenta en Supabase Auth para habilitar Storage...');
          
          // Intentar crear la cuenta en Supabase Auth si no existe
          // Esto permitirá que Storage funcione
          try {
            // Primero intentar sign in (por si ya existe)
            const signInResult = await supabase.auth.signInWithPassword({
              email: currentUser.email,
              password: 'temp_password_placeholder', // Esto fallará, pero nos dirá si existe
            });
            
            // Si llegamos aquí, el usuario existe pero la contraseña es incorrecta
            // O el usuario no existe
            console.warn('⚠️ No se pudo autenticar con Supabase Auth automáticamente');
          } catch (signInErr: any) {
            // Si el error es "Invalid login credentials", el usuario existe pero necesitamos la contraseña correcta
            // Si el error es "User not found", el usuario no existe en Auth
            console.log('ℹ️ Estado de Supabase Auth:', signInErr.message);
          }
          
          // No podemos crear la sesión de Auth sin la contraseña
          // Mostrar mensaje claro al usuario
          throw new Error(
            'Para subir archivos, necesitas una sesión de Supabase Auth activa.\n\n' +
            'Tu cuenta fue creada directamente en la base de datos y no tiene sesión de Supabase Auth.\n\n' +
            'SOLUCIÓN:\n' +
            '1. Cierra sesión (botón en la esquina superior derecha)\n' +
            '2. Vuelve a iniciar sesión con tu email y contraseña\n' +
            '3. Esto creará la sesión de Supabase Auth necesaria para Storage\n\n' +
            'Después de esto, podrás subir imágenes sin problemas.'
          );
        }
        
        throw new Error('Debes estar autenticado para subir archivos. Por favor, inicia sesión nuevamente.');
      }

      console.log('✅ Usuario autenticado con Supabase Auth:', session.user.id);
      console.log('📤 Intentando subir a bucket:', bucket);
      console.log('📁 Ruta:', path);

      // Intentar subir el archivo directamente
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) {
        console.error('Error completo de Supabase:', {
          message: error.message,
          statusCode: error.statusCode,
          error: error
        });

        // Si el error es de RLS, dar instrucciones simples
        if (error.message?.includes('row-level security') || 
            error.message?.includes('RLS') ||
            error.message?.includes('permission denied') ||
            error.statusCode === 403 ||
            error.statusCode === '403') {
          
          // Verificar políticas existentes
          const { data: policies, error: policiesError } = await supabase
            .from('storage.objects')
            .select('*')
            .limit(0); // Solo para verificar acceso
          
          throw new Error(
            `Error de permisos RLS.\n\n` +
            `Verifica que:\n` +
            `1. Estás autenticado (sesión activa)\n` +
            `2. Las políticas en Supabase Dashboard → Storage → ${bucket} → Policies:\n` +
            `   - INSERT para "authenticated" con: bucket_id = '${bucket}'\n` +
            `   - SELECT para "public" con: bucket_id = '${bucket}'\n\n` +
            `Error: ${error.message}\n` +
            `Status: ${error.statusCode}`
          );
        }
        
        // Otros errores
        throw new Error(`Error al subir: ${error.message || 'Error desconocido'} (Status: ${error.statusCode})`);
      }

      if (!data) {
        throw new Error('No se recibió respuesta al subir el archivo');
      }

      console.log('Archivo subido exitosamente:', data.path);

      // Obtener URL pública
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      if (!urlData?.publicUrl) {
        throw new Error('No se pudo obtener la URL pública del archivo');
      }

      console.log('URL pública generada:', urlData.publicUrl);
      return urlData.publicUrl;
    } catch (error: any) {
      console.error('Error en storageService.uploadFile:', error);
      throw error;
    }
  },

  /**
   * Elimina un archivo de Supabase Storage
   * @param bucket Nombre del bucket
   * @param path Ruta del archivo a eliminar
   */
  async deleteFile(bucket: string, path: string): Promise<void> {
    try {
      const { error } = await supabase.storage
        .from(bucket)
        .remove([path]);

      if (error) {
        console.error('Error eliminando archivo:', error);
        throw new Error(`Error al eliminar el archivo: ${error.message}`);
      }
    } catch (error) {
      console.error('Error en storageService.deleteFile:', error);
      throw error;
    }
  },

  /**
   * Genera un nombre único para un archivo
   * @param originalName Nombre original del archivo
   * @param prefix Prefijo opcional (ej: 'call', 'review')
   * @returns Nombre único con timestamp
   */
  generateUniqueFileName(originalName: string, prefix?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    const extension = originalName.split('.').pop() || 'jpg';
    const prefixPart = prefix ? `${prefix}-` : '';
    return `${prefixPart}${timestamp}-${random}.${extension}`;
  },
};

