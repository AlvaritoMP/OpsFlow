import { supabase, handleSupabaseError } from './supabase';
import { ClientRequest, RequestComment } from '../types';

// ============================================
// CRUD PARA CLIENT_REQUESTS
// ============================================

export const requestsService = {
  // Obtener todas las solicitudes de una unidad
  async getByUnitId(unitId: string): Promise<ClientRequest[]> {
    try {
      const { data, error } = await supabase
        .from('client_requests')
        .select('*, request_attachments(*), request_comments(*)')
        .eq('unit_id', unitId)
        .order('date', { ascending: false });

      if (error) throw error;

      return data.map(transformRequestFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener una solicitud por ID
  async getById(id: string): Promise<ClientRequest | null> {
    try {
      const { data, error } = await supabase
        .from('client_requests')
        .select('*, request_attachments(*), request_comments(*)')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data ? transformRequestFromDB(data) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Crear una solicitud
  async create(request: Partial<ClientRequest>, unitId: string): Promise<ClientRequest> {
    try {
      const requestData = transformRequestToDB(request, unitId);
      
      let data: any;
      let cleanedData = { ...requestData };
      
      // Intentar insertar con title si existe
      const { data: insertData, error } = await supabase
        .from('client_requests')
        .insert(cleanedData)
        .select()
        .single();

      if (error) {
        // Si el error es porque la columna title no existe, intentar sin title
        if ((error.message?.includes("title") || error.code === 'PGRST204') && cleanedData.title !== undefined) {
          console.warn('⚠️ Columna title no existe en la BD, creando sin title');
          delete cleanedData.title;
          const { data: retryData, error: retryError } = await supabase
            .from('client_requests')
            .insert(cleanedData)
            .select()
            .single();
          if (retryError) throw retryError;
          data = retryData;
        } else {
          throw error;
        }
      } else {
        data = insertData;
      }

      // Insertar adjuntos si existen
      if (request.attachments && request.attachments.length > 0) {
        await supabase.from('request_attachments').insert(
          request.attachments.map(url => ({
            client_request_id: data.id,
            attachment_url: url,
            attachment_type: 'request',
          }))
        );
      }

      // Insertar comentarios si existen
      if (request.comments && request.comments.length > 0) {
        await this.createComments(data.id, request.comments);
      }

      return await this.getById(data.id) || request as ClientRequest;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar una solicitud
  async update(id: string, request: Partial<ClientRequest>): Promise<ClientRequest> {
    try {
      const requestData = transformRequestToDB(request);
      
      // Si hay un error relacionado con la columna title, intentar sin ella
      let cleanedData = { ...requestData };
      if (cleanedData.title !== undefined) {
        // Intentar primero con title
        const { error } = await supabase
          .from('client_requests')
          .update(cleanedData)
          .eq('id', id);

        if (error) {
          // Si el error es porque la columna title no existe, intentar sin title
          if (error.message?.includes("title") || error.code === 'PGRST204') {
            console.warn('⚠️ Columna title no existe en la BD, actualizando sin title');
            delete cleanedData.title;
            const { error: retryError } = await supabase
              .from('client_requests')
              .update(cleanedData)
              .eq('id', id);
            if (retryError) throw retryError;
          } else {
            throw error;
          }
        }
      } else {
        // Si no hay title, actualizar normalmente
        const { error } = await supabase
          .from('client_requests')
          .update(cleanedData)
          .eq('id', id);

        if (error) throw error;
      }

      // Actualizar adjuntos de respuesta si se proporcionan
      if (request.responseAttachments !== undefined) {
        await supabase
          .from('request_attachments')
          .delete()
          .eq('client_request_id', id)
          .eq('attachment_type', 'response');

        if (request.responseAttachments.length > 0) {
          await supabase.from('request_attachments').insert(
            request.responseAttachments.map(url => ({
              client_request_id: id,
              attachment_url: url,
              attachment_type: 'response',
            }))
          );
        }
      }

      return await this.getById(id) || request as ClientRequest;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar una solicitud
  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('client_requests')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Agregar un comentario a una solicitud
  async addComment(requestId: string, comment: RequestComment): Promise<void> {
    try {
      const { error } = await supabase
        .from('request_comments')
        .insert({
          client_request_id: requestId,
          author: comment.author,
          role: comment.role,
          date: comment.date,
          text: comment.text,
        });

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Crear múltiples comentarios
  async createComments(requestId: string, comments: RequestComment[]): Promise<void> {
    await supabase.from('request_comments').insert(
      comments.map(c => ({
        client_request_id: requestId,
        author: c.author,
        role: c.role,
        date: c.date,
        text: c.text,
      }))
    );
  },
};

// ============================================
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

function transformRequestFromDB(data: any): ClientRequest {
  const requestAttachments = data.request_attachments?.filter((a: any) => a.attachment_type === 'request').map((a: any) => a.attachment_url) || [];
  const responseAttachments = data.request_attachments?.filter((a: any) => a.attachment_type === 'response').map((a: any) => a.attachment_url) || [];

  return {
    id: data.id,
    date: data.date,
    title: data.title,
    category: data.category as any,
    priority: data.priority as any,
    status: data.status as any,
    description: data.description,
    author: data.author,
    relatedResourceId: data.related_resource_id,
    attachments: requestAttachments,
    response: data.response,
    responseAttachments,
    resolvedDate: data.resolved_date,
    comments: data.request_comments?.map((c: any) => ({
      id: c.id,
      author: c.author,
      role: c.role as any,
      date: c.date,
      text: c.text,
    })) || [],
  };
}

function transformRequestToDB(request: Partial<ClientRequest>, unitId?: string): any {
  const data: any = {
    unit_id: unitId,
    date: request.date,
    category: request.category,
    priority: request.priority,
    status: request.status,
    description: request.description,
    author: request.author,
    related_resource_id: request.relatedResourceId,
    response: request.response,
    resolved_date: request.resolvedDate,
  };
  
  // Solo incluir title si está definido (para evitar errores si la columna no existe aún)
  if (request.title !== undefined) {
    data.title = request.title;
  }
  
  return data;
}

