import { supabase, handleSupabaseError } from './supabase';
import { UnitDocument } from '../types';
import { storageService } from './storageService';

// ============================================
// CRUD PARA UNIT_DOCUMENTS
// ============================================

export const documentsService = {
  // Obtener todos los documentos de una unidad
  async getByUnitId(unitId: string): Promise<UnitDocument[]> {
    try {
      const { data, error } = await supabase
        .from('unit_documents')
        .select('*')
        .eq('unit_id', unitId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(transformDocumentFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener un documento por ID
  async getById(id: string): Promise<UnitDocument | null> {
    try {
      const { data, error } = await supabase
        .from('unit_documents')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data ? transformDocumentFromDB(data) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Crear un documento
  async create(document: Partial<UnitDocument>, unitId: string, file: File): Promise<UnitDocument> {
    try {
      // Subir el archivo a Supabase Storage
      const uniqueFileName = storageService.generateUniqueFileName(file.name, 'document');
      const filePath = `documents/${unitId}/${uniqueFileName}`;
      const fileUrl = await storageService.uploadFile('unit-images', file, filePath);

      // Obtener información del usuario actual
      const { authService } = await import('./authService');
      const currentUser = await authService.getCurrentUser();

      const documentData = {
        unit_id: unitId,
        name: document.name || file.name,
        description: document.description || null,
        file_url: fileUrl,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        uploaded_by: currentUser?.id || null,
      };

      const { data, error } = await supabase
        .from('unit_documents')
        .insert(documentData)
        .select()
        .single();

      if (error) throw error;

      return transformDocumentFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar un documento (solo metadatos, no el archivo)
  async update(id: string, document: Partial<UnitDocument>): Promise<UnitDocument> {
    try {
      const documentData: any = {};
      if (document.name !== undefined) documentData.name = document.name;
      if (document.description !== undefined) documentData.description = document.description;
      documentData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('unit_documents')
        .update(documentData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return transformDocumentFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar un documento
  async delete(id: string): Promise<void> {
    try {
      // Obtener el documento para eliminar el archivo de Storage
      const document = await this.getById(id);
      if (document) {
        // Extraer el path del archivo de la URL
        try {
          const url = new URL(document.fileUrl);
          const pathParts = url.pathname.split('/');
          const bucketIndex = pathParts.findIndex(part => part === 'storage');
          if (bucketIndex >= 0 && bucketIndex + 3 < pathParts.length) {
            const bucket = pathParts[bucketIndex + 2];
            const filePath = pathParts.slice(bucketIndex + 3).join('/');
            
            // Eliminar el archivo de Storage
            const { supabase } = await import('./supabase');
            const { error: storageError } = await supabase.storage
              .from(bucket)
              .remove([filePath]);
            
            if (storageError) {
              console.warn('⚠️ Error al eliminar archivo de Storage:', storageError);
            }
          }
        } catch (e) {
          console.warn('⚠️ No se pudo eliminar el archivo de Storage:', e);
        }
      }

      // Eliminar el registro de la base de datos
      const { error } = await supabase
        .from('unit_documents')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Descargar un documento (obtener URL pública)
  async getDownloadUrl(documentId: string): Promise<string | null> {
    try {
      const document = await this.getById(documentId);
      if (!document) return null;

      // La URL ya debería ser pública, pero podemos generar una URL firmada si es necesario
      return document.fileUrl;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },
};

// ============================================
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

function transformDocumentFromDB(data: any): UnitDocument {
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    fileUrl: data.file_url,
    fileName: data.file_name,
    fileSize: data.file_size,
    mimeType: data.mime_type || 'application/octet-stream',
    uploadedAt: data.uploaded_at,
    uploadedBy: data.uploaded_by,
  };
}

