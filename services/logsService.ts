import { supabase, handleSupabaseError } from './supabase';
import { OperationalLog } from '../types';

// ============================================
// CRUD PARA OPERATIONAL_LOGS
// ============================================

export const logsService = {
  // Obtener todos los logs de una unidad
  async getByUnitId(unitId: string): Promise<OperationalLog[]> {
    try {
      const { data, error } = await supabase
        .from('operational_logs')
        .select('*, log_images(image_url), log_responsible(*)')
        .eq('unit_id', unitId)
        .order('date', { ascending: false });

      if (error) throw error;

      return data.map(transformLogFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener un log por ID
  async getById(id: string): Promise<OperationalLog | null> {
    try {
      const { data, error } = await supabase
        .from('operational_logs')
        .select('*, log_images(image_url), log_responsible(*)')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data ? transformLogFromDB(data) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Crear un log
  async create(log: Partial<OperationalLog>, unitId: string): Promise<OperationalLog> {
    try {
      const logData = transformLogToDB(log, unitId);

      const { data, error } = await supabase
        .from('operational_logs')
        .insert(logData)
        .select()
        .single();

      if (error) throw error;

      // Insertar imágenes si existen
      if (log.images && log.images.length > 0) {
        await supabase.from('log_images').insert(
          log.images.map(url => ({
            operational_log_id: data.id,
            image_url: url,
          }))
        );
      }

      // Insertar responsables si existen
      if (log.responsibleIds && log.responsibleIds.length > 0) {
        // Determinar si son recursos o management_staff
        // Por ahora asumimos que son IDs de recursos o management_staff
        // Necesitarías lógica adicional para distinguirlos
        await supabase.from('log_responsible').insert(
          log.responsibleIds.map(id => ({
            operational_log_id: data.id,
            resource_id: id, // Ajustar según tu lógica
          }))
        );
      }

      return await this.getById(data.id) || log as OperationalLog;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar un log
  async update(id: string, log: Partial<OperationalLog>): Promise<OperationalLog> {
    try {
      const logData = transformLogToDB(log);

      const { error } = await supabase
        .from('operational_logs')
        .update(logData)
        .eq('id', id);

      if (error) throw error;

      // Actualizar imágenes si se proporcionan
      if (log.images !== undefined) {
        await supabase.from('log_images').delete().eq('operational_log_id', id);
        if (log.images.length > 0) {
          await supabase.from('log_images').insert(
            log.images.map(url => ({
              operational_log_id: id,
              image_url: url,
            }))
          );
        }
      }

      return await this.getById(id) || log as OperationalLog;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar un log
  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('operational_logs')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },
};

// ============================================
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

function transformLogFromDB(data: any): OperationalLog {
  return {
    id: data.id,
    date: data.date,
    type: data.type as any,
    description: data.description,
    author: data.author,
    images: data.log_images?.map((img: any) => img.image_url) || [],
    responsibleIds: data.log_responsible?.map((r: any) => r.resource_id || r.management_staff_id).filter(Boolean) || [],
  };
}

function transformLogToDB(log: Partial<OperationalLog>, unitId?: string): any {
  return {
    unit_id: unitId,
    date: log.date,
    type: log.type,
    description: log.description,
    author: log.author,
  };
}

