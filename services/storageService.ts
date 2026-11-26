import { supabase } from './supabase';

/** Miniatura de Storage. La URL original se conserva para el visor a tamaño completo. */
export function storageThumbnailUrl(url: string | null | undefined, width = 160): string | null | undefined {
  if (!url || !url.includes('/storage/v1/object/')) return url;
  const transformed = url.replace('/storage/v1/object/', '/storage/v1/render/image/');
  const join = transformed.includes('?') ? '&' : '?';
  return `${transformed}${join}width=${width}&quality=60&resize=cover`;
}

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

        if (error.message?.includes('row-level security') ||
            error.message?.includes('RLS') ||
            error.message?.includes('permission denied') ||
            error.statusCode === 403 ||
            error.statusCode === '403') {
          throw new Error(
            `No hay permiso para subir archivos al bucket "${bucket}". ` +
            `Ejecuta database/migrations/fix_supabase_error_logs.sql en Supabase. ` +
            `Detalle: ${error.message}`
          );
        }

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
   * Sube una imagen a Supabase Storage (helper para imágenes)
   * @param file Archivo de imagen a subir
   * @param bucket Nombre del bucket (default: 'unit-images')
   * @returns URL pública del archivo subido
   */
  async uploadImage(file: File, bucket: string = 'unit-images'): Promise<string> {
    const path = `events/${Date.now()}-${file.name}`;
    return this.uploadFile(bucket, file, path);
  },

  /**
   * Convierte un File/Blob a data URL (fallback cuando no hay sesión de Storage).
   */
  async fileToDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen'));
      reader.readAsDataURL(file);
    });
  },

  /**
   * Persiste una imagen: intenta Storage; si no hay Auth o falla, usa data URL
   * (válido para logos/portadas pequeñas-medias, p. ej. < 1.5 MB).
   */
  async persistImage(
    file: File,
    options: { bucket?: string; path?: string; maxDataUrlBytes?: number } = {}
  ): Promise<{ url: string; storage: 'supabase' | 'data-url' }> {
    const bucket = options.bucket || 'unit-images';
    const path = options.path || `events/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const maxDataUrlBytes = options.maxDataUrlBytes ?? 1.5 * 1024 * 1024;

    try {
      const url = await this.uploadFile(bucket, file, path);
      return { url, storage: 'supabase' };
    } catch (uploadError) {
      console.warn('⚠️ Falló subida a Storage, usando data URL:', uploadError);
    }

    if (file.size > maxDataUrlBytes) {
      throw new Error(
        `La imagen pesa ${(file.size / 1024).toFixed(0)} KB y no hay sesión de Storage.\n\n` +
        `Reduce el tamaño a menos de ${(maxDataUrlBytes / 1024).toFixed(0)} KB, o cierra sesión y vuelve a iniciar sesión para activar Supabase Auth.`
      );
    }

    const dataUrl = await this.fileToDataUrl(file);
    return { url: dataUrl, storage: 'data-url' };
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

  /**
   * Valida y regenera una URL de imagen de Supabase Storage si es necesario
   * @param imageUrl URL de la imagen (puede ser una URL antigua o nueva)
   * @param bucket Nombre del bucket donde está almacenada la imagen
   * @returns URL válida de la imagen
   */
  async validateAndRegenerateImageUrl(imageUrl: string | null | undefined, bucket: string): Promise<string | null> {
    if (!imageUrl) return null;

    // Si es un blob URL o data URL, retornarlo tal cual
    if (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) {
      return imageUrl;
    }

    // Si ya es una URL válida de Supabase Storage, verificar si necesita regenerarse
    try {
      // Intentar extraer el path del archivo de la URL
      // Las URLs de Supabase Storage tienen el formato: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
      const urlPattern = /\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/;
      const match = imageUrl.match(urlPattern);
      
      if (match) {
        const urlBucket = match[1];
        const filePath = match[2];
        
        // Si el bucket coincide, regenerar la URL para asegurar que sea válida
        if (urlBucket === bucket) {
          const { data: urlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);
          
          if (urlData?.publicUrl) {
            console.log(`✅ URL regenerada para ${filePath} en bucket ${bucket}`);
            return urlData.publicUrl;
          }
        }
      }
      
      // Si no coincide el patrón pero parece ser una URL de Supabase, intentar regenerarla
      // Esto puede pasar si la URL cambió por cambio de proyecto o configuración
      if (imageUrl.includes('supabase.co') || imageUrl.includes('supabase')) {
        // Intentar extraer el path del final de la URL
        const pathParts = imageUrl.split('/');
        const fileName = pathParts[pathParts.length - 1];
        
        // Intentar regenerar con el nombre del archivo
        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(fileName);
        
        if (urlData?.publicUrl) {
          console.log(`✅ URL regenerada usando nombre de archivo ${fileName}`);
          return urlData.publicUrl;
        }
      }
      
      // Si no se pudo regenerar, retornar la URL original
      console.warn(`⚠️ No se pudo regenerar URL para: ${imageUrl}`);
      return imageUrl;
    } catch (error) {
      console.error('❌ Error al validar/regenerar URL de imagen:', error);
      // En caso de error, retornar la URL original
      return imageUrl;
    }
  },

  /**
   * Helper para obtener el bucket correcto según el tipo de imagen
   * @param imageUrl URL de la imagen
   * @returns Nombre del bucket más probable
   */
  guessBucketFromUrl(imageUrl: string): string {
    if (imageUrl.includes('unit-images') || imageUrl.includes('unit_')) {
      return 'unit-images';
    }
    if (imageUrl.includes('staff') || imageUrl.includes('management')) {
      return 'staff-photos';
    }
    if (imageUrl.includes('night-supervision')) {
      return 'night-supervision-photos';
    }
    // Default
    return 'unit-images';
  },
};

